import { useEffect, useState } from 'react'
import type { WineRunner, WineSettings } from '../../../shared/types'
import type { TabProps } from './Settings'
import { Info, Section, ToggleRow } from './ui'

/** Linux only: which Wine build runs the game, and troubleshooting options. */
export default function LinuxTab({ state, s, update, commit }: TabProps): JSX.Element {
  const [runners, setRunners] = useState<WineRunner[] | null>(null)
  const w = s.wine
  const setWine = (patch: Partial<WineSettings>): void => update({ wine: { ...w, ...patch } })

  const scan = (): void => {
    setRunners(null)
    window.api.wineRunners().then(setRunners)
  }
  useEffect(scan, [])

  const chooseOther = async (): Promise<void> => {
    const path = await window.api.chooseWineBinary()
    if (path) await commit({ wine: { ...w, runner: path } })
  }

  const active = state.prereqs.wine
  const selectedKnown = !w.runner || runners?.some((r) => r.path === w.runner)

  return (
    <div className="grid-2">
      <div className="col">
        <Section title="Wine">
          <p className="muted small section-note">
            The game is a Windows program, so on Linux it runs through Wine. Any recent Wine works (9.0 or newer
            recommended). On a Steam Deck, install GE-Proton with ProtonUp-Qt.
          </p>
          <div className="row stack-row">
            <span className="row-label">
              Wine build
              <Info text="Automatic picks the first one found: system Wine, then Lutris runners, then Proton / GE-Proton from Steam." />
            </span>
            <div className="field-row">
              <select className="grow" value={w.runner} disabled={runners === null} onChange={(e) => commit({ wine: { ...w, runner: e.target.value } })}>
                <option value="">Automatic{active ? ` (${active.label})` : ''}</option>
                {runners?.map((r) => (
                  <option key={r.path} value={r.path}>
                    {r.label}
                    {r.version ? ` · ${r.version}` : ''}
                  </option>
                ))}
                {!selectedKnown && <option value={w.runner}>{w.runner}</option>}
              </select>
              <button onClick={chooseOther}>Other…</button>
              <button onClick={scan}>Rescan</button>
            </div>
          </div>
          {runners !== null && runners.length === 0 && (
            <p className="error small section-note">
              No Wine found. Install it from your distribution (for example <code>sudo apt install wine</code> or{' '}
              <code>sudo dnf install wine</code>), or install GE-Proton with ProtonUp-Qt, then press Rescan.
            </p>
          )}
          {active && (
            <p className="muted small section-note">
              Using: {active.version || active.label}
              <br />
              <span className="path">{active.path}</span>
            </p>
          )}
        </Section>

        <Section title="Wine prefix">
          <div className="row stack-row">
            <span className="row-label">
              Prefix folder
              <Info text="Wine's private Windows folder for this game. It is created the first time you press Play. Leave empty to keep it inside the install folder." />
            </span>
            <div className="field-row">
              <input className="grow" value={w.prefix} placeholder={`${s.installDir}/wineprefix`} readOnly />
              <button
                onClick={async () => {
                  const dir = await window.api.chooseFolder('Choose a folder for the Wine prefix')
                  if (dir) await commit({ wine: { ...w, prefix: dir } })
                }}
              >
                Browse
              </button>
              {w.prefix && <button onClick={() => commit({ wine: { ...w, prefix: '' } })}>Default</button>}
            </div>
          </div>
        </Section>
      </div>

      <div className="col">
        <Section title="Troubleshooting">
          <ToggleRow
            label="Detailed Wine log"
            info="Writes Wine's error messages to wine.log in the install folder. Turn it on if the game won't start, and send the log to the server staff."
            checked={w.debugLog}
            onChange={(debugLog) => setWine({ debugLog })}
          />
          <div className="row">
            <span className="row-label">Last Wine log</span>
            <button onClick={() => window.api.openWineLog()}>Open log</button>
          </div>
          <div className="row stack-row">
            <span className="row-label">
              Environment variables
              <Info text="Advanced: extra settings passed to Wine, one NAME=value per line. Examples: DXVK_HUD=fps, MANGOHUD=1, WINE_FULLSCREEN_FSR=1." />
            </span>
            <textarea rows={4} spellCheck={false} placeholder={'DXVK_HUD=fps'} value={w.extraEnv} onChange={(e) => setWine({ extraEnv: e.target.value })} />
          </div>
        </Section>
      </div>
    </div>
  )
}
