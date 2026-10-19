// Addon / plugin catalog: extra Ashita addons and plugins players can install from the launcher.
// No Electron imports, so it can be tested with plain Node.
//
// The server publishes addons.json (cfg.addonCatalogUrl):
//   [{ "type": "plugin", "name": "TargetLines", "version": "1.0", "author": "…", "description": "…",
//      "url": "http://files/launcher/addons/TargetLines-1.0.zip", "platforms": ["windows", "linux"] }]
//
// Zip layouts accepted:
//   - Ashita layout: plugins/<Name>.dll, addons/<name>/<name>.lua, resources/…, docs/… (merged into Ashita/)
//   - Plugin: <Name>.dll at the top (any other folders are merged into Ashita/)
//   - Addon: <name>.lua at the top, or <name>/<name>.lua
// A single wrapping folder (e.g. "TargetLines-1.0/") is skipped automatically.
//
// What was installed is recorded in Ashita/config/launcher-catalog.json so it can be updated or removed.

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { AddonList, CatalogItem, CatalogProgress } from '../shared/types'
import { ashitaDir } from './ashita'
import { download, extractZip } from './pivot'

const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/
const ASHITA_DIRS = new Set(['addons', 'plugins', 'polplugins', 'resources', 'config', 'docs', 'scripts', 'fonts'])
const platform = process.platform === 'win32' ? 'windows' : 'linux'

export const catalogKey = (type: string, name: string): string => `${type}:${name.toLowerCase()}`

// ------------------------------------------------------------------------------------------- catalog

let cache: { url: string; at: number; items: CatalogItem[]; error?: string } | null = null

