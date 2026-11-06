import { describe, expect, it } from 'vitest'
import { computeOverage } from './usage'

const pro = { includedDocs: 500, overageBlockSize: 500, overageBlockPriceUsd: 10 }
const premium = { includedDocs: 1000, overageBlockSize: 500, overageBlockPriceUsd: 10 }

describe('monthly limit', () => {
  it('charges nothing within the limit', () => {
    expect(computeOverage(450, pro)).toMatchObject({ overageBlocks: 0, overageUsd: 0, percent: 90, shouldWarn: true })
  })

  it('charges $10 per started block of 500 over the limit', () => {
    expect(computeOverage(700, pro)).toMatchObject({ overageDocs: 200, overageBlocks: 1, overageUsd: 10 })
    expect(computeOverage(2000, pro)).toMatchObject({ overageBlocks: 3, overageUsd: 30 })
    expect(computeOverage(5000, premium)).toMatchObject({ overageBlocks: 8, overageUsd: 80 })
  })

  it('does not warn below 80%', () => {
    expect(computeOverage(300, pro).shouldWarn).toBe(false)
  })
})
