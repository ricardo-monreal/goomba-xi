// Types shared between the main process, preload and renderer.

import type { PadType } from './controller'

export interface LauncherConfig {
  /**
   * "bundled": the patcher installs the full game (Ashita + FFXI + PlayOnlineViewer) and it runs
   *            through Ashita's Sandbox plugin, so no retail install or registry entries are needed.
   * "retail":  players install FFXI themselves; the launcher only ships Ashita/xiloader/addons.
   */
  clientMode: 'bundled' | 'retail'
  /** Region of the bundled client (bundled mode only). */
  clientLanguage: Language
  /** Short id used for the Ashita boot profile/script file names. Letters, digits, dash, underscore. */
  serverId: string
  serverName: string
  /** Hostname or IP of the LandSandBoat login server. */
  serverHost: string
  /** URL of the patch manifest produced by tools/make-manifest.mjs. Empty string disables patching. */
  manifestUrl: string
  /** URL of a news.json feed. Empty string hides the news panel. */
  newsUrl: string
  links: Record<string, string>
  /** Pass --hairpin to xiloader (only for a local server exposed publicly). */
  hairpin: boolean
  ports: { auth?: number; data?: number; view?: number }
  requiredPlugins: string[]
  defaultPlugins: string[]
  requiredAddons: string[]
  defaultAddons: string[]
  /** URL of a pivot.json catalog of optional HD/DAT packs. Empty string hides catalog packs. */
  pivotCatalogUrl: string
  /** XIPivot overlays shipped with the client (folders in Ashita/polplugins/DATs) that are always on, loaded first. */
  requiredOverlays: string[]
  /** Keybinds/aliases written to the Ashita startup script (default: Ashita's standard binds). */
  scriptBinds: string[]
  /** Commands run for every player after addons have loaded (after /wait 3). */
  scriptCommands: string[]
  /** Check the username/password with the login server before starting the game (default true). */
  verifyLogin: boolean
  /** Show "Create account" in the launcher (the server must also have ACCOUNT_CREATION = true). */
  allowAccountCreation: boolean
  /** Website pages. When set, "Create account" / "Manage account" open these in the browser. */
  registerUrl: string
  accountUrl: string
}

export type Language = 'US' | 'JP' | 'EU'

export interface GraphicsSettings {
  /** Window / screen resolution (registry 0001/0002). */
  width: number
  height: number
  /** 3D background resolution (0003/0004). */
  bgWidth: number
  bgHeight: number
  /** Menu / UI resolution (0037/0038). */
  menuWidth: number
  menuHeight: number
  /** 0 fullscreen, 1 windowed, 3 borderless (see Ashita docs on registry 0034). */
  windowMode: 0 | 1 | 3
  mipmap: number
  bumpMapping: boolean
  envAnimations: 0 | 1 | 2
  textureCompression: 0 | 1 | 2
  fontCompression: 0 | 1 | 2
  maintainAspect: boolean
  /** Registry 0019: 1 = uncompressed map textures. */
  uncompressedMaps: boolean
  /** Registry 0040. */
  graphicsStabilization: boolean
  hardwareMouse: boolean
  openingMovie: boolean
  simplifiedCharCreation: boolean
}

export interface SoundSettings {
  enabled: boolean
  alwaysOn: boolean
  maxSounds: number
}

export interface GamepadSettings {
  enabled: boolean
  type: PadType
  /** Let Ashita/the game look for controllers. Turning it off can fix micro-stutter when no pad is used. */
  enumeration: boolean
  /** Keep the pad working while the game window is in the background. */
  whenInactive: boolean
  forceFeedback: boolean
  sliders: boolean
  hatSwitches: boolean
  /** DirectInput device GUID like {xxxxxxxx-...}; empty = first controller found. */
  deviceGuid: string
  /** 27 button codes (see shared/controller.ts) for each pad type. */
  mapXInput: number[]
  mapDInput: number[]
  /** DirectInput mapping is only written when the player changed it; otherwise the game's defaults apply. */
  dinputCustomized: boolean
}

export interface LocalOverlay {
  id: string
  name: string
  path: string
}

export interface PivotSettings {
  /** Pack id -> enabled. */
  enabled: Record<string, boolean>
  /** Folders the player added with "Browse" (linked into polplugins/DATs). */
  local: LocalOverlay[]
}

/** Linux only: how the game is run through Wine. */
export interface WineSettings {
  /** Path to a wine binary; empty = pick automatically. */
  runner: string
  /** Wine prefix folder; empty = <install folder>/wineprefix. */
  prefix: string
  /** Write Wine's error messages to wine.log (slower; for troubleshooting). */
  debugLog: boolean
  /** Extra environment variables, one NAME=value per line (e.g. DXVK_HUD=fps). */
  extraEnv: string
}

export interface WineRunner {
  path: string
  label: string
  version: string
}

