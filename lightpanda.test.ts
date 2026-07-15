import { expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"
import lightpanda from "./lightpanda"

test("fetches rendered markdown and asks for lightpanda permission", async () => {
  let permission: Parameters<ToolContext["ask"]>[0] | undefined
  const result = await lightpanda.execute(
    { url: "https://demo-browser.lightpanda.io/campfire-commerce/", format: "markdown", timeout: 10 },
    makeContext(async (input) => {
      permission = input
    }),
  )

  expect(result).toMatchObject({ output: expect.stringContaining("Outdoor Odyssey Nomad Backpack") })
  expect(permission?.permission).toBe("lightpanda")
})

test("returns a semantic tree", async () => {
  const result = await lightpanda.execute(
    { url: "https://example.com", format: "semantic_tree_text", timeout: 10 },
    makeContext(),
  )

  expect(result).toMatchObject({ output: expect.stringContaining("RootWebArea 'Example Domain'") })
})

test("rejects non-success HTTP statuses", async () => {
  const request = lightpanda.execute(
    { url: "https://example.com/not-found", format: "markdown", timeout: 10 },
    makeContext(),
  )
  await expect(request).rejects.toThrow("HTTP 404")
})

function makeContext(ask: ToolContext["ask"] = async () => {}) {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory: process.cwd(),
    worktree: process.cwd(),
    abort: new AbortController().signal,
    metadata() {},
    ask,
  } satisfies ToolContext
}
