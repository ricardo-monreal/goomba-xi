import { useCallback, useEffect, useState } from 'react'
import type { AppState, UserSettings } from '../../shared/types'
import Addons from './components/Addons'
import Home from './components/Home'
import Settings from './components/Settings'

type Page = 'home' | 'addons' | 'settings'

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [loadError, setLoadError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.getState()
      setState(s)
      document.title = s.config.serverName
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const save = useCallback(
    async (patch: Partial<UserSettings>) => {
      await window.api.saveSettings(patch)
      await refresh()
    },
    [refresh]
  )

  if (loadError) return <div className="boot">Failed to start: {loadError}</div>
  if (!state) return <div className="boot">Loading…</div>

  const nav: { id: Page; label: string }[] = [
    { id: 'home', label: 'Play' },
    { id: 'addons', label: 'Addons' },
    { id: 'settings', label: 'Settings' }
  ]

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="crystal" aria-hidden />
          <div>
            <div className="brand-name">{state.config.serverName}</div>
            <div className="brand-sub">v{state.version}</div>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <button key={n.id} className={page === n.id ? 'nav active' : 'nav'} onClick={() => setPage(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="links">
          {Object.entries(state.config.links).map(([label, url]) => (
            <button key={label} className="link" onClick={() => window.api.openExternal(url)}>
              {label} ↗
            </button>
          ))}
        </div>
      </aside>
      <main className="content">
        {page === 'home' && <Home state={state} save={save} refresh={refresh} />}
        {page === 'addons' && <Addons save={save} />}
        {page === 'settings' && <Settings state={state} save={save} />}
      </main>
    </div>
  )
}
