import { expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import type { Info, ToolContext, ToolEditor } from "@opencode/plugin/promise/tool"
import plugin from "./index"

process.env.LIGHTPANDA_BIN = `${import.meta.dir}/test/fixtures/lightpanda`

const tools: Info[] = []
await plugin.setup({
  tool: {
    async transform(callback: (editor: ToolEditor) => void) {
      callback({ add: (tool: Info) => void tools.push(tool) } as ToolEditor)
      return { async dispose() {} }
    },
  },
} as Plugin.Context)
const lightpanda = tools[0]!

test("registers the V2 lightpanda tool and permission action", () => {
  expect(plugin.id).toBe("opencode-lightpanda")
  expect(tools).toHaveLength(1)
  expect(lightpanda.name).toBe("lightpanda")
  expect(lightpanda.options?.permission).toBe("lightpanda")
  expect(lightpanda.input).toMatchObject({
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string", format: "uri", pattern: "^https?://" },
      format: { enum: ["markdown", "json", "semantic_tree"] },
      timeout: { exclusiveMinimum: 0, maximum: 120 },
    },
  })
})

test("constructs the command and returns V2 content and metadata", async () => {
  const result = await lightpanda.execute(
    { url: "https://example.test/command", format: "json", timeout: 2 },
    makeContext(),
  )

  if (typeof result.content !== "string") throw new Error("Expected text content")
  expect(JSON.parse(result.content)).toEqual([
    "fetch",
    "https://example.test/command",
    "--dump",
    "semantic_tree",
    "--json",
    "--wait-until",
    "networkalmostidle",
    "--terminate-ms",
    "2000",
    "--http-max-response-size",
    "5242880",
    "--block-private-networks",
    "--log-level",
    "error",
    "--log-filter",
    "note",
  ])
  expect(result.metadata).toEqual({
    backend: "lightpanda",
    format: "json",
    httpStatus: 200,
    url: "https://example.test/command",
    contentType: "text/plain",
  })
})

test("defaults to markdown and a 30-second timeout", async () => {
  const result = await lightpanda.execute({ url: "https://example.test/command" }, makeContext())
  if (typeof result.content !== "string") throw new Error("Expected text content")
  const args = JSON.parse(result.content) as string[]
  expect(args.slice(args.indexOf("--dump"), args.indexOf("--json"))).toEqual(["--dump", "markdown"])
  expect(args[args.indexOf("--terminate-ms") + 1]).toBe("30000")
})

test.each(["file:///etc/passwd", "not-a-url"])("rejects non-HTTP URLs: %s", (url) => {
  return expect(lightpanda.execute({ url }, makeContext())).rejects.toThrow("fully qualified HTTP or HTTPS URL")
})

test.each([
  ["rejects non-success HTTP statuses", "not-found", 1, "HTTP 404", false],
  ["rejects malformed JSON", "malformed", 1, "invalid JSON", false],
  ["rejects oversized output", "oversized", 1, "Response too large", false],
  ["times out the Lightpanda process", "slow", 0.01, "Request timed out after 0.01 seconds", false],
  ["aborts the Lightpanda process", "slow", 1, "Request aborted", true],
] as const)("%s", (_, path, timeout, error, abort) => {
  const request = lightpanda.execute(
    { url: `https://example.test/${path}`, timeout },
    makeContext(abort ? AbortSignal.timeout(10) : undefined),
  )
  return expect(request).rejects.toThrow(error)
})

function makeContext(signal = new AbortController().signal): ToolContext {
  return {
    sessionID: "test" as ToolContext["sessionID"],
    messageID: "test" as ToolContext["messageID"],
    agent: "test" as ToolContext["agent"],
    id: "test" as ToolContext["id"],
    signal,
    async progress() {},
  }
}
