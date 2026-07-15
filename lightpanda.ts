import { tool } from "@opencode-ai/plugin"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_SECONDS = 30
const MAX_TIMEOUT_SECONDS = 120

const responseSchema = tool.schema.object({
  url: tool.schema.string(),
  http_status: tool.schema.number(),
  headers: tool.schema.array(tool.schema.object({ name: tool.schema.string(), value: tool.schema.string() })),
  content: tool.schema.string(),
})

export default tool({
  description: `Fetch a URL with Lightpanda and return its JavaScript-rendered content.
Supports markdown, HTML, and semantic tree dumps without graphical rendering.`,
  args: {
    url: tool.schema.string().describe("The fully qualified HTTP or HTTPS URL to fetch"),
    format: tool.schema
      .enum(["markdown", "html", "semantic_tree", "semantic_tree_text"])
      .optional()
      .describe("The Lightpanda dump format. Defaults to markdown."),
    timeout: tool.schema
      .number()
      .positive()
      .max(MAX_TIMEOUT_SECONDS)
      .optional()
      .describe("Timeout in seconds (max 120)"),
  },
  async execute(args, context) {
    const url = new URL(args.url)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("URL must start with http:// or https://")
    }

    const format = args.format ?? "markdown"
    const timeoutSeconds = Math.min(args.timeout ?? DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
    const timeoutMs = Math.ceil(timeoutSeconds * 1000)

    await context.ask({
      permission: "lightpanda",
      patterns: [args.url],
      always: ["*"],
      metadata: { url: args.url, format, timeout: args.timeout },
    })

    const binary = process.env.LIGHTPANDA_BIN || Bun.which("lightpanda")
    if (!binary) {
      throw new Error("Lightpanda is not installed or is not on PATH. Set LIGHTPANDA_BIN to its executable path.")
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = AbortSignal.any([context.abort, timeoutSignal])
    const command = [
      binary,
      "fetch",
      url.href,
      "--dump",
      format,
      "--json",
      "--wait-ms",
      timeoutMs.toString(),
      "--terminate-ms",
      timeoutMs.toString(),
      "--http-connect-timeout",
      timeoutMs.toString(),
      "--http-timeout",
      timeoutMs.toString(),
      "--http-max-response-size",
      MAX_RESPONSE_SIZE.toString(),
      "--block-private-networks",
      "--log-level",
      "error",
    ]
    let result = await run(command, signal)
    if (format === "markdown" && result.exitCode === 0 && !result.stdout.trim()) {
      const wait = command.indexOf("--wait-ms")
      result = await run([...command.slice(0, wait), ...command.slice(wait + 2), "--wait-until", "networkidle"], signal)
    }

    const { stdout, stderr, exitCode } = result
    if (context.abort.aborted) throw new Error("Request aborted")
    if (timeoutSignal.aborted) throw new Error(`Request timed out after ${timeoutSeconds} seconds`)
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

async function run(command: string[], signal: AbortSignal) {
  const child = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
    signal,
    env: {
      ...process.env,
      LIGHTPANDA_DISABLE_TELEMETRY: process.env.LIGHTPANDA_DISABLE_TELEMETRY ?? "true",
    },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, exitCode }
}

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
