// Linux support: runs Ashita (and through it xiloader and the game) with Wine.
//
// - Finds Wine builds: system wine, Lutris runners, GE-Proton / Proton (Steam, including Steam Deck).
// - Keeps a dedicated Wine prefix inside the install folder, created on first launch.
// - Converts Linux paths to the Z:\ paths Windows programs see under Wine.
// No Electron imports, so this can be unit-tested with plain Node.

import { execFile, spawn } from 'node:child_process'
import { createWriteStream, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join, sep } from 'node:path'
import type { WineRunner, WineSettings } from '../shared/types'

export const isWindows = process.platform === 'win32'

/** Linux path -> path a Windows program running under Wine understands (Wine maps Z: to /). */
export function toGamePath(p: string): string {
  if (isWindows) return p
  return 'Z:' + p.split(sep).join('\\')
}

/**
 * Finds a file case-insensitively on Linux. Windows is case-insensitive and the game files keep their
 * Windows names (e.g. "Ashita-cli.exe" vs "ashita-cli.exe"), so lookups must ignore case.
 * Returns the real path, or null if it doesn't exist.
 */
export function findPath(base: string, ...parts: string[]): string | null {
  let cur = base
  if (!existsSync(cur)) return null
  for (const part of parts) {
    const direct = join(cur, part)
    if (existsSync(direct)) {
      cur = direct
      continue
    }
    if (isWindows) return null
    let entries: string[]
    try {
      entries = readdirSync(cur)
    } catch {
      return null
    }
    const match = entries.find((e) => e.toLowerCase() === part.toLowerCase())
    if (!match) return null
    cur = join(cur, match)
  }
  return cur
}

// ------------------------------------------------------------------------------------------- runners

