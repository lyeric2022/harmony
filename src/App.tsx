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
} from './lib/house'
import { fetchHouse, saveHouse, supabaseConfigured } from './lib/sync'

type SyncStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'offline'

type Step = 'home' | 'house' | 'value' | 'results' | 'how'

type ToastTone = 'ok' | 'bad' | 'neutral'
type Toast = { id: number; message: string; tone: ToastTone }

function money(n: number) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
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

const IDENTITY_KEY = 'rent-split-identity'

function readStoredIdentity(): number | null {
  try {
    const id = sessionStorage.getItem(IDENTITY_KEY)
    if (!id) return null
    const idx = PEOPLE.findIndex((p) => p.id === id)
    return idx >= 0 ? idx : null
  } catch {
    return null
  }
}

export default function App() {
  const [step, setStep] = useState<Step>('home')
  const [rooms] = useState(DEFAULT_ROOMS)
  const [activePerson, setActivePerson] = useState(0)
  const [identity, setIdentity] = useState<number | null>(() =>
    readStoredIdentity(),
  )
  const [confirmPerson, setConfirmPerson] = useState<number | null>(null)
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
  const afterConfirm = useRef<(() => void) | null>(null)
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
      // Rooms are fixed (not user-editable); only percents sync.
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
        return 'Loading…'
      case 'saving':
        return 'Saving…'
      case 'saved':
        return 'Saved'
      case 'ready':
        return 'Synced'
      case 'error':
        return 'Sync error'
      case 'offline':
        return 'Local'
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
    { id: 'house' as const, label: 'Rooms' },
    { id: 'value' as const, label: 'Values' },
    { id: 'results' as const, label: 'Split' },
    { id: 'how' as const, label: 'How' },
  ]
  const stepIndex = stepMeta.findIndex((s) => s.id === step)
  const canEdit = identity !== null && identity === activePerson

  function claimIdentity(personIdx: number) {
    setIdentity(personIdx)
    setActivePerson(personIdx)
    try {
      sessionStorage.setItem(IDENTITY_KEY, PEOPLE[personIdx].id)
    } catch {
      /* ignore */
    }
    pushToast(`Editing as ${PEOPLE[personIdx].name}`, 'ok')
  }

  /** Trust gate: confirm who you are before viewing/editing that person’s values. */
  function askIdentity(personIdx: number, onDone?: () => void) {
    if (identity === personIdx) {
      setActivePerson(personIdx)
      onDone?.()
      return
    }
    afterConfirm.current = onDone ?? null
    setConfirmPerson(personIdx)
  }

  function goToValues(personIdx?: number) {
    const target = personIdx ?? identity ?? 0
    askIdentity(target, () => setStep('value'))
  }

  function goToStep(next: Step) {
    if (next === 'value') {
      goToValues()
      return
    }
    if (next === 'results' && !result) {
      pushToast('Enter values first, then see the split', 'neutral')
      return
    }
    setStep(next)
  }

  function setPercent(person: number, room: number, value: number) {
    if (identity !== person) return
    setPercents((prev) => {
      const locks = locked[person] ?? Array(prev[person].length).fill(false)
      const next = prev.map((row, i) =>
        i === person ? redistributePercents(row, locks, room, value) : row,
      )
      return next
    })
  }

  function toggleLock(person: number, room: number) {
    if (identity !== person) return
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
    if (!canEdit) return
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

  const confirmName =
    confirmPerson !== null ? PEOPLE[confirmPerson].name : null

  return (
    <div className={`shell step-${step}`}>
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

      {confirmPerson !== null && confirmName && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setConfirmPerson(null)
            afterConfirm.current = null
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="identity-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="modal-eyebrow">Trust check</p>
            <h2 id="identity-title" className="modal-title">
              Are you {confirmName}?
            </h2>
            <p className="modal-copy">
              Only continue if that&apos;s you. This is honor-system — no login.
            </p>

            {identity === null && (
              <div className="identity-pick">
                {PEOPLE.map((person, i) => (
                  <button
                    key={person.id}
                    type="button"
                    className={`identity-option ${confirmPerson === i ? 'active' : ''}`}
                    onClick={() => setConfirmPerson(i)}
                  >
                    {person.name}
                  </button>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirmPerson(null)
                  afterConfirm.current = null
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const idx = confirmPerson
                  const done = afterConfirm.current
                  afterConfirm.current = null
                  setConfirmPerson(null)
                  claimIdentity(idx)
                  done?.()
                }}
              >
                Yes, I&apos;m {confirmName}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container">
        <header className="nav">
          <button
            type="button"
            className="nav-home"
            onClick={() => setStep('home')}
          >
            <strong className="rent-chip">{money(RENT)}</strong>
            <span
              className={`sync-pill ${syncStatus === 'error' ? 'bad' : syncStatus === 'saved' || syncStatus === 'ready' ? 'ok' : ''}`}
              title={
                syncError ??
                (lastSavedAt
                  ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                  : undefined)
              }
            >
              {syncLabel()}
            </span>
          </button>
          {step !== 'home' && (
            <nav className="steps" aria-label="Steps">
              {stepMeta.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`step ${s.id === step ? 'active' : i < stepIndex ? 'done' : ''}`}
                  onClick={() => goToStep(s.id)}
                >
                  <span className="step-num">{i + 1}</span>
                  <span className="step-label">{s.label}</span>
                </button>
              ))}
            </nav>
          )}
        </header>

        {step === 'home' && (
          <section className="section">
            <div className="hero-grid">
              <div>
                <span className="eyebrow">Eric · Jhona · Rian · Jake</span>
                <h1 className="section-title display">Rent split</h1>
                <p className="section-copy">
                  Four bedrooms. Everyone rates perceived value, then we find
                  prices so nobody wants to swap — {money(RENT)} total.
                </p>
                <div className="cta-row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => goToValues()}
                  >
                    Enter my values
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setStep('how')}
                  >
                    How it works
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setStep('house')}
                  >
                    Rooms
                  </button>
                </div>
              </div>

              <aside className="hero-panel">
                <h2>The crew</h2>
                <ul className="crew-list">
                  {PEOPLE.map((p, i) => (
                    <li key={p.id}>
                      <span className="num">
                        {String(i + 1).padStart(2, '0')}
                      </span>
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
            <h1 className="section-title">Rooms</h1>
            <p className="section-copy">
              {money(RENT)} / mo. Numbers match the floor plan.
            </p>

            <div className="form-stack">
              <figure className="floor-figure">
                <img
                  src={FLOOR_PLAN}
                  alt="Floor plan with bedrooms numbered 1–4"
                />
                <figcaption>Bedrooms 1–4</figcaption>
              </figure>

              <div className="room-list">
                {rooms.map((room) => (
                  <div className="room-list-card" key={room.id}>
                    <span className="room-num">{room.number}</span>
                    <div className="room-list-fields">
                      <strong className="room-fixed-name">{room.name}</strong>
                      <p className="note">{room.notes}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="actions inline-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => goToValues()}
                >
                  Enter my values
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 'value' && (
          <section className="section section-value">
            <h1 className="section-title">Your values</h1>
            <p className="section-copy">
              Drag or type $ / % ({PCT_MIN}–{PCT_MAX}% each). Autosaves for the
              group.
            </p>

            <div className="tabs" role="tablist" aria-label="Roommate">
              {PEOPLE.map((person, i) => (
                <button
                  key={person.id}
                  type="button"
                  role="tab"
                  aria-selected={i === activePerson}
                  className={`tab ${i === activePerson ? 'active' : ''} ${identity === i ? 'claimed' : ''}`}
                  onClick={() => askIdentity(i)}
                >
                  {person.name}
                </button>
              ))}
            </div>

            {!canEdit && (
              <div className="identity-banner">
                <span>
                  Confirm you&apos;re {PEOPLE[activePerson].name} to edit.
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => askIdentity(activePerson)}
                >
                  I&apos;m {PEOPLE[activePerson].name}
                </button>
              </div>
            )}

            <details className="floor-details mobile-only">
              <summary>Floor plan</summary>
              <figure className="floor-figure">
                <img src={FLOOR_PLAN} alt="Floor plan reference" />
              </figure>
            </details>

            <div className="value-layout">
              <figure className="value-floor desktop-only">
                <img src={FLOOR_PLAN} alt="Floor plan reference" />
              </figure>

              <div className={`panel ${!canEdit ? 'panel-locked' : ''}`}>
                <div className="valuations">
                  {rooms.map((room, roomIdx) => {
                    const pct = activeRow[roomIdx] ?? 0
                    const isLocked = activeLocks[roomIdx]
                    const disabled =
                      !canEdit || isLocked || unlockedCount() <= 1
                    return (
                      <div
                        className={`room-row ${isLocked ? 'locked' : ''}`}
                        key={room.id}
                      >
                        <div className="room-row-top">
                          <div className="room-row-title">
                            <strong>
                              {room.number}. {room.name}
                            </strong>
                            {room.notes && (
                              <p className="note">{room.notes}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`lock-btn ${isLocked ? 'on' : ''}`}
                            aria-pressed={isLocked}
                            disabled={!canEdit}
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
                        <div className="room-row-stats">
                          <ManualValueInputs
                            pct={pct}
                            roomName={room.name}
                            disabled={disabled}
                            onCommitPct={(value) =>
                              setPercent(activePerson, roomIdx, value)
                            }
                          />
                        </div>
                        <div className="range-scale" aria-hidden>
                          <span>{PCT_MIN}%</span>
                          <span>{PCT_MAX}%</span>
                        </div>
                        <input
                          type="range"
                          min={PCT_MIN}
                          max={PCT_MAX}
                          step={0.5}
                          disabled={disabled}
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
                  <span>{PEOPLE[activePerson].name}</span>
                  <span>
                    {money((currentSum / 100) * RENT)} · {currentSum.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="footer-spacer" aria-hidden />
          </section>
        )}

        {step === 'how' && (
          <section className="section section-how">
            <h1 className="section-title">How it works</h1>
            <p className="section-copy">
              Fair rent from what each person thinks each bedroom is worth — not
              from square footage alone.
            </p>

            <div className="how-stack">
              <article className="how-card">
                <h2>1. Everyone values the rooms</h2>
                <p>
                  Total rent is locked at <strong>{money(RENT)}</strong>. Each
                  person splits that into four shares — one per bedroom — using
                  percents (or dollars). Shares must sum to 100%, and each room
                  stays between {PCT_MIN}% and {PCT_MAX}% so nobody can zero out
                  a room or claim almost everything.
                </p>
                <p>
                  Your numbers mean: “If I paid this much for this room, I’d feel
                  indifferent about which room I got.” Higher % = you want that
                  room more (or think it’s worth more).
                </p>
              </article>

              <article className="how-card">
                <h2>2. Example — one person’s values</h2>
                <p>Suppose Eric sees the house like this:</p>
                <div className="how-table" role="table" aria-label="Example values">
                  <div className="how-row how-head" role="row">
                    <span role="columnheader">Room</span>
                    <span role="columnheader">His %</span>
                    <span role="columnheader">In $</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Bedroom 1 (downstairs)</span>
                    <span>20%</span>
                    <span>{money(RENT * 0.2)}</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Bedroom 2 (largest / L)</span>
                    <span>35%</span>
                    <span>{money(RENT * 0.35)}</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Bedroom 3</span>
                    <span>25%</span>
                    <span>{money(RENT * 0.25)}</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Bedroom 4 (over void)</span>
                    <span>20%</span>
                    <span>{money(RENT * 0.2)}</span>
                  </div>
                </div>
                <p>
                  So Eric would be happy paying about {money(RENT * 0.35)} for
                  Bedroom 2, but only {money(RENT * 0.2)} for Bedroom 4. Jhona,
                  Rian, and Jake each submit their own row — maybe Jhona loves
                  the downstairs room and puts 32% on Bedroom 1.
                </p>
              </article>

              <article className="how-card">
                <h2>3. The app assigns rooms + prices</h2>
                <p>
                  After all four rows are in, we solve an{' '}
                  <strong>envy-free rent division</strong> (same idea as
                  Spliddit / the NYT rent calculator):
                </p>
                <ul>
                  <li>
                    Each person gets exactly one bedroom.
                  </li>
                  <li>
                    The four prices add up to {money(RENT)}.
                  </li>
                  <li>
                    <strong>Envy-free:</strong> at those prices, nobody prefers
                    someone else’s room to their own. In other words, for every
                    person, (value of my room − my price) ≥ (value of your room −
                    your price).
                  </li>
                  <li>
                    Among envy-free solutions, we prefer ones that maximize the
                    worst-off person’s surplus (value − price) — so the split
                    isn’t only “fair,” it’s also trying to leave everyone as
                    whole as possible.
                  </li>
                </ul>
              </article>

              <article className="how-card">
                <h2>4. Do you pay what you bid — or less?</h2>
                <p>
                  <strong>Not exactly your bid, and not “the cheapest room you
                  listed.”</strong> You get one assigned room and a price for
                  that room.
                </p>
                <ul>
                  <li>
                    When the result shows <strong>Fair split</strong>{' '}
                    (envy-free), each person pays{' '}
                    <strong>at most</strong> what they said that assigned room
                    was worth — usually less. Your surplus (value − price) for
                    your room is ≥ 0, and at least as good as any other room at
                    its price.
                  </li>
                  <li>
                    Example: you put 30% on Bedroom 2 → {money(RENT * 0.3)}. If
                    you’re assigned Bedroom 2, you’ll pay ≤ {money(RENT * 0.3)},
                    not more.
                  </li>
                  <li>
                    You might get a room that wasn’t your #1. That’s fine if its
                    price is low enough that you still prefer that deal to
                    paying more for a “nicer” room.
                  </li>
                  <li>
                    If the badge says <strong>Approximate</strong>, the
                    guarantee can slip — re-tweak values and run again.
                  </li>
                </ul>
              </article>

              <article className="how-card">
                <h2>5. Example — reading the result</h2>
                <p>Imagine the outcome looks like:</p>
                <div className="how-table" role="table" aria-label="Example split">
                  <div className="how-row how-head" role="row">
                    <span role="columnheader">Person</span>
                    <span role="columnheader">Room</span>
                    <span role="columnheader">Pays</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Eric</span>
                    <span>Bedroom 3</span>
                    <span>{money(1800)}</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Jhona</span>
                    <span>Bedroom 1</span>
                    <span>{money(2100)}</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Rian</span>
                    <span>Bedroom 2</span>
                    <span>{money(2200)}</span>
                  </div>
                  <div className="how-row" role="row">
                    <span>Jake</span>
                    <span>Bedroom 4</span>
                    <span>{money(1460)}</span>
                  </div>
                </div>
                <p>
                  Rian pays more because the group (and Rian) valued Bedroom 2
                  highly. Jake pays less for Bedroom 4. Eric might have valued
                  Bedroom 2 even higher than Rian, but if Eric’s surplus is still
                  best in Bedroom 3 at {money(1800)}, he doesn’t envy Rian’s
                  deal — that’s the envy-free check.
                </p>
                <p>
                  If Eric valued Bedroom 2 at {money(RENT * 0.35)} and it costs
                  {money(2200)}, his surplus there would be{' '}
                  {money(RENT * 0.35 - 2200)}. If Bedroom 3 is worth{' '}
                  {money(RENT * 0.25)} to him at a price of {money(1800)}, surplus
                  is {money(RENT * 0.25 - 1800)}. Whichever surplus is higher is
                  the room he’d rather have; the solver picks prices/assignment
                  so each person’s own room wins that comparison.
                </p>
              </article>

              <article className="how-card">
                <h2>6. Practical tips for this house</h2>
                <ul>
                  <li>
                    Confirm you&apos;re you before editing — honor system, but it
                    stops accidental overwrites.
                  </li>
                  <li>
                    Lock a room once you’re happy with its share; the other
                    unlocked rooms rebalance to keep the total at 100%.
                  </li>
                  <li>
                    Values autosave to the shared cloud. Last write wins — talk
                    to each other if two people edit at once.
                  </li>
                  <li>
                    Square footage is a signal (~110 / 130 / 80 / 65 sq ft for
                    rooms 1–4), not the answer. Light, noise, ensuite, and the
                    void matter too — that’s why we use perceived value.
                  </li>
                </ul>
              </article>

              <div className="actions inline-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => goToValues()}
                >
                  Enter my values
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setStep('house')}
                >
                  See rooms
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 'results' && result && (
          <section className="section">
            <span className={`badge ${result.envyFree ? 'ok' : ''}`}>
              {result.envyFree ? 'Fair split' : 'Approximate'}
            </span>
            <h1 className="section-title">Prices</h1>
            <p className="section-copy">
              {money(RENT)} total. Nobody should want to swap at these prices.
            </p>

            <div className="result-grid">
              {result.assignment.map((roomIdx, personIdx) => {
                const room = rooms[roomIdx]
                return (
                  <div className="result-card" key={PEOPLE[personIdx].id}>
                    <div className="result-num">{room.number}</div>
                    <div className="result-meta">
                      <strong>{PEOPLE[personIdx].name}</strong>
                      <span>{room.name}</span>
                    </div>
                    <div className="result-price">
                      {money(result.prices[roomIdx])}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="insight">
              <h3>Group average</h3>
              <p>
                {rooms
                  .map((r, i) => `${r.name} ${avg[i]?.toFixed(1)}%`)
                  .join(' · ')}
              </p>
            </div>

            <div className="actions inline-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => goToValues()}
              >
                Adjust values
              </button>
            </div>
          </section>
        )}
      </div>

      {step === 'value' && (
        <div className="sticky-footer">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!canEdit}
            onClick={resetEqualActive}
          >
            Reset
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!canEdit || !supabaseConfigured}
            onClick={() => saveNow('Saved')}
          >
            Save
          </button>
          {activePerson < PEOPLE.length - 1 ? (
            <button
              className="btn btn-primary sticky-primary"
              type="button"
              onClick={() => {
                if (canEdit) saveNow('Saved')
                askIdentity(activePerson + 1)
              }}
            >
              Next · {PEOPLE[activePerson + 1].name}
            </button>
          ) : (
            <button
              className="btn btn-primary sticky-primary"
              type="button"
              onClick={() => {
                if (canEdit) saveNow('Saved')
                runDiscovery()
              }}
            >
              See split
            </button>
          )}
        </div>
      )}
    </div>
  )
}
