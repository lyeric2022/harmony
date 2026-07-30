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

export const DEFAULT_RENT = 4000

/** Numbered floor plan baked into the site. */
export const DEFAULT_FLOOR_PLAN = `${import.meta.env.BASE_URL}rooms/floorplan-numbered.png`

export const STORAGE_KEY = 'harmony-house-v2'

export type StoredHouse = {
  rent: number
  rooms: Room[]
  floorPlanDataUrl: string | null
  roomImages: Record<string, string | null>
  percents: number[][]
}

export function equalPercents(n: number) {
  const base = Math.floor((100 / n) * 10) / 10
  const row = Array(n).fill(base)
  const drift = 100 - base * n
  row[n - 1] = Math.round((base + drift) * 10) / 10
  return row
}

export function renormalize(row: number[]): number[] {
  const sum = row.reduce((a, b) => a + b, 0)
  if (sum <= 0) return equalPercents(row.length)
  return row.map((x) => Math.round((x / sum) * 1000) / 10)
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
    // quota — ignore oversized images
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
