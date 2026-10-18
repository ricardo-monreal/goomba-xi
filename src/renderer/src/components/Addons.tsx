import { useEffect, useState } from 'react'
import type { AddonEntry, AddonList, UserSettings } from '../../../shared/types'
import PivotTab from './PivotTab'
import { Tabs } from './ui'

interface Props {
  save: (patch: Partial<UserSettings>) => Promise<void>
}

type Tab = 'addons' | 'plugins' | 'pivot'

export default function Addons({ save }: Props): JSX.Element {
  const [list, setList] = useState<AddonList | null>(null)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<Tab>('addons')

  useEffect(() => {
    window.api.listAddons().then(setList)
  }, [])

  const toggle = async (kind: 'addons' | 'plugins', entry: AddonEntry): Promise<void> => {
    if (entry.required || !list) return
    const next = { ...list, [kind]: list[kind].map((e) => (e.name === entry.name ? { ...e, enabled: !e.enabled } : e)) }
    setList(next)
    await save({ [kind]: Object.fromEntries(next[kind].map((e) => [e.name, e.enabled])) })
  }

  const match = (e: AddonEntry): boolean => e.name.toLowerCase().includes(filter.toLowerCase())

  const group = (kind: 'addons' | 'plugins', hint: string): JSX.Element => {
    if (!list) return <p className="muted">Loading…</p>
    const items = list[kind].filter(match)
    return (
      <>
        <div className="toolbar">
          <span className="muted small">
            {hint} {list[kind].filter((e) => e.enabled).length} enabled.
          </span>
          <input className="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {list[kind].length === 0 ? (
          <p className="muted">None installed yet. Run the update from the Play page.</p>
        ) : (
          <ul className="toggles card">
            {items.map((e) => (
              <li key={e.name}>
                <label className={e.required ? 'check locked' : 'check'}>
                  <input type="checkbox" checked={e.enabled} disabled={e.required} onChange={() => toggle(kind, e)} />
                  {e.name}
                  {e.required && <span className="tag-pill">required</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Addons</h1>
      </div>
      <Tabs
        tabs={[
          { id: 'addons', label: 'Addons' },
          { id: 'plugins', label: 'Plugins' },
          { id: 'pivot', label: 'Pivot' }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'addons' && group('addons', 'Lua addons, loaded with /addon load when the game starts.')}
      {tab === 'plugins' && group('plugins', 'Native Ashita plugins (.dll), loaded with /load when the game starts.')}
      {tab === 'pivot' && <PivotTab />}
    </div>
  )
}
