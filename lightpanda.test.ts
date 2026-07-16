import { afterAll, beforeAll, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"
import lightpanda from "./lightpanda"

const originalBinary = process.env.LIGHTPANDA_BIN

beforeAll(() => {
  process.env.LIGHTPANDA_BIN = `${import.meta.dir}/test/fixtures/lightpanda`
})

afterAll(() => {
  if (originalBinary === undefined) delete process.env.LIGHTPANDA_BIN
  else process.env.LIGHTPANDA_BIN = originalBinary
})

test("constructs the command and asks for lightpanda permission", async () => {
  let permission: Parameters<ToolContext["ask"]>[0] | undefined
  const result = await lightpanda.execute(
    { url: "https://example.test/command", format: "semantic_tree_text", timeout: 1 },
    makeContext({ ask: async (input) => void (permission = input) }),
  )

  if (typeof result === "string") throw new Error("Expected a structured tool result")
  expect(JSON.parse(result.output)).toEqual([
    "fetch",
    "https://example.test/command",
    "--dump",
    "semantic_tree_text",
    "--json",
    "--wait-ms",
    "1000",
    "--terminate-ms",
    "1000",
    "--http-connect-timeout",
    "1000",
    "--http-timeout",
    "1000",
    "--http-max-response-size",
    "5242880",
    "--block-private-networks",
    "--log-level",
    "error",
  ])
  expect(permission?.permission).toBe("lightpanda")
})

test("rejects non-success HTTP statuses", () => {
  const request = lightpanda.execute(
    { url: "https://example.test/not-found", format: "markdown", timeout: 1 },
    makeContext(),
  )
  return expect(request).rejects.toThrow("HTTP 404")
})

test("rejects malformed JSON", () => {
  const request = lightpanda.execute(
    { url: "https://example.test/malformed", format: "markdown", timeout: 1 },
    makeContext(),
  )
  return expect(request).rejects.toThrow("invalid JSON")
})

test("rejects oversized output", () => {
  const request = lightpanda.execute(
    { url: "https://example.test/oversized", format: "markdown", timeout: 1 },
    makeContext(),
  )
  return expect(request).rejects.toThrow("Response too large")
})

test("times out the Lightpanda process", () => {
  const request = lightpanda.execute(
    { url: "https://example.test/slow", format: "markdown", timeout: 0.01 },
    makeContext(),
  )
  return expect(request).rejects.toThrow("Request timed out after 0.01 seconds")
})

test("aborts the Lightpanda process", () => {
  const controller = new AbortController()
  const request = lightpanda.execute(
    { url: "https://example.test/slow", format: "markdown", timeout: 1 },
    makeContext({ abort: controller.signal }),
  )
  setTimeout(() => controller.abort(), 10)
  return expect(request).rejects.toThrow("Request aborted")
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
