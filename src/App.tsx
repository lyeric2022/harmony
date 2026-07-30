import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
          d="M4 16V9.5L12 4l8 5.5V16"
          stroke="#E8F2EF"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="13" r="2.4" fill="#2BB59A" />
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
  const readySetup = rooms.length >= 2 && people.length >= 2 && rooms.length === people.length && rent > 0

  const currentSum = useMemo(
    () => (percents[activePerson] ?? []).reduce((a, b) => a + b, 0),
    [percents, activePerson],
  )

  function syncMatrix(nextRooms: string[], nextPeople: string[]) {
    const size = Math.min(nextRooms.length, nextPeople.length)
    setPercents(
      Array.from({ length: nextPeople.length }, (_, i) => {
        const prev = percents[i]
        if (prev && prev.length === size) return prev
        return equalPercents(Math.max(size, 1))
      }),
    )
    setActivePerson(0)
  }

  function addRoom() {
    const name = roomDraft.trim() || `Room ${rooms.length + 1}`
    const next = [...rooms, name]
    setRooms(next)
    setRoomDraft('')
    if (people.length === rooms.length) {
      // keep counts matched only when user also adds people; pad percents later
    }
    setPercents((prev) =>
      prev.map((row) => {
        const nextRow = [...row, 0]
        return renormalize(nextRow)
      }).concat(people.length > prev.length ? [] : []),
    )
  }

  function addPerson() {
    const name = personDraft.trim() || `Person ${people.length + 1}`
    const next = [...people, name]
    setPeople(next)
    setPersonDraft('')
    setPercents((prev) => [...prev, equalPercents(rooms.length)])
  }

  function removeRoom(idx: number) {
    if (rooms.length <= 2) return
    const next = rooms.filter((_, i) => i !== idx)
    setRooms(next)
    setPercents((prev) => prev.map((row) => renormalize(row.filter((_, i) => i !== idx))))
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
    const matrix = percents.slice(0, size).map((row) => renormalize(row.slice(0, size)))
    setPeople(trimmedPeople)
    setRooms(trimmedRooms)
    setPercents(matrix)
    const values = percentsToValues(matrix, rent)
    const division = divideRent(values, rent)
    setResult(division)
    setStep('results')
  }

  const avg = averagePercents(
    percents.slice(0, n).map((row) => renormalize(row.slice(0, n))),
  )

  const steps: { id: Step; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'setup', label: 'Setup' },
    { id: 'value', label: 'Value' },
    { id: 'results', label: 'Discover' },
  ]

  const stepIndex = steps.findIndex((s) => s.id === step)

  return (
    <div className="app">
      <header className="topnav">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setStep('home') }}>
          <BrandMark />
          <span className="brand-name">Harmony</span>
        </a>
        {step !== 'home' && (
          <div className="step-pills" aria-label="Progress">
            {steps.slice(1).map((s, i) => {
              const idx = i + 1
              const cls =
                s.id === step ? 'active' : idx < stepIndex ? 'done' : ''
              return (
                <span key={s.id} className={`step-pill ${cls}`}>
                  {s.label}
                </span>
              )
            })}
          </div>
        )}
      </header>

      <AnimatePresence mode="wait">
        {step === 'home' && (
          <motion.section
            key="home"
            className="hero"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="hero-bg"
              initial={{ scale: 1.04, opacity: 0.85 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="hero-content">
              <motion.p
                className="hero-brand"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.55 }}
              >
                Harmony
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.55 }}
              >
                Price rooms by perceived value — then discover a fair split.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                Everyone rates each bedroom. An envy-free algorithm turns those
                preferences into real rent prices — beyond square footage and
                gut math.
              </motion.p>
              <motion.div
                className="cta-row"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.45 }}
              >
                <button className="btn btn-primary" onClick={() => setStep('setup')}>
                  Start price discovery
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    syncMatrix(DEFAULT_ROOMS, DEFAULT_PEOPLE)
                    setRooms(DEFAULT_ROOMS)
                    setPeople(DEFAULT_PEOPLE)
                    setRent(3600)
                    setPercents(DEFAULT_PEOPLE.map(() => equalPercents(3)))
                    setStep('setup')
                  }}
                >
                  Try a demo house
                </button>
              </motion.div>
            </div>
          </motion.section>
        )}

        {step === 'setup' && (
          <motion.section
            key="setup"
            className="panel"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <div className="panel-head">
              <h2>Set the house.</h2>
              <p>
                Same number of people and bedrooms. Total rent stays fixed —
                Harmony redistributes who pays what.
              </p>
            </div>

            <div className="field-grid two">
              <label className="field">
                <span>Monthly rent</span>
                <input
                  type="number"
                  min={1}
                  value={rent}
                  onChange={(e) => setRent(Number(e.target.value) || 0)}
                />
              </label>
            </div>

            <div className="field-grid two" style={{ marginTop: '1.5rem' }}>
              <div>
                <label className="field">
                  <span>Bedrooms</span>
                </label>
                <div className="chip-row">
                  {rooms.map((room, i) => (
                    <span className="chip" key={`${room}-${i}`}>
                      {i + 1}. {room}
                      <button type="button" aria-label={`Remove ${room}`} onClick={() => removeRoom(i)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="inline-add">
                  <input
                    type="text"
                    placeholder="e.g. Corner suite"
                    value={roomDraft}
                    onChange={(e) => setRoomDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addRoom()}
                  />
                  <button className="btn btn-soft" type="button" onClick={addRoom}>
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="field">
                  <span>Roommates</span>
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
                    type="text"
                    placeholder="Name"
                    value={personDraft}
                    onChange={(e) => setPersonDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addPerson()}
                  />
                  <button className="btn btn-soft" type="button" onClick={addPerson}>
                    Add
                  </button>
                </div>
              </div>
            </div>

            {!readySetup && (
              <p className="auto-note">
                Need at least 2 rooms and 2 people, with equal counts
                {rooms.length !== people.length
                  ? ` (now ${rooms.length} rooms / ${people.length} people)`
                  : ''}
                .
              </p>
            )}

            <div className="actions">
              <button className="btn btn-soft" onClick={() => setStep('home')}>
                Back
              </button>
              <button
                className="btn btn-ink"
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
          </motion.section>
        )}

        {step === 'value' && (
          <motion.section
            key="value"
            className="panel"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <div className="panel-head">
              <h2>Perceived value.</h2>
              <p>
                Each roommate allocates 100% across bedrooms — what share of
                rent feels fair for each room, to them. Pass the phone around;
                keep answers honest.
              </p>
            </div>

            <div className="person-tabs">
              {people.map((person, i) => (
                <button
                  key={person}
                  type="button"
                  className={`person-tab ${i === activePerson ? 'active' : ''}`}
                  onClick={() => setActivePerson(i)}
                >
                  {person}
                </button>
              ))}
            </div>

            <div className="valuations">
              {rooms.map((room, roomIdx) => (
                <div className="room-slider" key={room}>
                  <div className="room-slider-top">
                    <strong>
                      {roomIdx + 1}. {room}
                    </strong>
                    <em>{(percents[activePerson]?.[roomIdx] ?? 0).toFixed(1)}%</em>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={percents[activePerson]?.[roomIdx] ?? 0}
                    onChange={(e) =>
                      setPercent(activePerson, roomIdx, Number(e.target.value))
                    }
                  />
                </div>
              ))}
            </div>

            <div className={`sum-bar ${Math.abs(currentSum - 100) > 0.2 ? 'warn' : ''}`}>
              <span>{people[activePerson]}&apos;s total</span>
              <span>{currentSum.toFixed(1)}% / 100%</span>
            </div>
            <p className="auto-note">
              Totals are auto-normalized when you run discovery. Tip: equal rooms
              ≈ {(100 / rooms.length).toFixed(1)}% each.
            </p>

            <div className="actions">
              <button className="btn btn-soft" onClick={() => setStep('setup')}>
                Back
              </button>
              <button className="btn btn-soft" onClick={normalizeActive}>
                Normalize to 100%
              </button>
              {activePerson < people.length - 1 ? (
                <button
                  className="btn btn-ink"
                  onClick={() => {
                    normalizeActive()
                    setActivePerson((p) => p + 1)
                  }}
                >
                  Next: {people[activePerson + 1]}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={runDiscovery}>
                  Run price discovery
                </button>
              )}
            </div>
          </motion.section>
        )}

        {step === 'results' && result && (
          <motion.section
            key="results"
            className="panel"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <div className="results-hero">
              <span className={`badge ${result.envyFree ? '' : 'bad'}`}>
                {result.envyFree ? 'Envy-free split' : 'Approximate split'}
              </span>
              <div className="panel-head" style={{ marginBottom: 0 }}>
                <h2>Your fair prices.</h2>
                <p>
                  Total {money(rent)} · assignment maximizes collective value,
                  then prices are tuned so nobody wants to swap.
                </p>
              </div>
            </div>

            <div className="result-list">
              {result.assignment.map((roomIdx, personIdx) => (
                <motion.div
                  className="result-row"
                  key={people[personIdx]}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * personIdx, duration: 0.4 }}
                >
                  <div className="result-index">{roomIdx + 1}</div>
                  <div className="result-meta">
                    <strong>{people[personIdx]}</strong>
                    <span>{rooms[roomIdx]}</span>
                  </div>
                  <div className="result-price">{money(result.prices[roomIdx])}</div>
                </motion.div>
              ))}
            </div>

            <div className="insight">
              <h3>Group signal</h3>
              <p>
                Averaged perceived value:{' '}
                {rooms
                  .map((r, i) => `${r} ${avg[i]?.toFixed(1)}%`)
                  .join(' · ')}
                . Harmony used individual valuations (not just the average) so
                preferences still shape who gets which room.
              </p>
            </div>

            <div className="actions">
              <button className="btn btn-soft" onClick={() => setStep('value')}>
                Adjust values
              </button>
              <button className="btn btn-ink" onClick={() => setStep('home')}>
                Start over
              </button>
            </div>

            <p className="footnote">
              Based on envy-free rent division (rental harmony / Spliddit-style
              maximin). Assumes each person wants to maximize value minus rent.
              Built for housemates who want price discovery — not landlord
              appraisal.
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

function renormalize(row: number[]): number[] {
  const sum = row.reduce((a, b) => a + b, 0)
  if (sum <= 0) return equalPercents(row.length)
  return row.map((x) => Math.round((x / sum) * 1000) / 10)
}
