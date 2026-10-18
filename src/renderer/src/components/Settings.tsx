import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, UserSettings } from '../../../shared/types'
import ControllerTab from './ControllerTab'
import GameTab from './GameTab'
import GraphicsTab from './GraphicsTab'
import LinuxTab from './LinuxTab'
import { Tabs } from './ui'

interface Props {
  state: AppState
  save: (patch: Partial<UserSettings>) => Promise<void>
}

type Tab = 'game' | 'graphics' | 'controller' | 'linux'

export interface TabProps {
  state: AppState
  s: UserSettings
  /** Apply a change locally and save it shortly after (no Save button needed). */
  update: (patch: Partial<UserSettings>) => void
  /** Save immediately and reload launcher state (for changes like folders that affect detection). */
  commit: (patch: Partial<UserSettings>) => Promise<void>
}

export default function Settings({ state, save }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem('settings.tab') as Tab
      return saved && (saved !== 'linux' || state.platform === 'linux') ? saved : 'game'
    } catch {
      return 'game'
    }
  })
  const [s, setS] = useState<UserSettings>(state.settings)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const pending = useRef<Partial<UserSettings>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => setS(state.settings), [state.settings])

  const flush = useCallback(async () => {
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length === 0) return
    setStatus('saving')
    await window.api.saveSettings(patch)
    setStatus('saved')
  }, [])

  // Save anything pending when leaving the page.
  useEffect(() => () => void flush(), [flush])

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      setS((prev) => ({ ...prev, ...patch }))
      pending.current = { ...pending.current, ...patch }
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 400)
    },
    [flush]
  )

  const commit = useCallback(
    async (patch: Partial<UserSettings>) => {
      clearTimeout(timer.current)
      await flush()
      await save(patch)
    },
    [flush, save]
  )

  const pick = (t: Tab): void => {
    setTab(t)
    try {
      localStorage.setItem('settings.tab', t)
    } catch {
      // Storage unavailable: the tab just won't be remembered.
    }
  }

  const props: TabProps = { state, s, update, commit }

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Settings</h1>
        <span className="muted small save-status">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : ''}</span>
      </div>
      <Tabs
        tabs={[
          { id: 'game', label: 'Game' },
          { id: 'graphics', label: 'Graphics' },
          { id: 'controller', label: 'Controller' },
          ...(state.platform === 'linux' ? [{ id: 'linux' as Tab, label: 'Linux' }] : [])
        ]}
        value={tab}
        onChange={pick}
      />
      {tab === 'game' && <GameTab {...props} />}
      {tab === 'graphics' && <GraphicsTab {...props} />}
      {tab === 'controller' && <ControllerTab {...props} />}
      {tab === 'linux' && state.platform === 'linux' && <LinuxTab {...props} />}
      <p className="muted small">Changes apply the next time you press Play.</p>
    </div>
  )
}
