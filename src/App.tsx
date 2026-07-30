import { useMemo, useState } from 'react'
import './App.css'
import {
  averagePercents,
  divideRent,
  percentsToValues,
  type DivisionResult,
} from './lib/rentDivision'

type Step = 'home' | 'setup' | 'value' | 'results'

const DEFAULT_ROOMS = ['Room 1', 'Room 2', 'Room 3']
const DEFAULT_PEOPLE = ['Alex', 'Blake', 'Casey']

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

function equalPercents(n: number) {
  const base = Math.floor((100 / n) * 10) / 10
  const row = Array(n).fill(base)
  const drift = 100 - base * n
  row[n - 1] = Math.round((base + drift) * 10) / 10
  return row
}

function renormalize(row: number[]): number[] {
  const sum = row.reduce((a, b) => a + b, 0)
  if (sum <= 0) return equalPercents(row.length)
  return row.map((x) => Math.round((x / sum) * 1000) / 10)
}

export default function App() {
  const [step, setStep] = useState<Step>('home')
  const [rent, setRent] = useState(3600)
  const [rooms, setRooms] = useState<string[]>(DEFAULT_ROOMS)
  const [people, setPeople] = useState<string[]>(DEFAULT_PEOPLE)
  const [roomDraft, setRoomDraft] = useState('')
  const [personDraft, setPersonDraft] = useState('')
  const [activePerson, setActivePerson] = useState(0)
  const [percents, setPercents] = useState<number[][]>(
    DEFAULT_PEOPLE.map(() => equalPercents(DEFAULT_ROOMS.length)),
  )
  const [result, setResult] = useState<DivisionResult | null>(null)

  const n = Math.min(rooms.length, people.length)
  const readySetup =
    rooms.length >= 2 &&
    people.length >= 2 &&
    rooms.length === people.length &&
    rent > 0

  const currentSum = useMemo(
    () => (percents[activePerson] ?? []).reduce((a, b) => a + b, 0),
    [percents, activePerson],
  )

  const avg = averagePercents(
    percents.slice(0, n).map((row) => renormalize(row.slice(0, n))),
  )

  const stepMeta = [
    { id: 'setup' as const, label: 'Setup' },
    { id: 'value' as const, label: 'Value' },
    { id: 'results' as const, label: 'Discover' },
  ]
  const stepIndex = stepMeta.findIndex((s) => s.id === step)

  function addRoom() {
    const name = roomDraft.trim() || `Room ${rooms.length + 1}`
    setRooms([...rooms, name])
    setRoomDraft('')
    setPercents((prev) => prev.map((row) => renormalize([...row, 0])))
  }

  function addPerson() {
    const name = personDraft.trim() || `Person ${people.length + 1}`
    setPeople([...people, name])
    setPersonDraft('')
    setPercents((prev) => [...prev, equalPercents(rooms.length)])
  }

  function removeRoom(idx: number) {
    if (rooms.length <= 2) return
    setRooms(rooms.filter((_, i) => i !== idx))
    setPercents((prev) =>
      prev.map((row) => renormalize(row.filter((_, i) => i !== idx))),
    )
  }

  function removePerson(idx: number) {
    if (people.length <= 2) return
    setPeople(people.filter((_, i) => i !== idx))
    setPercents((prev) => prev.filter((_, i) => i !== idx))
    setActivePerson(0)
  }

  function setPercent(person: number, room: number, value: number) {
    setPercents((prev) => {
      const next = prev.map((row) => [...row])
      next[person][room] = value
      return next
    })
  }

  function normalizeActive() {
    setPercents((prev) =>
      prev.map((row, i) => (i === activePerson ? renormalize(row) : row)),
    )
  }

  function runDiscovery() {
    const size = Math.min(rooms.length, people.length)
    const trimmedPeople = people.slice(0, size)
    const trimmedRooms = rooms.slice(0, size)
    const matrix = percents
      .slice(0, size)
      .map((row) => renormalize(row.slice(0, size)))
    setPeople(trimmedPeople)
    setRooms(trimmedRooms)
    setPercents(matrix)
    setResult(divideRent(percentsToValues(matrix, rent), rent))
    setStep('results')
  }

  function loadDemo() {
    setRooms(DEFAULT_ROOMS)
    setPeople(DEFAULT_PEOPLE)
    setRent(3600)
    setPercents(DEFAULT_PEOPLE.map(() => equalPercents(3)))
    setActivePerson(0)
    setStep('setup')
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
                <span className="eyebrow">Fair rent division</span>
                <h1 className="section-title display">Harmony</h1>
                <p className="section-copy">
                  Price each bedroom by perceived value, then let an envy-free
                  algorithm discover who pays what — beyond square footage and
                  gut adjustments.
                </p>
                <div className="cta-row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setStep('setup')}
                  >
                    Start price discovery
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={loadDemo}
                  >
                    Try a demo house
                  </button>
                </div>
              </div>

              <aside className="hero-panel" aria-label="How it works">
                <h2>How it works</h2>
                <ol className="hero-list">
                  <li>
                    <span className="num">1</span>
                    <div>
                      <strong>Set the house</strong>
                      <span>Rent, bedrooms, and roommates in equal count.</span>
                    </div>
                  </li>
                  <li>
                    <span className="num">2</span>
                    <div>
                      <strong>Score perceived value</strong>
                      <span>Each person allocates 100% across rooms.</span>
                    </div>
                  </li>
                  <li>
                    <span className="num">3</span>
                    <div>
                      <strong>Discover prices</strong>
                      <span>Assignment and rent so nobody wants to swap.</span>
                    </div>
                  </li>
                </ol>
              </aside>
            </div>
          </section>
        )}

        {step === 'setup' && (
          <section className="section">
            <span className="eyebrow">01 / Setup</span>
            <h1 className="section-title">Set the house</h1>
            <p className="section-copy">
              Keep people and bedrooms equal. Total rent stays fixed — Harmony
              redistributes who pays what.
            </p>

            <div className="form-stack">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Monthly rent</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={rent}
                    onChange={(e) => setRent(Number(e.target.value) || 0)}
                  />
                </label>
              </div>

              <div className="form-grid">
                <div className="panel">
                  <label className="field">
                    <span className="field-label">Bedrooms</span>
                  </label>
                  <div className="chip-row">
                    {rooms.map((room, i) => (
                      <span className="chip" key={`${room}-${i}`}>
                        {i + 1}. {room}
                        <button
                          type="button"
                          aria-label={`Remove ${room}`}
                          onClick={() => removeRoom(i)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="inline-add">
                    <input
                      className="input"
                      type="text"
                      placeholder="e.g. Corner suite"
                      value={roomDraft}
                      onChange={(e) => setRoomDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRoom()}
                    />
                    <button className="btn btn-ghost" type="button" onClick={addRoom}>
                      Add
                    </button>
                  </div>
                </div>

                <div className="panel">
                  <label className="field">
                    <span className="field-label">Roommates</span>
                  </label>
                  <div className="chip-row">
                    {people.map((person, i) => (
                      <span className="chip" key={`${person}-${i}`}>
                        {person}
                        <button
                          type="button"
                          aria-label={`Remove ${person}`}
                          onClick={() => removePerson(i)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="inline-add">
                    <input
                      className="input"
                      type="text"
                      placeholder="Name"
                      value={personDraft}
                      onChange={(e) => setPersonDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPerson()}
                    />
                    <button className="btn btn-ghost" type="button" onClick={addPerson}>
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {!readySetup && (
                <p className="note warn">
                  Need at least 2 rooms and 2 people, with equal counts
                  {rooms.length !== people.length
                    ? ` (now ${rooms.length} rooms / ${people.length} people)`
                    : ''}
                  .
                </p>
              )}

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
                  disabled={!readySetup}
                  onClick={() => {
                    const size = Math.min(rooms.length, people.length)
                    setRooms(rooms.slice(0, size))
                    setPeople(people.slice(0, size))
                    setPercents((prev) =>
                      prev
                        .slice(0, size)
                        .map((row) => renormalize(row.slice(0, size))),
                    )
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
              Each roommate allocates 100% across bedrooms — the share of rent
              that feels fair for each room. Pass the phone; answer honestly.
            </p>

            <div className="tabs" role="tablist" aria-label="Roommate">
              {people.map((person, i) => (
                <button
                  key={person}
                  type="button"
                  role="tab"
                  aria-selected={i === activePerson}
                  className={`tab ${i === activePerson ? 'active' : ''}`}
                  onClick={() => setActivePerson(i)}
                >
                  {person}
                </button>
              ))}
            </div>

            <div className="panel">
              <div className="valuations">
                {rooms.map((room, roomIdx) => (
                  <div className="room-row" key={room}>
                    <div className="room-row-top">
                      <strong>
                        {roomIdx + 1}. {room}
                      </strong>
                      <span>
                        {(percents[activePerson]?.[roomIdx] ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      aria-label={`Value for ${room}`}
                      value={percents[activePerson]?.[roomIdx] ?? 0}
                      onChange={(e) =>
                        setPercent(activePerson, roomIdx, Number(e.target.value))
                      }
                    />
                  </div>
                ))}
              </div>

              <div
                className={`sum-bar ${Math.abs(currentSum - 100) > 0.2 ? 'warn' : ''}`}
              >
                <span>{people[activePerson]}&apos;s total</span>
                <span>{currentSum.toFixed(1)}% / 100%</span>
              </div>
            </div>

            <p className="note" style={{ marginTop: 16 }}>
              Totals auto-normalize on discovery. Equal rooms ≈{' '}
              {(100 / rooms.length).toFixed(1)}% each.
            </p>

            <div className="actions" style={{ marginTop: 24 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setStep('setup')}
              >
                Back
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={normalizeActive}
              >
                Normalize to 100%
              </button>
              {activePerson < people.length - 1 ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    normalizeActive()
                    setActivePerson((p) => p + 1)
                  }}
                >
                  Next: {people[activePerson + 1]}
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
              Total {money(rent)}. Rooms assigned to maximize collective value,
              then priced so nobody prefers another bundle.
            </p>

            <div className="result-grid">
              {result.assignment.map((roomIdx, personIdx) => (
                <div className="result-card" key={people[personIdx]}>
                  <div className="result-num">{roomIdx + 1}</div>
                  <div className="result-meta">
                    <strong>{people[personIdx]}</strong>
                    <span>{rooms[roomIdx]}</span>
                  </div>
                  <div className="result-price">
                    {money(result.prices[roomIdx])}
                  </div>
                </div>
              ))}
            </div>

            <div className="insight">
              <h3>Group signal</h3>
              <p>
                Averaged perceived value:{' '}
                {rooms.map((r, i) => `${r} ${avg[i]?.toFixed(1)}%`).join(' · ')}.
                Harmony used individual valuations — not just the average — so
                preferences still shape assignment.
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
                Start over
              </button>
            </div>

            <p className="footer-note">
              Based on envy-free rent division (rental harmony / Spliddit-style
              maximin). Assumes each person maximizes value minus rent.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
