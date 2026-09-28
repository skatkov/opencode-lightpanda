import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const opencode = Bun.which("opencode")
if (!opencode) throw new Error("OpenCode V2 must be on PATH to run the smoke test")

const scratch = join(tmpdir(), "opencode")
await mkdir(scratch, { recursive: true })
const project = await mkdtemp(join(scratch, "lightpanda-smoke-"))
let sessionID: string | undefined

try {
  await writeFile(
    join(project, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      plugins: [resolve(import.meta.dir, "..")],
      permissions: [{ action: "lightpanda", resource: "*", effect: "allow" }],
    }),
  )

  const command = [opencode, "run", "--standalone", "--format", "json", "--auto", "--title", "Lightpanda smoke test"]
  if (process.env.OPENCODE_SMOKE_DEBUG) command.push("--print-logs", "--log-level", "debug")
  if (process.env.OPENCODE_SMOKE_MODEL) command.push("--model", process.env.OPENCODE_SMOKE_MODEL)
  command.push(
    "Call the lightpanda tool once with url https://example.test/command, format json, timeout 2. Do not use other tools.",
  )

  const signal = AbortSignal.timeout(90_000)
  const child = Bun.spawn(command, {
    cwd: project,
    stdout: "pipe",
    stderr: "pipe",
    signal,
    // OpenCode uses PWD to select the location as well as the process working directory.
    env: { ...process.env, PWD: project, LIGHTPANDA_BIN: join(import.meta.dir, "fixtures/lightpanda") },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (signal.aborted) throw new Error("OpenCode smoke test timed out")

  const events = stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as RunEvent)
  sessionID = events.find((event) => event.sessionID)?.sessionID
  if (exitCode !== 0) {
    const error = events.find((event) => event.type === "error")?.error?.message
    throw new Error(`OpenCode exited with ${exitCode}: ${error ?? stderr.trim()}`)
  }

  const call = events.find((event) => {
    if (event.type !== "tool_use" || event.part?.state?.status !== "completed") return false
    return event.part.tool === "lightpanda" || event.part.state.metadata?.metadata?.toolCalls?.some(
      (tool) => tool.tool === "lightpanda" && tool.status === "completed",
    )
  })
  if (!call) {
    const tools = events.filter((event) => event.type === "tool_use").map((event) => ({
      tool: event.part?.tool,
      status: event.part?.state?.status,
      nested: event.part?.state?.metadata?.metadata?.toolCalls,
    }))
    const logs = stderr.split("\n").filter((line) => line.includes("loading plugin") || line.includes("failed to load plugin"))
    throw new Error(`OpenCode did not call lightpanda (session ${events[0]?.sessionID}; tools: ${JSON.stringify(tools)}; logs: ${logs.join("\n")})`)
  }

  const args = JSON.parse(call.part!.state!.output ?? "null") as unknown
  if (!Array.isArray(args) || args[0] !== "fetch" || args[1] !== "https://example.test/command") {
    throw new Error("Lightpanda did not return the expected fixture command")
  }
  if (args[args.indexOf("--dump") + 1] !== "semantic_tree" || args[args.indexOf("--terminate-ms") + 1] !== "2000") {
    throw new Error("Lightpanda did not receive the requested format and timeout")
  }

  console.log("OpenCode V2 loaded and executed lightpanda")
} finally {
  try {
    if (sessionID) {
      const cleanup = Bun.spawn([opencode, "session", "delete", "--standalone", sessionID], {
        cwd: project,
        env: { ...process.env, PWD: project },
        stdout: "ignore",
        stderr: "ignore",
      })
      if ((await cleanup.exited) !== 0) console.warn(`Could not remove smoke-test session ${sessionID}`)
    }
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

type RunEvent = {
  type: string
  sessionID?: string
  error?: { message?: string }
  part?: {
    tool?: string
    state?: {
      status?: string
      output?: string
      metadata?: { metadata?: { toolCalls?: { tool: string; status: string }[] } }
    }
  }
}
