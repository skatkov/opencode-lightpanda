import { expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"
import plugin, { resolveUrl } from "./lightpanda"

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

test("rewrites Google searches to DuckDuckGo", async () => {
  const requestedUrl = "https://www.google.co.uk/search?q=lightpanda+browser&source=hp"
  const targetUrl = "https://html.duckduckgo.com/html/?q=lightpanda+browser"
  let permission: Parameters<ToolContext["ask"]>[0] | undefined
  const result = await lightpanda.execute(
    { url: requestedUrl, timeout: 2 },
    makeContext({ ask: async (input) => void (permission = input) }),
  )

  if (typeof result === "string") throw new Error("Expected a structured tool result")
  expect(resolveUrl(requestedUrl)).toEqual({ requestedUrl, targetUrl })
  expect(permission?.patterns).toEqual([targetUrl])
  expect(permission?.metadata).toMatchObject({ requestedUrl, targetUrl })
  expect(result.title).toStartWith(targetUrl)
  expect(result.metadata).toMatchObject({ requestedUrl, targetUrl })
})

test.each([
  ["http", "google.com"],
  ["https", "google.com"],
  ["http", "www.google.com"],
  ["https", "www.google.com"],
  ["http", "google.co.uk"],
  ["https", "google.co.uk"],
  ["http", "www.google.co.uk"],
  ["https", "www.google.co.uk"],
] as const)("rewrites %s://%s searches", (scheme, hostname) => {
  const requestedUrl = `${scheme}://${hostname}/search?q=lightpanda+browser&source=hp`
  expect(resolveUrl(requestedUrl).targetUrl).toBe("https://html.duckduckgo.com/html/?q=lightpanda+browser")
})

test.each([
  "http://google.localhost/search?q=confidential",
  "https://google.com.example/search?q=confidential",
  "https://www.google.com.evil/search?q=confidential",
])("does not rewrite unsupported Google-like URL %s", async (url) => {
  let permission: Parameters<ToolContext["ask"]>[0] | undefined
  await lightpanda.execute({ url, timeout: 2 }, makeContext({ ask: async (input) => void (permission = input) }))
  expect(permission?.patterns).toEqual([url])
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
