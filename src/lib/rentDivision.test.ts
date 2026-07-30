import { divideRent, percentsToValues } from './rentDivision'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const rent = 3000
const percents = [
  [50, 30, 20],
  [40, 40, 20],
  [25, 35, 40],
]
const values = percentsToValues(percents, rent)
const result = divideRent(values, rent)

assert(result.assignment.length === 3, 'assignment length')
assert(
  Math.abs(result.prices.reduce((a, b) => a + b, 0) - rent) < 1,
  `prices sum ${result.prices}`,
)
assert(result.envyFree, 'should be envy-free')

console.log('ok', result)
