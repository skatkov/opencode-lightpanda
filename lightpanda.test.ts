import { expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"
import { lightpanda } from "./lightpanda"

process.env.LIGHTPANDA_BIN = `${import.meta.dir}/test/fixtures/lightpanda`

test("constructs the command and asks for lightpanda permission", async () => {
  let permission: Parameters<ToolContext["ask"]>[0] | undefined
  const result = await lightpanda.execute(
    { url: "https://example.test/command", format: "json", timeout: 1 },
    makeContext({ ask: async (input) => void (permission = input) }),
  )

  if (typeof result === "string") throw new Error("Expected a structured tool result")
  expect(JSON.parse(result.output)).toEqual([
    "fetch",
    "https://example.test/command",
    "--dump",
    "semantic_tree",
    "--json",
    "--wait-ms",
    "1000",
    "--http-max-response-size",
    "5242880",
    "--block-private-networks",
    "--log-level",
    "error",
  ])
  expect(permission?.permission).toBe("lightpanda")
})

test.each([
  ["rejects non-success HTTP statuses", "not-found", "markdown", 1, "HTTP 404", false],
  [
    "reports navigation failures independently of markdown output",
    "navigation-failed",
    "markdown",
    1,
    /^Navigation failed for https:\/\/example\.test\/navigation-failed$/,
    false,
  ],
  [
    "reports navigation failures independently of json output",
    "navigation-failed",
    "json",
    1,
    /^Navigation failed for https:\/\/example\.test\/navigation-failed$/,
    false,
  ],
  [
    "reports navigation failures independently of semantic_tree output",
    "navigation-failed",
    "semantic_tree",
    1,
    /^Navigation failed for https:\/\/example\.test\/navigation-failed$/,
    false,
  ],
  ["rejects malformed JSON", "malformed", "markdown", 1, "invalid JSON", false],
  ["rejects oversized output", "oversized", "markdown", 1, "Response too large", false],
  ["times out the Lightpanda process", "slow", "markdown", 0.01, "Request timed out after 0.01 seconds", false],
  ["aborts the Lightpanda process", "slow", "markdown", 1, "Request aborted", true],
] as const)("%s", (_, path, format, timeout, error, abort) => {
  const controller = new AbortController()
  const request = lightpanda.execute(
    { url: `https://example.test/${path}`, format, timeout },
    makeContext({ abort: controller.signal }),
  )
  if (abort) setTimeout(() => controller.abort(), 10)
  return expect(request).rejects.toThrow(error)
})

function makeContext({
  ask = async () => {},
  abort = new AbortController().signal,
}: { ask?: ToolContext["ask"]; abort?: AbortSignal } = {}) {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory: process.cwd(),
    worktree: process.cwd(),
    abort,
    metadata() {},
    ask,
  } satisfies ToolContext
}
