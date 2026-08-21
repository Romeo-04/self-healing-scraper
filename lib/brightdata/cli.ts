import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { optionalEnv } from '../env.ts'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const run = promisify(execFile)

// On Windows, npx ships as a .cmd shim. Node hardened child_process against
// spawning .bat/.cmd files directly (the CVE-2024-27980 fix): doing so now
// throws `spawn EINVAL` unless shell:true is passed — and shell:true would
// require manually shell-escaping every argument, including free-form heal
// prompts, to stay safe. Instead resolve npx's own JS entry point (shipped
// beside node.exe) and run it directly through node — no shell, no escaping,
// and no CVE-restricted file type involved.
function resolveNpx(): { command: string; prefixArgs: string[] } {
  if (process.platform === 'win32') {
    const npxCliJs = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
    if (existsSync(npxCliJs)) return { command: process.execPath, prefixArgs: [npxCliJs] }
  }
  return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', prefixArgs: [] }
}

const { command: NPX, prefixArgs: NPX_PREFIX_ARGS } = resolveNpx()
const BASE = [...NPX_PREFIX_ARGS, '-p', '@brightdata/cli', 'bdata']
// The CLI falls back to batch mode when the account's realtime page quota is
// exhausted, and batch polls up to 3600 times. Five minutes killed a run at
// poll 28. Default generously; override per-environment if needed.
const TIMEOUT_MS = Number(optionalEnv('BDATA_TIMEOUT_MS', '1800000'))
// Any c_-prefixed collector id must never reach a log, transcript, or error.
const COLLECTOR_ID_PATTERN = /c_[a-z0-9]{8,}/gi
const MAX_BUFFER = 32 * 1024 * 1024

function redact(text: string): string {
  return text.replace(COLLECTOR_ID_PATTERN, '$COLLECTOR_ID')
}

export function extractJson(stdout: string): unknown {
  const firstArray = stdout.indexOf('[')
  const firstObject = stdout.indexOf('{')
  const candidates = [firstArray, firstObject].filter(i => i >= 0).sort((a, b) => a - b)
  for (const start of candidates) {
    for (let end = stdout.length; end > start; end--) {
      const ch = stdout[end - 1]
      if (ch !== ']' && ch !== '}') continue
      try {
        return JSON.parse(stdout.slice(start, end))
      } catch {
        // keep shrinking the window
      }
    }
  }
  // The vendor's JSON envelope can contain collector_id and a view_url that
  // embeds it -- redact before this ever reaches a log, transcript, or error.
  throw new Error(`no JSON found in CLI output: ${redact(stdout.slice(0, 200))}`)
}

async function bdata(args: string[]): Promise<string> {
  try {
    const { stdout } = await run(NPX, [...BASE, ...args], { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER })
    return stdout
  } catch (error) {
    // execFile attaches the entire command line to the error, collector id
    // included. Re-throw without it so a logged failure cannot leak credentials.
    const failure = error as { code?: string; killed?: boolean; stderr?: string }
    const cause = failure.killed === true ? `timed out after ${TIMEOUT_MS}ms` : (failure.code ?? 'failed')
    const tail = redact((failure.stderr ?? '').trim()).slice(-300)
    throw new Error(`bdata ${args.slice(0, 2).join(' ')} ${cause}: ${tail}`)
  }
}

export async function runCollector(collectorId: string, url: string): Promise<unknown[]> {
  const stdout = await bdata(['scraper', 'run', collectorId, url, '--pretty'])
  const payload = extractJson(stdout)
  if (!Array.isArray(payload)) throw new Error('collector did not return an array')
  return payload
}

export async function healCollector(
  collectorId: string, prompt: string, url: string,
): Promise<{ stdout: string }> {
  // deliberately no --auto-approve: the proposal must face the gate first
  return { stdout: await bdata(['scraper', 'heal', collectorId, prompt, '--url', url]) }
}

export async function approveProposal(collectorId: string, url: string): Promise<void> {
  await bdata(['scraper', 'approve', collectorId, '--url', url])
}

export async function rejectProposal(collectorId: string, url: string): Promise<void> {
  await bdata(['scraper', 'approve', collectorId, '--url', url, '--reject'])
}
