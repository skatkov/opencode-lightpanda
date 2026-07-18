# opencode-lightpanda
A Lightpanda browser plugin/tool for OpenCode. It is like WebFetch tool on steroids.

## Features

- Headless
- 10x faster than headless Chrome, 16x less memory
- Returns markdown pages without ads or clutter
- Can also extract JSON data
- Handles JS-heavy websites like a pro

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

Load the checkout directly by adding it to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["file:///absolute/path/to/opencode-lightpanda/lightpanda.ts"]
}
```

## Config
The tools can be controlled independently:

```json
{
  "permission": {
    "webfetch": "deny",
    "lightpanda": "allow"
  }
}
```
