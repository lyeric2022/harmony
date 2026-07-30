/**
 * Envy-free rent division (Spliddit-style maximin).
 * Each person values rooms totaling `rent`. We find a room assignment and
 * prices that sum to rent such that nobody prefers another's bundle, while
 * maximizing the worst-off person's surplus (value − price).
 */

export type ValuationMatrix = number[][] // people × rooms, each row sums to rent

export type DivisionResult = {
  assignment: number[] // person i → room index
  prices: number[]
  utilities: number[]
  minUtility: number
  envyFree: boolean
}

function assertSquare(values: ValuationMatrix) {
  const n = values.length
  if (n === 0) throw new Error('Need at least one person')
  for (const row of values) {
    if (row.length !== n) throw new Error('Need one room per person')
  }
}

/** Hungarian algorithm (max weight) for square matrices. Returns assignment[person] = room */
export function maxWeightMatching(weights: number[][]): number[] {
  const n = weights.length
  const u = Array(n + 1).fill(0)
  const v = Array(n + 1).fill(0)
  const p = Array(n + 1).fill(0)
  const way = Array(n + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = Array(n + 1).fill(Infinity)
    const used = Array(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = -weights[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }

  const assignment = Array(n).fill(-1)
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) assignment[p[j] - 1] = j - 1
  }
  return assignment
}

/** Feasibility of envy-free prices with min utility ≥ u for fixed assignment. */
function feasiblePrices(
  values: ValuationMatrix,
  assignment: number[],
  rent: number,
  minU: number,
): number[] | null {
  const n = values.length
  // Difference constraints via Bellman-Ford on n+1 nodes (0 = source).
  // Variables: p[0..n-1]. Also enforce sum via expressing relative to p[0],
  // then scaling — instead: search prices with gradient projection for small n.
  // Exact approach: LP via binary search already fixed u; solve with
  // successive over-relaxation on envy inequalities + sum constraint.

  const prices = Array(n).fill(rent / n)
  const personOfRoom = Array(n).fill(-1)
  for (let i = 0; i < n; i++) personOfRoom[assignment[i]] = i

  for (let iter = 0; iter < 8000; iter++) {
    let maxViol = 0

    // Maximin: p[a] <= v_i(a) - minU
    for (let i = 0; i < n; i++) {
      const a = assignment[i]
      const cap = values[i][a] - minU
      if (prices[a] > cap + 1e-9) {
        maxViol = Math.max(maxViol, prices[a] - cap)
        prices[a] = cap
      }
    }

    // Envy-free: p[j] - p[a] >= v_i(j) - v_i(a)
    for (let i = 0; i < n; i++) {
      const a = assignment[i]
      for (let j = 0; j < n; j++) {
        if (j === a) continue
        const need = values[i][j] - values[i][a]
        const diff = prices[j] - prices[a]
        if (diff < need - 1e-9) {
          const gap = need - diff
          maxViol = Math.max(maxViol, gap)
          prices[j] += gap / 2
          prices[a] -= gap / 2
        }
      }
    }

    // Renormalize to sum = rent
    const sum = prices.reduce((s, x) => s + x, 0)
    const drift = sum - rent
    if (Math.abs(drift) > 1e-9) {
      for (let j = 0; j < n; j++) prices[j] -= drift / n
      maxViol = Math.max(maxViol, Math.abs(drift))
    }

    if (maxViol < 1e-7) {
      // Final envy + utility check
      for (let i = 0; i < n; i++) {
        const a = assignment[i]
        const util = values[i][a] - prices[a]
        if (util < minU - 1e-4) return null
        for (let j = 0; j < n; j++) {
          if (values[i][j] - prices[j] > util + 1e-4) return null
        }
      }
      return prices
    }
  }
  return null
}

function utilitiesFor(
  values: ValuationMatrix,
  assignment: number[],
  prices: number[],
): number[] {
  return assignment.map((room, i) => values[i][room] - prices[room])
}

function isEnvyFree(
  values: ValuationMatrix,
  assignment: number[],
  prices: number[],
): boolean {
  const utils = utilitiesFor(values, assignment, prices)
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      if (values[i][j] - prices[j] > utils[i] + 1e-4) return false
    }
  }
  return true
}

/** Exact-ish envy-free maximin via binary search on min utility. */
export function divideRent(values: ValuationMatrix, rent: number): DivisionResult {
  assertSquare(values)
  const n = values.length
  const assignment = maxWeightMatching(values)

  let lo = -rent
  let hi = rent
  for (let i = 0; i < n; i++) {
    hi = Math.min(hi, values[i][assignment[i]])
  }

  let bestPrices: number[] | null = null
  for (let k = 0; k < 48; k++) {
    const mid = (lo + hi) / 2
    const prices = feasiblePrices(values, assignment, rent, mid)
    if (prices) {
      bestPrices = prices
      lo = mid
    } else {
      hi = mid
    }
  }

  // Fallback: column averages (always sum to rent)
  if (!bestPrices) {
    bestPrices = Array(n).fill(0)
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let i = 0; i < n; i++) s += values[i][j]
      bestPrices[j] = s / n
    }
  }

  const utilities = utilitiesFor(values, assignment, bestPrices)
  return {
    assignment,
    prices: bestPrices.map((p) => Math.round(p * 100) / 100),
    utilities: utilities.map((u) => Math.round(u * 100) / 100),
    minUtility: Math.min(...utilities),
    envyFree: isEnvyFree(values, assignment, bestPrices),
  }
}

/** Convert percent rows (sum ~100) into dollar valuations. */
export function percentsToValues(percents: number[][], rent: number): ValuationMatrix {
  return percents.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0) || 1
    return row.map((p) => (p / sum) * rent)
  })
}

export function averagePercents(percents: number[][]): number[] {
  const n = percents[0]?.length ?? 0
  const out = Array(n).fill(0)
  if (percents.length === 0) return out
  for (const row of percents) {
    for (let j = 0; j < n; j++) out[j] += row[j]
  }
  return out.map((x) => x / percents.length)
}