function isExecutable(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((d) => {
      try {
        return statSync(join(dir, d)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

function wineVersion(path: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(path, ['--version'], { timeout: 8000, env: { ...process.env, WINEDEBUG: '-all' } }, (err, stdout) => {
      resolve(err ? '' : stdout.trim())
    })
  })
}

/** All Wine builds we can find, best guess first. */
export async function findRunners(): Promise<WineRunner[]> {
  if (isWindows) return []
  const home = homedir()
  const found: { path: string; label: string }[] = []
  const add = (path: string, label: string): void => {
    if (isExecutable(path) && !found.some((f) => f.path === path)) found.push({ path, label })
  }

  // System Wine (wine / wine-staging / WineHQ packages)
  for (const dir of (process.env.PATH ?? '').split(delimiter)) if (dir) add(join(dir, 'wine'), 'System Wine')
  for (const p of ['/usr/bin/wine', '/usr/local/bin/wine', '/opt/wine-staging/bin/wine', '/opt/wine-stable/bin/wine', '/opt/wine-devel/bin/wine']) {
    add(p, 'System Wine')
  }

  // Lutris runners (wine-ge, lutris-fshack, ...)
  for (const base of [join(home, '.local/share/lutris/runners/wine'), join(home, '.var/app/net.lutris.Lutris/data/lutris/runners/wine')]) {
    for (const d of subdirs(base)) add(join(base, d, 'bin', 'wine'), `Lutris: ${d}`)
  }

  // Custom Proton builds (GE-Proton via ProtonUp-Qt) and Valve's Proton, regular and Flatpak Steam.
  const steamRoots = [
    join(home, '.steam/root'),
    join(home, '.steam/steam'),
    join(home, '.local/share/Steam'),
    join(home, '.var/app/com.valvesoftware.Steam/data/Steam')
  ]
  for (const root of steamRoots) {
    const compat = join(root, 'compatibilitytools.d')
    for (const d of subdirs(compat)) add(join(compat, d, 'files', 'bin', 'wine'), d)
    const common = join(root, 'steamapps', 'common')
    for (const d of subdirs(common).filter((n) => /^Proton/i.test(n))) add(join(common, d, 'files', 'bin', 'wine'), d)
  }

  return Promise.all(found.map(async (f) => ({ ...f, version: await wineVersion(f.path) })))
}

/** The runner to use: the one the player chose, or the first one found. */
export async function pickRunner(w: WineSettings): Promise<WineRunner | null> {
  if (w.runner && isExecutable(w.runner)) return { path: w.runner, label: 'Selected', version: await wineVersion(w.runner) }
  const all = await findRunners()
  return all[0] ?? null
}

// ------------------------------------------------------------------------------------------- prefix

export const prefixPath = (installDir: string, w: WineSettings): string => w.prefix || join(installDir, 'wineprefix')
export const wineLogPath = (installDir: string): string => join(installDir, 'wine.log')

function wineEnv(prefix: string, w: WineSettings, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    WINEPREFIX: prefix,
    // No Mono/Gecko install dialogs; the game doesn't need .NET or the HTML engine.
    WINEDLLOVERRIDES: 'mscoree,mshtml=',
    WINEDEBUG: w.debugLog ? 'err+all,fixme-all' : '-all',
    // Proton builds look for these; harmless for normal Wine.
    WINEESYNC: '1',
    WINEFSYNC: '1',
    ...extra
  }
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string, timeoutMs = 300_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const keep = (d: Buffer): void => {
      out = (out + d.toString()).slice(-8000)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const t = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (e) => {
      clearTimeout(t)
      resolve({ code: -1, out: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(t)
      resolve({ code, out })
    })
  })
}

const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x86.exe'
const VC_MARKER = '.xi-vcredist-installed'

/**
 * Creates the Wine prefix on first use and installs the 32-bit Visual C++ runtime xiloader needs.
 * Calls onStatus with short messages for the UI. Returns an error message or null.
 */
export async function preparePrefix(runner: WineRunner, installDir: string, w: WineSettings, onStatus: (msg: string) => void): Promise<string | null> {
  const prefix = prefixPath(installDir, w)
  const env = wineEnv(prefix, w)
  await mkdir(prefix, { recursive: true })

  if (!existsSync(join(prefix, 'system.reg'))) {
    onStatus('Setting up Wine for the first time… (about a minute)')
    const r = await run(runner.path, ['wineboot', '--init'], env)
    // Proton's wine can exit before the prefix is fully written; wait for wineserver to finish.
    const server = join(dirname(runner.path), 'wineserver')
    if (existsSync(server)) await run(server, ['-w'], env, undefined, 120_000)
    if (!existsSync(join(prefix, 'system.reg'))) {
      return `Wine couldn't create its settings folder (${prefix}). ${r.out.split('\n').filter(Boolean).slice(-3).join(' ')}`
    }
  }

  if (!existsSync(join(prefix, VC_MARKER))) {
    onStatus('Installing the Microsoft Visual C++ runtime into Wine…')
    const installer = join(prefix, 'vc_redist.x86.exe')
    try {
      if (!existsSync(installer)) {
        const res = await fetch(VC_REDIST_URL, { signal: AbortSignal.timeout(120_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        writeFileSync(installer, Buffer.from(await res.arrayBuffer()))
      }
      const r = await run(runner.path, [installer, '/install', '/quiet', '/norestart'], env)
      // 0 = installed, 1638 = a newer version is already there, 3010 = needs a reboot (fine under Wine).
      if (r.code === 0 || r.code === 1638 || r.code === 3010) writeFileSync(join(prefix, VC_MARKER), new Date().toISOString())
    } catch {
      // Not fatal: Wine's built-in runtime DLLs work for most setups. We'll try again next launch.
    }
  }
  return null
}

// ------------------------------------------------------------------------------------------- launch

/**
 * Starts Ashita under Wine and resolves after a few seconds: ok if it is still running (the game is
 * starting), or an error with the end of the Wine log if it exited straight away.
 */
export async function startWithWine(
  runner: WineRunner,
  installDir: string,
  w: WineSettings,
  exe: string,
  args: string[],
  cwd: string
): Promise<{ ok: boolean; error?: string }> {
  const prefix = prefixPath(installDir, w)
  const logFile = wineLogPath(installDir)
  const log = createWriteStream(logFile, { flags: 'w' })
  log.write(`# ${new Date().toISOString()} ${runner.path} (${runner.version || 'unknown version'})\n# WINEPREFIX=${prefix}\n`)

  const extra: Record<string, string> = {}
  for (const line of (w.extraEnv || '').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (m) extra[m[1]] = m[2].trim()
  }

  let child
  try {
    child = spawn(runner.path, [exe, ...args], { cwd, env: wineEnv(prefix, w, extra), detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    return { ok: false, error: `Couldn't start Wine: ${e instanceof Error ? e.message : String(e)}` }
  }
  child.stdout?.pipe(log, { end: false })
  child.stderr?.pipe(log, { end: false })

  const exited = await new Promise<number | null | 'running'>((resolve) => {
    const t = setTimeout(() => resolve('running'), 6000)
    child.on('error', () => {
      clearTimeout(t)
      resolve(-1)
    })
    child.on('exit', (code) => {
      clearTimeout(t)
      resolve(code)
    })
  })
  child.unref()

  // Ashita's launcher process may exit normally once the game is up; only a quick failure is an error.
  if (exited === 'running' || exited === 0) return { ok: true }
  await new Promise((r) => setTimeout(r, 300))
  let tail = ''
  try {
    tail = (await readFile(logFile, 'utf8')).split('\n').filter((l) => l && !l.startsWith('#')).slice(-4).join(' ')
  } catch {
    /* no log */
  }
  return { ok: false, error: `The game exited right away under Wine (code ${exited}). ${tail ? `Wine said: ${tail}` : ''} Full log: ${logFile}` }
}
