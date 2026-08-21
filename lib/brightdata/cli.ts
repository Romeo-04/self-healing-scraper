import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

// On Windows, execFile without a shell cannot launch npx (a .cmd shim).
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const BASE = ['-p', '@brightdata/cli', 'bdata']
const TIMEOUT_MS = 300_000
const MAX_BUFFER = 32 * 1024 * 1024

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
  throw new Error(`no JSON found in CLI output: ${stdout.slice(0, 200)}`)
}

async function bdata(args: string[]): Promise<string> {
  const { stdout } = await run(NPX, [...BASE, ...args], { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER })
  return stdout
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
