import plugin from "../../../index"

// Keep a globally installed copy from shadowing the checkout under test.
export default { ...plugin, id: "opencode-lightpanda-smoke" }
