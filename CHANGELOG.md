# Changelog

## 1.0.1 — Direct tool access

### Fixes

- Restores `lightpanda` as a directly callable tool in OpenCode V2 by explicitly setting `codemode: false`. Previously, the V2 migration left it behind `execute`, unlike the built-in WebFetch tool.
- Keeps the existing tool name, inputs, permission action, and fetch behavior unchanged.

### Tests

- Adds a regression test requiring direct tool exposure.
- Tightens the OpenCode V2 smoke test to require a direct `lightpanda` call rather than accepting a nested Code Mode invocation.
- Gives the smoke test a distinct plugin ID so a globally installed copy cannot shadow the checkout under test.

## 1.0.0 — OpenCode V2 migration

This is the first published release for **OpenCode V2**. The major version marks a breaking plugin API migration, not a change to the Lightpanda tool's name or inputs.

### Breaking changes

- Requires OpenCode V2 **2.0.18 or newer**. OpenCode V1 is no longer supported by this release; V1 users must pin `opencode-lightpanda@0.2.2` rather than `latest`.
- Migrates from `@opencode-ai/plugin` to `@opencode/plugin`, using `Plugin.define`, V2 tool registration, JSON Schema inputs, and structured tool content.
- Permissions apply to the `lightpanda` tool as a whole. V1's per-URL approval requests are no longer available; configure a V2 `lightpanda` permission rule if approval is required.

### Improvements

- Reports concise TLS and DNS failures from Lightpanda's structured diagnostics, with a bounded stderr fallback.
- Suppresses Lightpanda startup notices while retaining fetch errors.
- Adds an opt-in end-to-end smoke test that loads and executes the plugin in OpenCode V2.
- Adds GitHub Actions trusted publishing with npm provenance, without an npm publishing token.

### Upgrade

Upgrade OpenCode to V2 first, then install the plugin and restart OpenCode:

```sh
opencode plugin add opencode-lightpanda@1.0.0
```

See [Migrating from 0.x](README.md#migrating-from-0x) for configuration and permission changes.
