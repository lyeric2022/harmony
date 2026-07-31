import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  averagePercents,
  divideRent,
  percentsToValues,
  type DivisionResult,
} from './lib/rentDivision'
import {
  DEFAULT_ROOMS,
  FLOOR_PLAN,
  PCT_MAX,
  PCT_MIN,
  PEOPLE,
  RENT,
  equalPercents,
  loadStored,
  redistributePercents,
  renormalize,
  saveStored,
  type Room,
} from './lib/house'
import { fetchHouse, saveHouse, supabaseConfigured } from './lib/sync'

type SyncStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'offline'

type Step = 'home' | 'house' | 'value' | 'results'

type ToastTone = 'ok' | 'bad' | 'neutral'
type Toast = { id: number; message: string; tone: ToastTone }

function money(n: number) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M5 17V10.5L12 5.5l7 5V17"
          stroke="#191918"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <rect x="10" y="12" width="4" height="4" rx="1" fill="#A71D31" />
      </svg>
    </span>
  )
}

/** Editable $ / % fields; commit on blur or Enter so typing isn't fighty. */
function ManualValueInputs({
  pct,
  roomName,
  disabled,
  onCommitPct,
}: {
  pct: number
  roomName: string
  disabled: boolean
  onCommitPct: (pct: number) => void
}) {
  const dollars = (pct / 100) * RENT
  const [pctDraft, setPctDraft] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState<string | null>(null)

  function commitPct(raw: string) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    onCommitPct(n)
  }

  function commitPrice(raw: string) {
    const n = Number(raw.replace(/[$,\s]/g, ''))
    if (!Number.isFinite(n)) return
    onCommitPct((n / RENT) * 100)
  }

  return (
    <div className="manual-inputs">
      <label className="manual-field price">
        <span className="manual-prefix">$</span>
        <input
          className="manual-input"
          type="text"
          inputMode="decimal"
          disabled={disabled}
          aria-label={`Dollar value for ${roomName}`}
          value={
            priceDraft ??
            String(Math.round(dollars))
          }
          onFocus={() => setPriceDraft(String(Math.round(dollars)))}
          onChange={(e) => setPriceDraft(e.target.value)}
          onBlur={() => {
            if (priceDraft !== null) commitPrice(priceDraft)
            setPriceDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
      </label>
      <label className="manual-field pct">
        <input
          className="manual-input"
          type="text"
          inputMode="decimal"
          disabled={disabled}
          aria-label={`Percent value for ${roomName}`}
          value={pctDraft ?? pct.toFixed(1)}
          onFocus={() => setPctDraft(pct.toFixed(1))}
          onChange={(e) => setPctDraft(e.target.value)}
          onBlur={() => {
            if (pctDraft !== null) commitPct(pctDraft)
            setPctDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <span className="manual-suffix">%</span>
      </label>
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState<Step>('home')
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS)
  const [activePerson, setActivePerson] = useState(0)
  const [percents, setPercents] = useState<number[][]>(
    PEOPLE.map(() => equalPercents(4)),
  )
  const [locked, setLocked] = useState<boolean[][]>(
    PEOPLE.map(() => Array(4).fill(false)),
  )
  const [result, setResult] = useState<DivisionResult | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    supabaseConfigured ? 'loading' : 'offline',
  )
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const skipNextSave = useRef(true)
  const saveGen = useRef(0)
  const toastId = useRef(0)
  const autosaveTimer = useRef<number | null>(null)
  const draftRef = useRef({ rooms, percents })
  draftRef.current = { rooms, percents }

  function pushToast(message: string, tone: ToastTone = 'neutral') {
    const id = ++toastId.current
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2800)
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  /** Mark saved in the UI immediately; confirm (or fail) in the background. */
  function persistOptimistic(toast?: string) {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }

    if (!supabaseConfigured) {
      if (toast) pushToast(toast, 'ok')
      return
    }
    const at = new Date().toISOString()
    setLastSavedAt(at)
    setSyncStatus('saved')
    setSyncError(null)
    if (toast) pushToast(toast, 'ok')

    const gen = ++saveGen.current
    const payload = {
      rooms: draftRef.current.rooms,
      percents: draftRef.current.percents,
    }
    void (async () => {
      try {
        const remote = await saveHouse(payload)
        if (gen !== saveGen.current) return
        setLastSavedAt(remote.updated_at)
        setSyncStatus('saved')
        setSyncError(null)
      } catch (err) {
        if (gen !== saveGen.current) return
        const message = err instanceof Error ? err.message : 'Failed to save'
        setSyncStatus('error')
        setSyncError(message)
        pushToast(`Couldn’t save — ${message}`, 'bad')
      }
    })()
  }

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const local = loadStored()
      // Optimistic: paint local draft immediately, then reconcile with cloud.
      if (local?.rooms?.length === 4) setRooms(local.rooms)
      if (local?.percents?.length === 4) setPercents(local.percents)

      if (!supabaseConfigured) {
        setSyncStatus('offline')
        setHydrated(true)
        pushToast('Local only — cloud sync off', 'neutral')
        return
      }

      try {
        const remote = await fetchHouse()
        if (cancelled) return
        if (remote?.rooms?.length === 4) setRooms(remote.rooms)
        if (remote?.percents?.length === 4) setPercents(remote.percents)
        if (remote?.updated_at) setLastSavedAt(remote.updated_at)
        setSyncStatus('ready')
        setSyncError(null)
        pushToast(
          remote ? 'Loaded shared values' : 'No cloud draft yet — you’re first',
          'ok',
        )
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load'
        setSyncStatus('error')
        setSyncError(message)
        pushToast(`Couldn’t load cloud — using local`, 'bad')
      } finally {
        if (!cancelled) {
          skipNextSave.current = true
          setHydrated(true)
        }
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveStored({ rooms, percents })
  }, [hydrated, rooms, percents])

  useEffect(() => {
    if (!hydrated || !supabaseConfigured) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    // Optimistic UI: show saved now; toast + network after debounce.
    const at = new Date().toISOString()
    setLastSavedAt(at)
    setSyncStatus('saved')
    setSyncError(null)

    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current)
    }
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null
      persistOptimistic('Saved')
    }, 600)
    return () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
      }
    }
  }, [hydrated, rooms, percents])

  function saveNow(toast = 'Saved') {
    persistOptimistic(toast)
  }

  function syncLabel() {
    switch (syncStatus) {
      case 'loading':
        return 'Loading shared values…'
      case 'saving':
        return 'Saving…'
      case 'saved':
        return lastSavedAt
          ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString()}`
          : 'Saved'
      case 'ready':
        return 'Cloud sync ready'
      case 'error':
        return syncError ? `Sync error: ${syncError}` : 'Sync error'
      case 'offline':
        return 'Local only (no cloud)'
    }
  }

  const activeRow = percents[activePerson] ?? equalPercents(4)
  const activeLocks = locked[activePerson] ?? Array(4).fill(false)

  const currentSum = useMemo(
    () => activeRow.reduce((a, b) => a + b, 0),
    [activeRow],
  )

  const avg = averagePercents(percents.map((row) => renormalize(row)))

  const stepMeta = [
    { id: 'house' as const, label: 'House' },
    { id: 'value' as const, label: 'Value' },
    { id: 'results' as const, label: 'Discover' },
  ]
  const stepIndex = stepMeta.findIndex((s) => s.id === step)

  function updateRoom(idx: number, patch: Partial<Room>) {
    setRooms((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function setPercent(person: number, room: number, value: number) {
    setPercents((prev) => {
      const locks = locked[person] ?? Array(prev[person].length).fill(false)
      const next = prev.map((row, i) =>
        i === person ? redistributePercents(row, locks, room, value) : row,
      )
      return next
    })
  }

  function toggleLock(person: number, room: number) {
    const willLock = !(locked[person]?.[room] ?? false)
    setLocked((prev) =>
      prev.map((row, i) =>
        i === person ? row.map((v, j) => (j === room ? !v : v)) : row,
      ),
    )
    const roomName = rooms[room]?.name ?? `Room ${room + 1}`
    pushToast(willLock ? `Locked ${roomName}` : `Unlocked ${roomName}`)
  }

  function resetEqualActive() {
    setPercents((prev) =>
      prev.map((row, i) =>
        i === activePerson ? equalPercents(rooms.length) : row,
      ),
    )
    setLocked((prev) =>
      prev.map((row, i) =>
        i === activePerson ? Array(rooms.length).fill(false) : row,
      ),
    )
    pushToast(`Reset ${PEOPLE[activePerson].name} to equal`, 'ok')
  }

  function unlockedCount() {
    return activeLocks.filter((v) => !v).length
  }

  function runDiscovery() {
    const matrix = percents.map((row) => renormalize(row))
    setPercents(matrix)
    const next = divideRent(percentsToValues(matrix, RENT), RENT)
    setResult(next)
    setStep('results')
    pushToast(
      next.envyFree ? 'Envy-free split ready' : 'Approximate split ready',
      'ok',
    )
  }

  return (
    <div className="shell">
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`toast toast-${t.tone}`}
            onClick={() => dismissToast(t.id)}
          >
            {t.message}
          </button>
        ))}
      </div>
      <div className="container">
        <header className="nav">
          <a
            className="brand"
            href="#home"
            onClick={(e) => {
              e.preventDefault()
              setStep('home')
            }}
          >
            <BrandMark />
            <span className="brand-name">Harmony</span>
          </a>

          <div className="nav-right">
            <span
              className={`sync-pill ${syncStatus === 'error' ? 'bad' : syncStatus === 'saved' || syncStatus === 'ready' ? 'ok' : ''}`}
              title={syncError ?? undefined}
            >
              {syncLabel()}
            </span>
            {step !== 'home' && (
              <nav className="steps" aria-label="Progress">
                {stepMeta.map((s, i) => (
                  <span
                    key={s.id}
                    className={`step ${s.id === step ? 'active' : i < stepIndex ? 'done' : ''}`}
                  >
                    {String(i + 1).padStart(2, '0')} {s.label}
                  </span>
                ))}
              </nav>
            )}
          </div>
        </header>

        {step === 'home' && (
          <section className="section">
            <div className="hero-grid">
              <div>
                <span className="eyebrow">Eric · Jhona · Rian · Jake</span>
                <h1 className="section-title display">Harmony</h1>
                <p className="section-copy">
                  Four bedrooms. Four valuations. Envy-free rent — so the split
                  comes from perceived value, not arbitrary math.
                </p>
                <div className="cta-row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setStep('house')}
                  >
                    Open the house
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      setActivePerson(0)
                      setStep('value')
                    }}
                  >
                    Jump to values
                  </button>
                </div>
              </div>

              <aside className="hero-panel">
                <h2>The crew</h2>
                <ul className="crew-list">
                  {PEOPLE.map((p, i) => (
                    <li key={p.id}>
                      <span className="num">{String(i + 1).padStart(2, '0')}</span>
                      <strong>{p.name}</strong>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>

            <figure className="floor-figure home-floor">
              <img src={FLOOR_PLAN} alt="Floor plan with bedrooms numbered 1–4" />
              <figcaption>Bedrooms 1–4</figcaption>
            </figure>
          </section>
        )}

        {step === 'house' && (
          <section className="section">
            <span className="eyebrow">01 / House</span>
            <h1 className="section-title">The rooms</h1>
            <p className="section-copy">
              Total rent is locked at {money(RENT)}. Confirm room labels —
              numbers match the floor plan.
            </p>

            <div className="form-stack">
              <div className="rent-lock">
                <span className="field-label">Monthly rent</span>
                <strong>{money(RENT)}</strong>
                <span className="rent-lock-tag">Locked</span>
              </div>

              <figure className="floor-figure">
                <img src={FLOOR_PLAN} alt="Floor plan with bedrooms numbered 1–4" />
                <figcaption>Bedrooms 1–4</figcaption>
              </figure>

              <div className="room-list">
                {rooms.map((room, idx) => (
                  <div className="room-list-card" key={room.id}>
                    <span className="room-num">{room.number}</span>
                    <div className="room-list-fields">
                      <label className="field">
                        <span className="field-label">Name</span>
                        <input
                          className="input"
                          type="text"
                          value={room.name}
                          onChange={(e) => updateRoom(idx, { name: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Notes</span>
                        <input
                          className="input"
                          type="text"
                          value={room.notes}
                          onChange={(e) => updateRoom(idx, { notes: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setStep('home')}
                >
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setActivePerson(0)
                    setStep('value')
                  }}
                >
                  Rate the rooms
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 'value' && (
          <section className="section">
            <span className="eyebrow">02 / Value</span>
            <h1 className="section-title">Perceived value</h1>
            <p className="section-copy">
              Pass the phone (or open the same link). Drag the slider or type a
              % or $ — each room stays {PCT_MIN}–{PCT_MAX}% of {money(RENT)}.
              Values autosave; anyone can edit and overwrite.
            </p>

            <div className="tabs" role="tablist" aria-label="Roommate">
              {PEOPLE.map((person, i) => (
                <button
                  key={person.id}
                  type="button"
                  role="tab"
                  aria-selected={i === activePerson}
                  className={`tab ${i === activePerson ? 'active' : ''}`}
                  onClick={() => setActivePerson(i)}
                >
                  {person.name}
                </button>
              ))}
            </div>

            <div className="value-layout">
              <figure className="value-floor">
                <img src={FLOOR_PLAN} alt="Floor plan reference" />
                <figcaption>Floor plan</figcaption>
              </figure>

              <div className="panel">
                <div className="valuations">
                  {rooms.map((room, roomIdx) => {
                    const pct = activeRow[roomIdx] ?? 0
                    const isLocked = activeLocks[roomIdx]
                    return (
                      <div
                        className={`room-row ${isLocked ? 'locked' : ''}`}
                        key={room.id}
                      >
                        <div className="room-row-top">
                          <strong>
                            {room.number}. {room.name}
                          </strong>
                          <div className="room-row-stats">
                            <ManualValueInputs
                              pct={pct}
                              roomName={room.name}
                              disabled={isLocked || unlockedCount() <= 1}
                              onCommitPct={(value) =>
                                setPercent(activePerson, roomIdx, value)
                              }
                            />
                            <button
                              type="button"
                              className={`lock-btn ${isLocked ? 'on' : ''}`}
                              aria-pressed={isLocked}
                              aria-label={
                                isLocked
                                  ? `Unlock ${room.name}`
                                  : `Lock ${room.name}`
                              }
                              onClick={() => toggleLock(activePerson, roomIdx)}
                            >
                              {isLocked ? 'Locked' : 'Lock'}
                            </button>
                          </div>
                        </div>
                        {room.notes && <p className="note">{room.notes}</p>}
                        <div className="range-scale" aria-hidden>
                          <span>{PCT_MIN}%</span>
                          <span>{PCT_MAX}%</span>
                        </div>
                        <input
                          type="range"
                          min={PCT_MIN}
                          max={PCT_MAX}
                          step={0.5}
                          disabled={isLocked || unlockedCount() <= 1}
                          aria-label={`Value for ${room.name}`}
                          value={Math.min(PCT_MAX, Math.max(PCT_MIN, pct))}
                          onChange={(e) =>
                            setPercent(
                              activePerson,
                              roomIdx,
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    )
                  })}
                </div>

                <div
                  className={`sum-bar ${Math.abs(currentSum - 100) > 0.2 ? 'warn' : ''}`}
                >
                  <span>{PEOPLE[activePerson].name}&apos;s total</span>
                  <span>
                    {money((currentSum / 100) * RENT)} · {currentSum.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="actions" style={{ marginTop: 24 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setStep('house')}
              >
                Back
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={resetEqualActive}
              >
                Reset equal
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={!supabaseConfigured}
                onClick={() => saveNow('Saved')}
              >
                Save now
              </button>
              {activePerson < PEOPLE.length - 1 ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    const next = PEOPLE[activePerson + 1].name
                    saveNow(`Saved · ${next} next`)
                    setActivePerson((p) => p + 1)
                  }}
                >
                  Save · next {PEOPLE[activePerson + 1].name}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    saveNow('Saved')
                    runDiscovery()
                  }}
                >
                  Save · discover
                </button>
              )}
            </div>
          </section>
        )}

        {step === 'results' && result && (
          <section className="section">
            <span className="eyebrow">03 / Discover</span>
            <span className={`badge ${result.envyFree ? 'ok' : ''}`}>
              {result.envyFree ? 'Envy-free split' : 'Approximate split'}
            </span>
            <h1 className="section-title">Your fair prices</h1>
            <p className="section-copy">
              Total {money(RENT)} for Eric, Jhona, Rian, and Jake. Nobody should
              want to swap rooms at these prices.
            </p>

            <div className="result-grid">
              {result.assignment.map((roomIdx, personIdx) => {
                const room = rooms[roomIdx]
                return (
                  <div className="result-card" key={PEOPLE[personIdx].id}>
                    <div className="result-num">{room.number}</div>
                    <div className="result-meta">
                      <strong>{PEOPLE[personIdx].name}</strong>
                      <span>
                        {room.name}
                        {room.notes ? ` · ${room.notes}` : ''}
                      </span>
                    </div>
                    <div className="result-price">
                      {money(result.prices[roomIdx])}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="insight">
              <h3>Group signal</h3>
              <p>
                Averaged perceived value:{' '}
                {rooms
                  .map((r, i) => `${r.name} ${avg[i]?.toFixed(1)}%`)
                  .join(' · ')}
                .
              </p>
            </div>

            <div className="actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setStep('value')}
              >
                Adjust values
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setStep('home')}
              >
                Home
              </button>
            </div>

            <p className="footer-note">
              Envy-free rent division for this house. Everyone&apos;s values are
              stored in Supabase (`harmony_houses` / crew) and reload for anyone
              with the link.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
