import type { Plugin } from "@opencode-ai/plugin"
import lightpanda from "./lightpanda"

export default (async () => ({
  tool: { lightpanda },
})) satisfies Plugin