export interface UserSettings {
  /** Folder that holds the server files (Ashita, xiloader, addons). */
  installDir: string
  /** Optional manual override for the FINAL FANTASY XI folder. */
  ffxiPath: string
  language: Language
  graphics: GraphicsSettings
  sound: SoundSettings
  gamepad: GamepadSettings
  addons: Record<string, boolean>
  plugins: Record<string, boolean>
  pivot: PivotSettings
  /** 60 = run the game at 60fps through the fps addon ("/fps 1"); 30 = game default. */
  frameRate: 30 | 60
  /** Extra Ashita commands the player wants run at startup, one per line. */
  customCommands: string
  rememberMe: boolean
  lastUsername: string
  closeOnLaunch: boolean
  wine: WineSettings
}

export interface FfxiStatus {
  found: boolean
  path: string
  source: 'bundled' | 'override' | 'registry' | 'none'
  error?: string
}

export interface Prereqs {
  /** Microsoft Visual C++ 2015-2022 x86 runtime, needed by xiloader. undefined = couldn't check. */
  vcRedistX86?: boolean
  /** Linux: the Wine build that will be used, or null if none was found. undefined on Windows. */
  wine?: WineRunner | null
}

export interface AppState {
  config: LauncherConfig
  settings: UserSettings
  ffxi: FfxiStatus
  prereqs: Prereqs
  platform: NodeJS.Platform
  version: string
}

export interface UpdateCheck {
  ok: boolean
  error?: string
  version?: string
  filesToDownload: number
  /** Bytes transferred over the network (compressed size when the manifest is gzipped). */
  bytesToDownload: number
  /** Bytes written to disk. */
  bytesToWrite: number
  filesToDelete: number
  freeBytes?: number
  cancelled?: boolean
}

export interface PatchProgress {
  phase: 'checking' | 'downloading' | 'done' | 'error' | 'cancelled'
  currentFile?: string
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  message?: string
}

export interface NewsItem {
  title: string
  date: string
  body: string
  url?: string
}

export interface AddonEntry {
  name: string
  enabled: boolean
  required: boolean
}

export interface AddonList {
  addons: AddonEntry[]
  plugins: AddonEntry[]
}

/** One entry of the server's pivot.json catalog. */
export interface PivotPack {
  /** Folder name in polplugins/DATs. Letters, digits, '-', '_', '.'. */
  id: string
  name: string
  /** Packs in the same category are mutually exclusive, e.g. "Textures", "Maps", "UI". */
  category: string
  description?: string
  author?: string
  /** Extra links shown as icons, e.g. { "GitHub": "https://...", "Website": "https://..." }. */
  links?: Record<string, string>
  /** Zip download. */
  url: string
  /** Download size in bytes (shown before downloading). */
  size?: number
  sha256?: string
  version?: string
}

export interface PivotEntry extends PivotPack {
  source: 'catalog' | 'local' | 'server'
  installed: boolean
  installedVersion?: string
  updateAvailable: boolean
  enabled: boolean
  /** Required server overlays can't be turned off. */
  locked: boolean
}

export interface PivotState {
  /** pivot.dll is present in Ashita/polplugins. */
  available: boolean
  packs: PivotEntry[]
  categories: string[]
  catalogError?: string
}

export interface PivotProgress {
  id: string
  phase: 'downloading' | 'extracting' | 'done' | 'error'
  bytesDone: number
  bytesTotal: number
  message?: string
}

export interface LaunchRequest {
  username: string
  password: string
  remember: boolean
}

export interface LaunchResult {
  ok: boolean
  error?: string
}

export interface LauncherApi {
  getState(): Promise<AppState>
  saveSettings(patch: Partial<UserSettings>): Promise<UserSettings>
  chooseFolder(title: string): Promise<string | null>
  checkUpdates(): Promise<UpdateCheck>
  runUpdate(opts?: { verify?: boolean }): Promise<UpdateCheck>
  cancelUpdate(): Promise<void>
  onPatchProgress(cb: (p: PatchProgress) => void): () => void
  getNews(): Promise<NewsItem[]>
  listAddons(): Promise<AddonList>
  getSavedCredentials(): Promise<{ username: string; password: string }>
  launch(req: LaunchRequest): Promise<LaunchResult>
  openExternal(url: string): Promise<void>
  createAccount(username: string, password: string): Promise<{ ok: boolean; error?: string }>
  changePassword(username: string, password: string, newPassword: string): Promise<{ ok: boolean; error?: string }>
  pivotList(): Promise<PivotState>
  pivotInstall(id: string): Promise<{ ok: boolean; error?: string }>
  pivotCancel(id: string): Promise<void>
  pivotRemove(id: string): Promise<{ ok: boolean; error?: string }>
  pivotSetEnabled(id: string, enabled: boolean): Promise<PivotState>
  pivotAddLocal(): Promise<{ ok: boolean; error?: string }>
  onPivotProgress(cb: (p: PivotProgress) => void): () => void
  /** Linux: Wine builds found on this machine. */
  wineRunners(): Promise<WineRunner[]>
  /** Linux: pick a wine binary by hand. */
  chooseWineBinary(): Promise<string | null>
  /** Linux: open the last Wine log in the system's text editor. */
  openWineLog(): Promise<void>
  /** Status messages while preparing Wine before a launch. */
  onLaunchStatus(cb: (msg: string) => void): () => void
}
