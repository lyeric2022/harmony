export type Room = {
  id: string
  number: number
  name: string
  notes: string
}

export type Person = {
  id: string
  name: string
}

export const PEOPLE: Person[] = [
  { id: 'eric', name: 'Eric' },
  { id: 'jhona', name: 'Jhona' },
  { id: 'rian', name: 'Rian' },
  { id: 'jake', name: 'Jake' },
]

export const DEFAULT_ROOMS: Room[] = [
  {
    id: 'r1',
    number: 1,
    name: 'Bedroom 1',
    notes: 'Main level — only bedroom downstairs, by laundry & kitchen',
  },
  {
    id: 'r2',
    number: 2,
    name: 'Bedroom 2',
    notes: 'Upper level — largest room (L-shaped)',
  },
  {
    id: 'r3',
    number: 3,
    name: 'Bedroom 3',
    notes: 'Upper level — middle room, near bath',
  },
  {
    id: 'r4',
    number: 4,
    name: 'Bedroom 4',
    notes: 'Upper level — overlooking living void',
  },
]

/** Locked total rent for the house. */
export const RENT = 7560

/** Slider band — each bedroom stays between these shares. */
export const PCT_MIN = 10
export const PCT_MAX = 40

/** Numbered floor plan baked into the site. */
export const FLOOR_PLAN = `${import.meta.env.BASE_URL}rooms/floorplan-numbered.png`

export const STORAGE_KEY = 'harmony-house-v6'

export type StoredHouse = {
  rooms: Room[]
  percents: number[][]
}

export function clampPct(x: number) {
  return Math.min(PCT_MAX, Math.max(PCT_MIN, x))
}

export function equalPercents(n: number) {
  const base = Math.floor((100 / n) * 10) / 10
  const row = Array(n).fill(base)
  const drift = 100 - base * n
  row[n - 1] = Math.round((base + drift) * 10) / 10
  return row.map(clampPct)
}

export function renormalize(row: number[]): number[] {
  const sum = row.reduce((a, b) => a + b, 0)
  if (sum <= 0) return equalPercents(row.length)
  // Project into [PCT_MIN, PCT_MAX] while summing to 100 via iterative clip.
  let next = row.map((x) => (x / sum) * 100)
  for (let k = 0; k < 8; k++) {
    const fixed = next.map((x) => x <= PCT_MIN || x >= PCT_MAX)
    const freeIdx = next.map((_, i) => i).filter((i) => !fixed[i])
    const fixedSum = next.reduce(
      (s, x, i) => s + (fixed[i] ? clampPct(x) : 0),
      0,
    )
    next = next.map((x, i) => (fixed[i] ? clampPct(x) : x))
    const freeSum = next.reduce((s, x, i) => s + (fixed[i] ? 0 : x), 0)
    const need = 100 - fixedSum
    if (freeIdx.length === 0 || freeSum <= 1e-9) return equalPercents(row.length)
    for (const i of freeIdx) next[i] = (next[i] / freeSum) * need
    if (next.every((x) => x >= PCT_MIN - 1e-6 && x <= PCT_MAX + 1e-6)) break
  }
  return polishToHundred(
    next.map(clampPct),
    next.map((_, i) => i),
  )
}

/** Allowed [min, max] for moving `index`, given locks and 10–40 band. */
export function sliderBounds(
  row: number[],
  locked: boolean[],
  index: number,
): { min: number; max: number } {
  const lockedOthers = locked.reduce(
    (s, isLocked, i) => (i !== index && isLocked ? s + row[i] : s),
    0,
  )
  const freeCount = locked.reduce(
    (n, isLocked, i) => (i !== index && !isLocked ? n + 1 : n),
    0,
  )
  // Leave room for free others at their min/max.
  const max = Math.min(PCT_MAX, 100 - lockedOthers - PCT_MIN * freeCount)
  const min = Math.max(PCT_MIN, 100 - lockedOthers - PCT_MAX * freeCount)
  return { min: Math.min(min, max), max: Math.max(min, max) }
}

/** Round to 1 decimal and force exact 100% sum by adjusting last free index. */
function polishToHundred(row: number[], freeIdx: number[]): number[] {
  const next = row.map((x) => Math.round(x * 10) / 10)
  if (freeIdx.length === 0) return next
  const sum = next.reduce((a, b) => a + b, 0)
  const drift = Math.round((100 - sum) * 10) / 10
  const last = freeIdx[freeIdx.length - 1]
  next[last] = clampPct(Math.round((next[last] + drift) * 10) / 10)
  return next
}

/**
 * Move one room's share; redistribute the leftover across unlocked rooms
 * (proportionally). Locked rooms stay put. All values stay in 10–40%.
 */
export function redistributePercents(
  row: number[],
  locked: boolean[],
  index: number,
  newValue: number,
): number[] {
  const n = row.length
  const next = [...row]
  const { min, max } = sliderBounds(row, locked, index)
  const clamped = Math.max(min, Math.min(newValue, max))
  next[index] = clamped

  const lockedOthers = locked.reduce(
    (s, isLocked, i) => (i !== index && isLocked ? s + row[i] : s),
    0,
  )
  const freeIdx = Array.from({ length: n }, (_, i) => i).filter(
    (i) => i !== index && !locked[i],
  )
  const remaining = Math.max(0, 100 - lockedOthers - clamped)

  if (freeIdx.length === 0) {
    next[index] = clampPct(Math.round((100 - lockedOthers) * 10) / 10)
    return polishToHundred(next, [index])
  }

  // Iteratively assign remaining within [PCT_MIN, PCT_MAX].
  let pool = [...freeIdx]
  let budget = remaining
  const assigned = new Map<number, number>()

  while (pool.length > 0) {
    const weights = pool.map((i) => Math.max(row[i], 0.1))
    const wSum = weights.reduce((a, b) => a + b, 0)
    let clipped = false
    const trial: { i: number; v: number }[] = []
    for (let k = 0; k < pool.length; k++) {
      const v = (budget * weights[k]) / wSum
      trial.push({ i: pool[k], v })
    }
    const still: number[] = []
    for (const { i, v } of trial) {
      if (v < PCT_MIN - 1e-9) {
        assigned.set(i, PCT_MIN)
        budget -= PCT_MIN
        clipped = true
      } else if (v > PCT_MAX + 1e-9) {
        assigned.set(i, PCT_MAX)
        budget -= PCT_MAX
        clipped = true
      } else {
        still.push(i)
      }
    }
    if (!clipped) {
      for (const { i, v } of trial) assigned.set(i, v)
      break
    }
    pool = still
    if (pool.length === 0) break
  }

  for (const i of freeIdx) next[i] = assigned.get(i) ?? PCT_MIN

  return polishToHundred(next, [...freeIdx, index])
}

export function loadStored(): Partial<StoredHouse> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<StoredHouse>
  } catch {
    return null
  }
}

export function saveStored(data: StoredHouse) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}
