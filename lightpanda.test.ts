import { expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"
import plugin from "./lightpanda"

process.env.LIGHTPANDA_BIN = `${import.meta.dir}/test/fixtures/lightpanda`
const { lightpanda } = (await plugin()).tool

test("constructs the command and asks for lightpanda permission", async () => {
  let permission: Parameters<ToolContext["ask"]>[0] | undefined
  const result = await lightpanda.execute(
    { url: "https://example.test/command", format: "json", timeout: 2 },
    makeContext({ ask: async (input) => void (permission = input) }),
  )

  if (typeof result === "string") throw new Error("Expected a structured tool result")
  expect(JSON.parse(result.output)).toEqual([
    "fetch",
    "https://example.test/command",
    "--dump",
    "semantic_tree",
    "--json",
    "--wait-until",
    "networkalmostidle",
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
  ["apex", "http://google.com/search?q=x", "https://html.duckduckgo.com/html/?q=x"],
  ["www", "https://www.google.com/search?q=x", "https://html.duckduckgo.com/html/?q=x"],
  ["country apex", "https://google.co.uk/search?q=x", "https://html.duckduckgo.com/html/?q=x"],
  ["country www", "https://www.google.co.jp/search?q=x", "https://html.duckduckgo.com/html/?q=x"],
  ["trailing dot", "https://www.google.com./search?q=x", "https://html.duckduckgo.com/html/?q=x"],
  ["lookalike TLD", "http://google.localhost/search?q=x", "http://google.localhost/search?q=x"],
  ["lookalike suffix", "https://google.com.example/search?q=x", "https://google.com.example/search?q=x"],
  ["lookalike subdomain", "https://www.google.com.evil/search?q=x", "https://www.google.com.evil/search?q=x"],
  ["unsupported path", "https://google.com/images?q=x", "https://google.com/images?q=x"],
  ["search subpath", "https://google.com/search/results?q=x", "https://google.com/search/results?q=x"],
] as const)("routes %s Google boundary", async (_, requestedUrl, targetUrl) => {
  let permission: Parameters<ToolContext["ask"]>[0] | undefined
  const result = await lightpanda.execute(
    { url: requestedUrl, timeout: 2 },
    makeContext({ ask: async (input) => void (permission = input) }),
  )

  if (typeof result === "string") throw new Error("Expected a structured tool result")
  expect(permission?.patterns).toEqual([targetUrl])
  expect(permission?.metadata).toMatchObject({ requestedUrl, targetUrl })
  expect(result.title).toStartWith(targetUrl)
  expect(result.metadata).toMatchObject({ requestedUrl, targetUrl })
})

test("rejects DuckDuckGo 202 bot challenges", () => {
  const request = lightpanda.execute(
    { url: "https://www.google.com/search?q=challenge", timeout: 2 },
    makeContext(),
  )
  return expect(request).rejects.toThrow("DuckDuckGo returned a bot challenge")
})

test.each(["tbm=nws", "safe=active", "start=20", "q=y"])("rejects unsupported Google Search parameter %s", (parameter) => {
  const request = lightpanda.execute(
    { url: `https://www.google.com/search?q=x&${parameter}`, timeout: 2 },
    makeContext(),
  )
  return expect(request).rejects.toThrow("Unsupported Google Search parameters; only q is supported")
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
    makeContext({ abort: abort ? AbortSignal.timeout(10) : undefined }),
  )
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
