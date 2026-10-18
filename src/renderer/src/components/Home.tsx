import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import AccountPanel from './AccountPanel'
import type { AppState, NewsItem, PatchProgress, UpdateCheck, UserSettings } from '../../../shared/types'

type Status = 'checking' | 'needs-update' | 'updating' | 'ready' | 'launching' | 'error'

const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x86.exe'

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return ''
  if (sec < 60) return `${Math.ceil(sec)}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ${Math.round(sec % 60)}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Smoothed download speed in bytes/second from a stream of progress events. */
function useSpeed(progress: PatchProgress | null): number {
  const samples = useRef<{ t: number; b: number }[]>([])
  const [speed, setSpeed] = useState(0)
  useEffect(() => {
    if (!progress || progress.phase !== 'downloading') {
      samples.current = []
      setSpeed(0)
      return
    }
    const now = performance.now()
    const s = samples.current
    s.push({ t: now, b: progress.bytesDone })
    while (s.length > 2 && now - s[0].t > 5000) s.shift()
    if (s.length > 1) {
      const dt = (s[s.length - 1].t - s[0].t) / 1000
      if (dt > 0.5) setSpeed(Math.max(0, (s[s.length - 1].b - s[0].b) / dt))
    }
  }, [progress])
  return speed
}

interface Props {
  state: AppState
  save: (patch: Partial<UserSettings>) => Promise<void>
  refresh: () => Promise<void>
}

export default function Home({ state, save, refresh }: Props): JSX.Element {
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [status, setStatus] = useState<Status>('checking')
  const [check, setCheck] = useState<UpdateCheck | null>(null)
  const [progress, setProgress] = useState<PatchProgress | null>(null)
  const [message, setMessage] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(state.settings.rememberMe)
  const [mode, setMode] = useState<'signin' | 'create' | 'password'>('signin')
  const [loginError, setLoginError] = useState('')
  const speed = useSpeed(progress)

  const { config, ffxi, prereqs, settings } = state
  const bundled = config.clientMode === 'bundled'
  const firstInstall = bundled && !ffxi.found

  const runCheck = useCallback(async () => {
    setStatus('checking')
    setProgress(null)
    const r = await window.api.checkUpdates()
    setCheck(r)
    if (!r.ok) {
      setStatus('error')
      setMessage(r.error ?? 'Update check failed.')
    } else {
      setStatus(r.filesToDownload + r.filesToDelete > 0 ? 'needs-update' : 'ready')
    }
  }, [])

  useEffect(() => {
    window.api.getNews().then(setNews)
    window.api.getSavedCredentials().then((c) => {
      setUsername(c.username)
      setPassword(c.password)
    })
    return window.api.onPatchProgress(setProgress)
  }, [])

  useEffect(() => {
    setMessage('')
    runCheck()
  }, [runCheck, settings.installDir])

  const update = async (verify = false): Promise<void> => {
    setStatus('updating')
    setMessage(verify ? 'Verifying every file. This can take a few minutes.' : '')
    setProgress(null)
    const r = await window.api.runUpdate({ verify })
    if (r.cancelled) {
      setMessage('Paused. Press Resume to continue where you left off.')
      await runCheck()
      return
    }
    if (!r.ok) {
      setStatus('error')
      setMessage(r.error ?? 'Update failed.')
      return
    }
    setMessage(verify ? 'All files verified.' : firstInstall ? 'Installed. Welcome!' : '')
    await refresh()
    await runCheck()
  }

  const chooseInstallDir = async (): Promise<void> => {
    const dir = await window.api.chooseFolder('Choose where to install the game')
    if (dir) await save({ installDir: dir })
  }

  const locateFfxi = async (): Promise<void> => {
    const dir = await window.api.chooseFolder('Select your FINAL FANTASY XI folder (contains FFXiMain.dll)')
    if (dir) await save({ ffxiPath: dir })
  }

  const play = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (status !== 'ready' || mode !== 'signin') return
    setLoginError('')
    if (!username.trim() || !password) {
      setLoginError('Enter your username and password.')
      return
    }
    setStatus('launching')
    const startMsg = state.platform === 'win32' ? 'Starting the game… If Windows asks for permission, choose Yes.' : 'Starting the game…'
    setMessage(config.verifyLogin ? 'Signing in…' : startMsg)
    const off = window.api.onLaunchStatus(setMessage)
    const r = await window.api.launch({ username: username.trim(), password, remember })
    off()
    if (r.ok) {
      setMessage('Game started. Have fun!')
      setTimeout(() => setStatus('ready'), 5000)
    } else {
      setStatus('ready')
      setMessage('')
      setLoginError(r.error ?? 'Launch failed.')
    }
  }

  const pct = progress && progress.bytesTotal > 0 ? Math.min(100, Math.floor((progress.bytesDone / progress.bytesTotal) * 100)) : 0
  const lowDisk = !!check?.ok && check.freeBytes !== undefined && check.freeBytes < check.bytesToWrite + 512 * 1024 * 1024
  const paused = status === 'needs-update' && message.startsWith('Paused')

  let button: JSX.Element
  if (!bundled && !ffxi.found) {
    button = (
      <button type="button" className="primary" onClick={locateFfxi}>
        Locate FFXI
      </button>
    )
  } else if (status === 'needs-update') {
    const label = paused ? 'Resume' : firstInstall ? 'Install' : 'Update'
    button = (
      <button type="button" className="primary" onClick={() => update()} disabled={lowDisk}>
        {label} · {formatBytes(check?.bytesToDownload ?? 0)}
      </button>
    )
  } else if (status === 'updating') {
    button = (
      <button type="button" className="primary ghost" onClick={() => window.api.cancelUpdate()}>
        Pause · {pct}%
      </button>
    )
  } else if (status === 'error') {
    button = (
      <button type="button" className="primary" onClick={runCheck}>
        Retry
      </button>
    )
  } else {
    button = (
      <button type="submit" className="primary" disabled={status !== 'ready' || !ffxi.found}>
        {status === 'checking' ? 'Checking…' : status === 'launching' ? 'Launching…' : 'Play'}
      </button>
    )
  }

  const remaining = progress && speed > 0 ? (progress.bytesTotal - progress.bytesDone) / speed : 0

  return (
    <div className="home">
      <section className="news">
        <h2>News</h2>
        {news === null && <p className="muted">Loading news…</p>}
        {news?.length === 0 && <p className="muted">No news right now.</p>}
        {news?.map((n, i) => (
          <article key={i} className="news-item">
            <div className="news-date">{n.date}</div>
            <h3>{n.title}</h3>
            <p>{n.body}</p>
            {n.url && (
              <button className="link" onClick={() => window.api.openExternal(n.url!)}>
                Read more ↗
              </button>
            )}
          </article>
        ))}
      </section>

      <form className="login card" onSubmit={play}>
        {firstInstall && status !== 'ready' ? (
          <>
            <h2>Install the game</h2>
            <p className="small muted">
              Everything you need to play is downloaded here. No separate FINAL FANTASY XI install required.
            </p>
            {check?.ok && (
              <dl className="facts">
                <dt>Download</dt>
                <dd>{formatBytes(check.bytesToDownload)}</dd>
                <dt>Size on disk</dt>
                <dd>{formatBytes(check.bytesToWrite)}</dd>
                {check.freeBytes !== undefined && (
                  <>
                    <dt>Free space</dt>
                    <dd className={lowDisk ? 'error' : ''}>{formatBytes(check.freeBytes)}</dd>
                  </>
                )}
              </dl>
            )}
            <div className="install-dir">
              <div className="small muted">Install location</div>
              <div className="path">{settings.installDir}</div>
              {status !== 'updating' && (
                <button type="button" className="link small" onClick={chooseInstallDir}>
                  Change…
                </button>
              )}
            </div>
            {lowDisk && <p className="error small">Not enough free space on this drive. Pick another location or free up space.</p>}
          </>
        ) : (
          mode === 'signin' && (
            <>
              <h2>Sign in</h2>
              <label>
                Username
                <input value={username} maxLength={16} onChange={(e) => setUsername(e.target.value)} autoComplete="username" spellCheck={false} />
              </label>
              <label>
                Password
                <input type="password" value={password} maxLength={32} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </label>
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me on this computer
              </label>
              {loginError && <p className="error small">{loginError}</p>}
            </>
          )
        )}

        {!firstInstall && mode !== 'signin' && (
          <AccountPanel
            mode={mode}
            initialUsername={username}
            onCancel={() => setMode('signin')}
            onDone={(u, note) => {
              setUsername(u)
              setPassword('')
              setLoginError('')
              setMessage(note)
              setMode('signin')
            }}
          />
        )}

        {(firstInstall || mode === 'signin') && button}

        {!firstInstall && mode === 'signin' && status !== 'launching' && (
          <div className="account-links small">
            {config.allowAccountCreation && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  if (config.registerUrl) return window.api.openExternal(config.registerUrl)
                  setMode('create')
                  setMessage('')
                }}
              >
                Create account{config.registerUrl ? ' ↗' : ''}
              </button>
            )}
            <button type="button" className="link" onClick={() => { setMode('password'); setMessage('') }}>
              Change password
            </button>
            {config.accountUrl && (
              <button type="button" className="link" onClick={() => window.api.openExternal(config.accountUrl)}>
                My characters ↗
              </button>
            )}
          </div>
        )}

        {status === 'checking' && progress?.phase === 'checking' && progress.filesTotal > 0 && (
          <div className="progress">
            <div className="bar">
              <div style={{ width: `${Math.floor((progress.filesDone / progress.filesTotal) * 100)}%` }} />
            </div>
            <div className="muted small">
              Checking files {progress.filesDone.toLocaleString()} / {progress.filesTotal.toLocaleString()}
            </div>
          </div>
        )}

        {status === 'updating' && progress && (
          <div className="progress">
            <div className="bar">
              <div style={{ width: `${progress.phase === 'checking' ? 0 : pct}%` }} />
            </div>
            <div className="muted small">
              {progress.phase === 'checking'
                ? `Checking files ${progress.filesDone.toLocaleString()} / ${progress.filesTotal.toLocaleString()}`
                : `${formatBytes(progress.bytesDone)} of ${formatBytes(progress.bytesTotal)}` +
                  (speed > 0 ? ` · ${formatBytes(speed)}/s · ${formatDuration(remaining)} left` : '')}
            </div>
            {progress.phase === 'downloading' && (
              <div className="muted small">
                {progress.filesDone.toLocaleString()} / {progress.filesTotal.toLocaleString()} files
              </div>
            )}
          </div>
        )}

        {message && <p className={status === 'error' ? 'error small' : 'small'}>{message}</p>}
        {!bundled && !ffxi.found && <p className="error small">{ffxi.error}</p>}

        {prereqs.wine === null && (
          <div className="notice small">
            Wine is needed to play on Linux and wasn’t found. Install it (for example <code>sudo apt install wine</code>), or
            GE-Proton on a Steam Deck, then restart the launcher. See Settings → Linux.
          </div>
        )}

        {prereqs.vcRedistX86 === false && (
          <div className="notice small">
            The Microsoft Visual C++ x86 runtime is missing. The game won’t start without it.{' '}
            <button type="button" className="link" onClick={() => window.api.openExternal(VC_REDIST_URL)}>
              Download it ↗
            </button>
          </div>
        )}

        {!firstInstall && (
          <div className="meta small muted">
            <div>Install: {settings.installDir}</div>
            {!bundled && ffxi.found && <div>FFXI: {ffxi.path}</div>}
            {check?.version && <div>Version: {check.version}</div>}
            {(status === 'ready' || status === 'error') && config.manifestUrl && (
              <button type="button" className="link small" onClick={() => update(true)}>
                Verify game files
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
