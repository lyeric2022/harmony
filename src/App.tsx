import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  averagePercents,
  divideRent,
  percentsToValues,
  type DivisionResult,
} from './lib/rentDivision'
import {
  DEFAULT_FLOOR_PLAN,
  DEFAULT_RENT,
  DEFAULT_ROOMS,
  PEOPLE,
  equalPercents,
  loadStored,
  readFileAsDataUrl,
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
  const [rent, setRent] = useState(DEFAULT_RENT)
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS)
  const [floorPlan, setFloorPlan] = useState<string | null>(DEFAULT_FLOOR_PLAN)
  const [roomImages, setRoomImages] = useState<Record<string, string | null>>({})
  const [activePerson, setActivePerson] = useState(0)
  const [percents, setPercents] = useState<number[][]>(
    PEOPLE.map(() => equalPercents(4)),
  )
  const [result, setResult] = useState<DivisionResult | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const floorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = loadStored()
    if (stored) {
      if (stored.rent) setRent(stored.rent)
      if (stored.rooms?.length === 4) setRooms(stored.rooms)
      // Prefer uploaded override; otherwise keep baked numbered plan
      if (stored.floorPlanDataUrl) setFloorPlan(stored.floorPlanDataUrl)
      else setFloorPlan(DEFAULT_FLOOR_PLAN)
      if (stored.roomImages) setRoomImages(stored.roomImages)
      if (stored.percents?.length === 4) setPercents(stored.percents)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveStored({
      rent,
      rooms,
      floorPlanDataUrl: floorPlan,
      roomImages,
      percents,
    })
  }, [hydrated, rent, rooms, floorPlan, roomImages, percents])

  const currentSum = useMemo(
    () => (percents[activePerson] ?? []).reduce((a, b) => a + b, 0),
    [percents, activePerson],
  )

  const avg = averagePercents(percents.map((row) => renormalize(row)))
  const filledPhotos = rooms.filter((r) => roomImages[r.id]).length

  const stepMeta = [
    { id: 'house' as const, label: 'House' },
    { id: 'value' as const, label: 'Value' },
    { id: 'results' as const, label: 'Discover' },
  ]
  const stepIndex = stepMeta.findIndex((s) => s.id === step)

  async function onFloorPlan(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setFloorPlan(await readFileAsDataUrl(file))
  }

  async function onRoomImage(roomId: string, files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    setRoomImages((prev) => ({ ...prev, [roomId]: dataUrl }))
  }

  function updateRoom(idx: number, patch: Partial<Room>) {
    setRooms((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
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
    const matrix = percents.map((row) => renormalize(row))
    setPercents(matrix)
    setResult(divideRent(percentsToValues(matrix, rent), rent))
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
                <p className="panel-foot">
                  Numbered floor plan loaded · {filledPhotos}/4 optional room photos
                </p>
              </aside>
            </div>

            {(floorPlan || filledPhotos > 0) && (
              <div className="home-gallery">
                {floorPlan && (
                  <figure className="floor-figure">
                    <img src={floorPlan} alt="Floor plan" />
                    <figcaption>Floor plan</figcaption>
                  </figure>
                )}
                <div className="room-thumbs">
                  {rooms.map((room) => (
                    <div className="room-thumb" key={room.id}>
                      <span className="room-badge">{room.number}</span>
                      {roomImages[room.id] ? (
                        <img src={roomImages[room.id]!} alt={room.name} />
                      ) : (
                        <div className="thumb-empty">No photo</div>
                      )}
                      <span>{room.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {step === 'house' && (
          <section className="section">
            <span className="eyebrow">01 / House</span>
            <h1 className="section-title">Rooms & photos</h1>
            <p className="section-copy">
              Drop the floor plan and a photo for each numbered bedroom. Names
              are fixed — Eric, Jhona, Rian, Jake.
            </p>

            <div className="form-stack">
              <label className="field" style={{ maxWidth: 280 }}>
                <span className="field-label">Monthly rent</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={rent}
                  onChange={(e) => setRent(Number(e.target.value) || 0)}
                />
              </label>

              <div className="panel">
                <div className="panel-head-row">
                  <div>
                    <span className="field-label">Floor plan</span>
                    <p className="note" style={{ marginTop: 6 }}>
                      One image of the layout — bedrooms numbered 1–4.
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => floorInputRef.current?.click()}
                  >
                    {floorPlan ? 'Replace' : 'Upload'}
                  </button>
                  <input
                    ref={floorInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => onFloorPlan(e.target.files)}
                  />
                </div>
                {floorPlan ? (
                  <img className="floor-preview" src={floorPlan} alt="Floor plan" />
                ) : (
                  <button
                    type="button"
                    className="dropzone"
                    onClick={() => floorInputRef.current?.click()}
                  >
                    Drop floor plan image here
                  </button>
                )}
              </div>

              <div className="room-photo-grid">
                {rooms.map((room, idx) => (
                  <div className="room-photo-card" key={room.id}>
                    <div className="room-photo-media">
                      <span className="room-badge lg">{room.number}</span>
                      {roomImages[room.id] ? (
                        <img src={roomImages[room.id]!} alt={room.name} />
                      ) : (
                        <div className="thumb-empty tall">Add photo</div>
                      )}
                    </div>
                    <div className="room-photo-body">
                      <label className="field">
                        <span className="field-label">Bedroom {room.number}</span>
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
                          placeholder="Closet, window, ensuite…"
                          value={room.notes}
                          onChange={(e) => updateRoom(idx, { notes: e.target.value })}
                        />
                      </label>
                      <label className="btn btn-secondary file-btn">
                        {roomImages[room.id] ? 'Replace photo' : 'Upload photo'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => onRoomImage(room.id, e.target.files)}
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
              Pass the phone. Each person allocates 100% across the four
              bedrooms — what share of {money(rent)} feels fair for each room.
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
              {floorPlan && (
                <figure className="value-floor">
                  <img src={floorPlan} alt="Floor plan reference" />
                  <figcaption>Floor plan</figcaption>
                </figure>
              )}

              <div className="panel">
                <div className="valuations">
                  {rooms.map((room, roomIdx) => (
                    <div className="room-row with-photo" key={room.id}>
                      <div className="value-room-media">
                        <span className="room-badge">{room.number}</span>
                        {roomImages[room.id] ? (
                          <img src={roomImages[room.id]!} alt={room.name} />
                        ) : (
                          <div className="thumb-empty">#{room.number}</div>
                        )}
                      </div>
                      <div className="value-room-controls">
                        <div className="room-row-top">
                          <strong>{room.name}</strong>
                          <span>
                            {(percents[activePerson]?.[roomIdx] ?? 0).toFixed(1)}%
                          </span>
                        </div>
                        {room.notes && <p className="note">{room.notes}</p>}
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={0.5}
                          aria-label={`Value for ${room.name}`}
                          value={percents[activePerson]?.[roomIdx] ?? 0}
                          onChange={(e) =>
                            setPercent(
                              activePerson,
                              roomIdx,
                              Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className={`sum-bar ${Math.abs(currentSum - 100) > 0.2 ? 'warn' : ''}`}
                >
                  <span>{PEOPLE[activePerson].name}&apos;s total</span>
                  <span>{currentSum.toFixed(1)}% / 100%</span>
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
                onClick={normalizeActive}
              >
                Normalize to 100%
              </button>
              {activePerson < PEOPLE.length - 1 ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    normalizeActive()
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
              Total {money(rent)} for Eric, Jhona, Rian, and Jake. Nobody should
              want to swap rooms at these prices.
            </p>

            <div className="result-grid">
              {result.assignment.map((roomIdx, personIdx) => {
                const room = rooms[roomIdx]
                return (
                  <div className="result-card photo" key={PEOPLE[personIdx].id}>
                    <div className="result-photo">
                      <span className="room-badge">{room.number}</span>
                      {roomImages[room.id] ? (
                        <img src={roomImages[room.id]!} alt={room.name} />
                      ) : (
                        <div className="thumb-empty">#{room.number}</div>
                      )}
                    </div>
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
