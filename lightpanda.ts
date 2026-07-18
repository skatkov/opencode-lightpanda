import { tool, type Plugin } from "@opencode-ai/plugin"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024
const MAX_TIMEOUT_SECONDS = 120
const PROCESS_GRACE_MS = 1_000

const responseSchema = tool.schema.object({
  url: tool.schema.string(),
  http_status: tool.schema.number(),
  headers: tool.schema.array(tool.schema.object({ name: tool.schema.string(), value: tool.schema.string() })),
  content: tool.schema.string(),
})

const lightpanda = tool({
  description: `Fetch a URL with Lightpanda browser to extract content as markdown or json.
For web searches, use html.duckduckgo.com instead of Google because Google blocks Lightpanda due to browser fingerprinting.`,
  args: {
    url: tool.schema.url({ protocol: /^https?$/, normalize: true }).describe("The fully qualified HTTP or HTTPS URL to fetch"),
    format: tool.schema
      .enum(["markdown", "json", "semantic_tree"])
      .optional()
      .describe("The output format. Defaults to markdown."),
    timeout: tool.schema
      .number()
      .positive()
      .max(MAX_TIMEOUT_SECONDS)
      .optional()
      .describe("Timeout in seconds (max 120)"),
  },
  async execute({ url, format = "markdown", timeout = 30 }, context) {
    const timeoutMs = Math.ceil(timeout * 1000)
    const dump = format === "json" ? "semantic_tree" : format

    await context.ask({
      permission: "lightpanda",
      patterns: [url],
      always: ["*"],
      metadata: { url, format, timeout },
    })

    const binary = process.env.LIGHTPANDA_BIN || Bun.which("lightpanda")
    if (!binary) {
      throw new Error("Lightpanda is not installed or is not on PATH. Set LIGHTPANDA_BIN to its executable path.")
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs + PROCESS_GRACE_MS)
    const signal = AbortSignal.any([context.abort, timeoutSignal])
    const command = [
      binary,
      "fetch",
      url,
      "--dump",
      dump,
      "--json",
      "--wait-until",
      "networkalmostidle",
      "--terminate-ms",
      timeoutMs.toString(),
      "--http-max-response-size",
      MAX_RESPONSE_SIZE.toString(),
      "--block-private-networks",
      "--log-level",
      "error",
    ]
    const child = Bun.spawn(command, {
      stderr: "pipe",
      signal,
      env: {
        ...process.env,
        LIGHTPANDA_DISABLE_TELEMETRY: process.env.LIGHTPANDA_DISABLE_TELEMETRY ?? "true",
      },
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      (child.stdout as typeof child.stdout & { text(): Promise<string> }).text(),
      (child.stderr as typeof child.stderr & { text(): Promise<string> }).text(),
      child.exited,
    ])
    if (context.abort.aborted) throw new Error("Request aborted")
    if (timeoutSignal.aborted) throw new Error(`Request timed out after ${timeout} seconds`)
    if (exitCode !== 0) throw new Error(stderr.trim() || `Lightpanda exited with status ${exitCode}`)
    if (Buffer.byteLength(stdout) > MAX_RESPONSE_SIZE) {
      throw new Error("Response too large (exceeds 5MB limit)")
    }

    const response = parseResponse(stdout)
    if (response.http_status < 200 || response.http_status >= 300) {
      throw new Error(`Request failed with HTTP ${response.http_status}`)
    }

    const contentType = response.headers.find((header) => header.name.toLowerCase() === "content-type")?.value ?? ""
    return {
      title: `${response.url} (${contentType})`,
      output: response.content,
      metadata: { backend: "lightpanda", format, httpStatus: response.http_status },
    }
  },
})

function parseResponse(output: string) {
  let response
  try {
    response = responseSchema.safeParse(JSON.parse(output))
  } catch {
    throw new Error("Lightpanda returned invalid JSON")
  }

  if (!response.success) throw new Error("Lightpanda returned an unexpected response")
  return response.data
}

export default (async () => ({
  tool: { lightpanda },
})) satisfies Plugin
