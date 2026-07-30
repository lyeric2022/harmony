import { useEffect, useMemo, useState } from 'react'
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

type Step = 'home' | 'house' | 'value' | 'results'

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

  useEffect(() => {
    const stored = loadStored()
    if (stored) {
      if (stored.rooms?.length === 4) setRooms(stored.rooms)
      if (stored.percents?.length === 4) setPercents(stored.percents)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveStored({ rooms, percents })
  }, [hydrated, rooms, percents])

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
    setLocked((prev) =>
      prev.map((row, i) =>
        i === person ? row.map((v, j) => (j === room ? !v : v)) : row,
      ),
    )
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
  }

  function unlockedCount() {
    return activeLocks.filter((v) => !v).length
  }

  function runDiscovery() {
    const matrix = percents.map((row) => renormalize(row))
    setPercents(matrix)
    setResult(divideRent(percentsToValues(matrix, RENT), RENT))
    setStep('results')
  }

  return (
    <div className="shell">
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
              Pass the phone. Each room is {PCT_MIN}–{PCT_MAX}% of {money(RENT)}.
              Drag one — unlocked rooms rebalance. Lock to freeze a share.
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
                    const dollars = (pct / 100) * RENT
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
                            <span className="room-price">{money(dollars)}</span>
                            <span className="room-pct">{pct.toFixed(1)}%</span>
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
              {activePerson < PEOPLE.length - 1 ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setActivePerson((p) => p + 1)
                  }}
                >
                  Next: {PEOPLE[activePerson + 1].name}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={runDiscovery}
                >
                  Run price discovery
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
              Envy-free rent division for this house. Values persist in this
              browser so you can pass the laptop around.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
