import { tool, type Plugin } from "@opencode-ai/plugin"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024
const MAX_TIMEOUT_SECONDS = 120
const PROCESS_GRACE_MS = 1_000

// Vendored from https://www.google.com/supported_domains on 2026-07-17.
const GOOGLE_SEARCH_DOMAINS = `google.com google.ad google.ae google.com.af google.com.ag google.al google.am google.co.ao google.com.ar google.as
google.at google.com.au google.az google.ba google.com.bd google.be google.bf google.bg google.com.bh google.bi
google.bj google.com.bn google.com.bo google.com.br google.bs google.bt google.co.bw google.by google.com.bz google.ca
google.cd google.cf google.cg google.ch google.ci google.co.ck google.cl google.cm google.cn google.com.co
google.co.cr google.com.cu google.cv google.com.cy google.cz google.de google.dj google.dk google.dm google.com.do
google.dz google.com.ec google.ee google.com.eg google.es google.com.et google.fi google.com.fj google.fm google.fr
google.ga google.ge google.gg google.com.gh google.com.gi google.gl google.gm google.gr google.com.gt google.gy
google.com.hk google.hn google.hr google.ht google.hu google.co.id google.ie google.co.il google.im google.co.in
google.iq google.is google.it google.je google.com.jm google.jo google.co.jp google.co.ke google.com.kh google.ki
google.kg google.co.kr google.com.kw google.kz google.la google.com.lb google.li google.lk google.co.ls google.lt
google.lu google.lv google.com.ly google.co.ma google.md google.me google.mg google.mk google.ml google.com.mm
google.mn google.com.mt google.mu google.mv google.mw google.com.mx google.com.my google.co.mz google.com.na google.com.ng
google.com.ni google.ne google.nl google.no google.com.np google.nr google.nu google.co.nz google.com.om google.com.pa
google.com.pe google.com.pg google.com.ph google.com.pk google.pl google.pn google.com.pr google.ps google.pt google.com.py
google.com.qa google.ro google.ru google.rw google.com.sa google.com.sb google.sc google.se google.com.sg google.sh
google.si google.sk google.com.sl google.sn google.so google.sm google.sr google.st google.com.sv google.td
google.tg google.co.th google.com.tj google.tl google.tm google.tn google.to google.com.tr google.tt google.com.tw
google.co.tz google.com.ua google.co.ug google.co.uk google.com.uy google.co.uz google.com.vc google.co.ve google.co.vi google.com.vn
google.vu google.ws google.rs google.co.za google.co.zm google.co.zw google.cat`.split(/\s+/)
const GOOGLE_SEARCH_HOSTNAMES = new Set(GOOGLE_SEARCH_DOMAINS.flatMap((domain) => [domain, `www.${domain}`]))

function resolveUrl(requestedUrl: string) {
  const requested = new URL(requestedUrl)
  const query = requested.searchParams.get("q")
  if (requested.pathname === "/search" && GOOGLE_SEARCH_HOSTNAMES.has(requested.hostname.replace(/\.$/, "")) && query) {
    const target = new URL("https://html.duckduckgo.com/html/")
    target.searchParams.set("q", query)
    return { requestedUrl, targetUrl: target.href }
  }

  return { requestedUrl, targetUrl: requestedUrl }
}

const responseSchema = tool.schema.object({
  url: tool.schema.string(),
  http_status: tool.schema.number(),
  headers: tool.schema.array(tool.schema.object({ name: tool.schema.string(), value: tool.schema.string() })),
  content: tool.schema.string(),
})

const lightpanda = tool({
  description:
    "Fetch a URL with Lightpanda browser to extract content as markdown or json. Google Search URLs are fetched through DuckDuckGo HTML.",
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
    const waitMs = Math.max(1, timeoutMs - PROCESS_GRACE_MS)
    const dump = format === "json" ? "semantic_tree" : format
    const { requestedUrl, targetUrl } = resolveUrl(url)

    await context.ask({
      permission: "lightpanda",
      patterns: [targetUrl],
      always: ["*"],
      metadata: { requestedUrl, targetUrl, format, timeout },
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
      targetUrl,
      "--dump",
      dump,
      "--json",
      "--wait-until",
      "networkalmostidle",
      "--wait-ms",
      waitMs.toString(),
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
    if (
      new URL(targetUrl).hostname === "html.duckduckgo.com" &&
      response.content.includes("Unfortunately, bots use DuckDuckGo too.")
    ) {
      throw new Error("DuckDuckGo returned a bot challenge")
    }

    const contentType = response.headers.find((header) => header.name.toLowerCase() === "content-type")?.value ?? ""
    return {
      title: `${response.url} (${contentType})`,
      output: response.content,
      metadata: { backend: "lightpanda", format, httpStatus: response.http_status, requestedUrl, targetUrl },
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
