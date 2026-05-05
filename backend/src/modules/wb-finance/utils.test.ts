import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getRequiredWbWeeklyPeriods, getWeekPeriod } from './utils.js'

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

describe('WB week periods', () => {
  it('builds a Monday-Sunday week for a middle-of-week date', () => {
    const period = getWeekPeriod(new Date('2026-04-10T12:00:00.000Z'))

    assert.equal(toDateOnly(period.from), '2026-04-06')
    assert.equal(toDateOnly(period.to), '2026-04-12')
  })

  it('returns every WB week intersecting a user period', () => {
    const periods = getRequiredWbWeeklyPeriods(
      new Date('2026-04-10T00:00:00.000Z'),
      new Date('2026-04-18T00:00:00.000Z'),
    )

    assert.deepEqual(
      periods.map((period) => [toDateOnly(period.from), toDateOnly(period.to)]),
      [
        ['2026-04-06', '2026-04-12'],
        ['2026-04-13', '2026-04-19'],
      ],
    )
  })
})
