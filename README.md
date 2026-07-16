# opencode-lightpanda
A Lightpanda browser plugin/tool for OpenCode. Lightpanda browser is like WebFetch tool on steroids.

## Features
- Headless
- 10x faster than headless Chrome, 16x less memory
- Return markdown page without ads or clutter
- Also returns extracted JSON data
- Handles JS heavy websites like a pro

## Requirements

- [OpenCode](https://opencode.ai/)
- [Lightpanda](https://lightpanda.io/docs/run-locally/installation/one-liner)
- [Bun](https://bun.sh/) for development and tests

## Install

Install Lightpanda, then install the plugin globally:

```sh
opencode plugin -g opencode-lightpanda@latest
```

To update an existing installation:

```sh
opencode plugin -g -f opencode-lightpanda@latest
```

Quit and restart OpenCode. The built-in `webfetch` tool remains unchanged.

If OpenCode cannot find Lightpanda, start it with `LIGHTPANDA_BIN` set to the executable's absolute path.

## Usage

```ts
lightpanda({
  url: "https://example.com",
  format: "markdown",
  timeout: 30,
})
```

Available formats are `markdown`, `json`, and `semantic_tree`. `json` is an alias for `semantic_tree`.

## Local Development

```sh
bun install
bun run check
bun test
```

Load the checkout directly by adding it to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["file:///absolute/path/to/opencode-lightpanda/lightpanda.ts"]
}
```

## Behavior

- Adds a distinct `lightpanda` tool with its own URL permission.
- Returns an error for non-2xx responses and responses over 5 MB.
- Blocks private-network requests, including subresources initiated by page JavaScript.
- Disables Lightpanda telemetry unless `LIGHTPANDA_DISABLE_TELEMETRY` is already set.
- Starts a fresh Lightpanda process for every call, so cookies and browser state are not retained.

This intentionally does not include web search, stateful CDP sessions, or browser interaction tools. Lightpanda's MCP server already covers those use cases without expanding a fetch replacement into a second browser harness.

The tools can be controlled independently:

```json
{
  "permission": {
    "webfetch": "deny",
    "lightpanda": "allow"
  }
}
```
