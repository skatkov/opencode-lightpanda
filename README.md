# opencode-lightpanda
A Lightpanda browser plugin/tool for OpenCode V2. It is like WebFetch tool on steroids.

> **Breaking change in 1.0: OpenCode V2 migration.** Version 1.0.0 and newer require OpenCode V2 (2.0.18 or newer) and do not support OpenCode V1. If you are staying on V1, pin `opencode-lightpanda@0.2.2` instead of using `latest`.

| Plugin version | Supported OpenCode version |
| --- | --- |
| `1.x` | OpenCode V2, 2.0.18 or newer |
| `0.2.2` | OpenCode V1 |

See [Migrating from 0.x](#migrating-from-0x) and the [release notes](CHANGELOG.md).

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
opencode plugin add opencode-lightpanda@1.0.1
```

To update an existing installation:

```sh
opencode plugin update opencode-lightpanda
```

Quit and restart OpenCode. 

If OpenCode cannot find Lightpanda, start it with `LIGHTPANDA_BIN` set to the executable's absolute path.

## Migrating from 0.x

1. Upgrade to [OpenCode V2](https://opencode.ai/v2/docs/migrate-v1) (2.0.18 or newer) before upgrading this plugin. The 1.x plugin uses the new `@opencode/plugin` API; it cannot run in OpenCode V1.
2. Install `opencode-lightpanda@1.0.1` with the command above. For a configuration-managed installation, replace any pinned 0.x package entry with the V2 package:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": ["opencode-lightpanda@^1.0.0"]
   }
   ```

3. Review your permissions. V2 controls the `lightpanda` tool as a whole, not each URL. To retain explicit approval, use `{ "action": "lightpanda", "resource": "*", "effect": "ask" }` in the `permissions` array; see [Config](#config).
4. Quit and restart OpenCode. The tool is still named `lightpanda`, with the same `url`, `format`, and `timeout` inputs.

If you need to remain on OpenCode V1, keep the old plugin pinned in your V1 configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-lightpanda@0.2.2"]
}
```

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

- Adds a directly callable `lightpanda` tool with its own permission action; no Code Mode `execute` wrapper is required.
- Returns an error for non-2xx responses and responses over 5 MB.
- Reports concise TLS/DNS fetch failures from Lightpanda's JSON diagnostics, with a bounded stderr fallback.
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