export function validateAddonCatalog(raw: unknown): CatalogItem[] {
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown })?.items
  if (!Array.isArray(list)) throw new Error('addons.json must be an array (or { "items": [...] })')
  const out: CatalogItem[] = []
  const seen = new Set<string>()
  for (const i of list as Partial<CatalogItem>[]) {
    if (!i || typeof i !== 'object') continue
    if (i.type !== 'addon' && i.type !== 'plugin') continue
    if (typeof i.name !== 'string' || !NAME_RE.test(i.name)) continue
    if (typeof i.url !== 'string' || !/^https?:\/\//.test(i.url)) continue
    const key = catalogKey(i.type, i.name)
    if (seen.has(key)) continue
    seen.add(key)
    const platforms = Array.isArray(i.platforms) ? i.platforms.filter((p) => p === 'windows' || p === 'linux') : undefined
    out.push({
      type: i.type,
      name: i.name,
      version: typeof i.version === 'string' ? i.version : undefined,
      author: typeof i.author === 'string' ? i.author : undefined,
      description: typeof i.description === 'string' ? i.description : undefined,
      links: i.links && typeof i.links === 'object'
        ? Object.fromEntries(Object.entries(i.links).filter(([, v]) => typeof v === 'string' && /^https?:\/\//.test(v)))
        : undefined,
      url: i.url,
      size: typeof i.size === 'number' && i.size > 0 ? i.size : undefined,
      sha256: typeof i.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(i.sha256) ? i.sha256.toLowerCase() : undefined,
      platforms: platforms && platforms.length ? platforms : undefined
    })
  }
  return out
}

export async function getAddonCatalog(url: string, force = false): Promise<{ items: CatalogItem[]; error?: string }> {
  if (!url) return { items: [] }
  if (!force && cache && cache.url === url && Date.now() - cache.at < 5 * 60_000) return cache
  try {
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    cache = { url, at: Date.now(), items: validateAddonCatalog(await res.json()) }
  } catch (e) {
    const error = `Couldn't load the addon list: ${e instanceof Error ? e.message : String(e)}`
    cache = { url, at: Date.now(), items: cache?.url === url ? cache.items : [], error }
  }
  return cache
}

const forThisPlatform = (i: CatalogItem): boolean => !i.platforms || i.platforms.includes(platform)

// ------------------------------------------------------------------------------------------- installed state

interface Record_ {
  version?: string
  files: string[]
}
type State = Record<string, Record_>

const stateFile = (installDir: string): string => join(ashitaDir(installDir), 'config', 'launcher-catalog.json')

function readState(installDir: string): State {
  try {
    return JSON.parse(readFileSync(stateFile(installDir), 'utf8'))
  } catch {
    return {}
  }
}

async function writeState(installDir: string, state: State): Promise<void> {
  await mkdir(dirname(stateFile(installDir)), { recursive: true })
  await writeFile(stateFile(installDir), JSON.stringify(state, null, 2))
}

/** Adds catalog details (version, author, update available) to the scanned list and lists what can be installed. */
export function mergeCatalog(installDir: string, list: Omit<AddonList, 'available'>, items: CatalogItem[], error?: string): AddonList {
  const state = readState(installDir)
  const byKey = new Map(items.map((i) => [catalogKey(i.type, i.name), i]))
  const decorate = (type: 'addon' | 'plugin') => (e: AddonList['addons'][number]) => {
    const key = catalogKey(type, e.name)
    const item = byKey.get(key)
    const rec = state[key]
    return {
      ...e,
      version: rec?.version ?? item?.version,
      author: item?.author,
      description: item?.description,
      links: item?.links,
      fromCatalog: !!rec,
      updateAvailable: !!rec && !!item?.version && !!rec.version && item.version !== rec.version
    }
  }
  const addons = list.addons.map(decorate('addon'))
  const plugins = list.plugins.map(decorate('plugin'))
  const installed = new Set([...addons.map((a) => catalogKey('addon', a.name)), ...plugins.map((p) => catalogKey('plugin', p.name))])
  const available = items.filter((i) => forThisPlatform(i) && !installed.has(catalogKey(i.type, i.name)))
  return { addons, plugins, available, catalogError: error }
}

// ------------------------------------------------------------------------------------------- install / remove

function entries(dir: string): { files: string[]; dirs: string[] } {
  const files: string[] = []
  const dirs: string[] = []
  for (const n of readdirSync(dir)) {
    if (n === '__MACOSX' || n === '.DS_Store') continue
    ;(statSync(join(dir, n)).isDirectory() ? dirs : files).push(n)
  }
  return { files, dirs }
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** Works out where each top-level item of the unpacked zip goes inside Ashita/. Returns [source, destination] pairs. */
export function planCopy(root: string, item: CatalogItem): [string, string][] {
  let dir = root
  // Skip one wrapping folder ("TargetLines-1.0/") when that's all there is.
  for (let i = 0; i < 2; i++) {
    const { files, dirs } = entries(dir)
    const isAshita = dirs.some((d) => ASHITA_DIRS.has(d.toLowerCase()))
    const isAddonFolder = item.type === 'addon' && dirs.some((d) => d.toLowerCase() === item.name.toLowerCase())
    if (files.length === 0 && dirs.length === 1 && !isAshita && !isAddonFolder) dir = join(dir, dirs[0])
    else break
  }
  const { files, dirs } = entries(dir)
  const lower = (s: string): string => s.toLowerCase()
  const plan: [string, string][] = []

  if (dirs.some((d) => ASHITA_DIRS.has(lower(d)))) {
    for (const d of dirs) if (ASHITA_DIRS.has(lower(d))) plan.push([join(dir, d), lower(d)])
    for (const f of files) if (/\.dll$/i.test(f) && item.type === 'plugin') plan.push([join(dir, f), join('plugins', f)])
    return plan
  }

  if (item.type === 'plugin') {
    const dlls = files.filter((f) => /\.dll$/i.test(f))
    if (!dlls.length) throw new Error(`The download for ${item.name} doesn't contain a .dll file.`)
    for (const f of dlls) plan.push([join(dir, f), join('plugins', f)])
    for (const d of dirs) plan.push([join(dir, d), d]) // e.g. resources/ next to the dll
    return plan
  }

  // addon
  if (files.some((f) => lower(f) === `${lower(item.name)}.lua`)) {
    plan.push([dir, join('addons', item.name)])
    return plan
  }
  const folder = dirs.find((d) => lower(d) === lower(item.name))
  if (folder && existsSync(join(dir, folder, `${item.name}.lua`))) {
    plan.push([join(dir, folder), join('addons', item.name)])
    return plan
  }
  throw new Error(`The download for ${item.name} doesn't contain ${item.name}.lua.`)
}

export async function installItem(installDir: string, item: CatalogItem, onProgress: (p: CatalogProgress) => void, signal?: AbortSignal): Promise<void> {
  const root = ashitaDir(installDir)
  const key = catalogKey(item.type, item.name)
  const work = join(root, '.downloads')
  const zip = join(work, `${item.type}-${item.name}.zip`)
  const tmp = join(work, `extract-${item.type}-${item.name}`)
  await mkdir(work, { recursive: true })
  await rm(tmp, { recursive: true, force: true })
  try {
    await download(item.url, zip, (done, total) => onProgress({ key, phase: 'downloading', bytesDone: done, bytesTotal: total }), item.size ?? 0, item.sha256, signal)
    onProgress({ key, phase: 'extracting', bytesDone: 0, bytesTotal: 0 })
    await extractZip(zip, tmp, () => {}, signal)

    // Replace an older version cleanly.
    const state = readState(installDir)
    if (state[key]) await removeFiles(root, state[key].files)

    const files: string[] = []
    for (const [src, destRel] of planCopy(tmp, item)) {
      const dest = join(root, destRel)
      if (!dest.startsWith(root + sep)) throw new Error('Invalid path in download.')
      const srcFiles = statSync(src).isDirectory() ? walk(src) : [src]
      cpSync(src, dest, { recursive: true, force: true })
      for (const f of srcFiles) {
        const rel = statSync(src).isDirectory() ? join(destRel, relative(src, f)) : destRel
        files.push(rel.split(sep).join('/'))
      }
    }
    state[key] = { version: item.version, files }
    await writeState(installDir, state)
    onProgress({ key, phase: 'done', bytesDone: 1, bytesTotal: 1 })
  } finally {
    await rm(tmp, { recursive: true, force: true })
    await rm(zip, { force: true })
  }
}

async function removeFiles(root: string, files: string[]): Promise<void> {
  const dirs = new Set<string>()
  for (const rel of files) {
    const p = join(root, rel)
    if (!p.startsWith(root + sep)) continue
    rmSync(p, { force: true })
    let d = dirname(p)
    while (d.startsWith(root + sep)) {
      dirs.add(d)
      d = dirname(d)
    }
  }
  // Remove folders the item created, deepest first, only if now empty. Ashita's own top-level folders stay.
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    if (dirname(d) === root) continue
    try {
      if (readdirSync(d).length === 0) rmSync(d, { recursive: true })
    } catch {
      /* already gone */
    }
  }
}

export async function removeItem(installDir: string, key: string): Promise<void> {
  const state = readState(installDir)
  const rec = state[key]
  if (!rec) throw new Error('This was installed with the game, not from the list, so it can’t be removed here.')
  await removeFiles(ashitaDir(installDir), rec.files)
  delete state[key]
  await writeState(installDir, state)
}
