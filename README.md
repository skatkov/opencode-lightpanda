# opencode-lightpanda
A Lightpanda browser plugin/tool for OpenCode. It is like WebFetch tool on steroids.

## Features

- Headless
- 10x faster than headless Chrome, 16x less memory
- Returns markdown pages without ads or clutter
- Can also extract JSON data
- Handles JS-heavy websites like a pro

## Requirements

- [OpenCode V2](https://opencode.ai/v2/docs/) (2.0.18 or newer)
- [Lightpanda](https://lightpanda.io/docs/run-locally/installation/one-liner)
- [Bun](https://bun.sh/) for development and tests

## Install

Install Lightpanda, then add the plugin globally:

```sh
opencode plugin add opencode-lightpanda@latest
```

To update an existing installation:

```sh
opencode plugin update opencode-lightpanda
```

Quit and restart OpenCode. 

If OpenCode cannot find Lightpanda, start it with `LIGHTPANDA_BIN` set to the executable's absolute path.

## Usage
Starts a fresh Lightpanda process for every call, so cookies and browser state are not retained.

```ts
lightpanda({
  url: "https://example.com",
  format: "markdown",
  timeout: 30,
})
```

Available formats are `markdown`, `json`, and `semantic_tree`.

## Local Development

```sh
bun install
bun run check
bun test
```

For an end-to-end smoke test, run `bun run test:smoke`. It requires OpenCode V2 on `PATH` and a working default model (or set `OPENCODE_SMOKE_MODEL=provider/model#variant`). The test starts a private OpenCode server in a temporary project, loads this checkout, and calls the tool using the bundled Lightpanda fixture. It does not need network access to fetch a page, but it does make a model request, so it is not part of the regular test suite or CI.

Load the checkout directly by adding it to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-lightpanda"]
}
```

## Behavior

- Adds a distinct `lightpanda` tool with its own permission action.
- Returns an error for non-2xx responses and responses over 5 MB.
- Blocks private-network requests, including subresources initiated by page JavaScript.
- Disables Lightpanda telemetry unless `LIGHTPANDA_DISABLE_TELEMETRY` is already set.

This intentionally does not include web search, stateful CDP sessions, or browser interaction tools. Lightpanda's MCP server already covers those use cases without expanding a fetch replacement into a second browser harness.

## Config

The tools can be controlled independently. To request approval before using Lightpanda, configure V2 permissions:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permissions": [
    { "action": "webfetch", "resource": "*", "effect": "deny" },
    { "action": "lightpanda", "resource": "*", "effect": "ask" }
  ]
}
```

V2 custom tool permissions apply to the tool as a whole (`resource: "*"`); unlike the V1 plugin, it cannot request approval for each individual URL. Without an explicit rule, V2's default policy allows the tool. Set `effect` to `allow` or `deny` instead of `ask` to change that behavior.
