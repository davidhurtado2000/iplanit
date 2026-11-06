// Monthly limit and overage, same math as get_invoicing_usage()
// (scripts/111). The limits themselves live in invoicing_plan_config.
export type PlanInvoicingConfig = {
  includedDocs: number
  overageBlockSize: number
  overageBlockPriceUsd: number
}

// Share of the limit at which the owner gets a heads-up.
export const USAGE_WARNING_PERCENT = 80

export function computeOverage(used: number, config: PlanInvoicingConfig) {
  const overageDocs = Math.max(used - config.includedDocs, 0)
  const overageBlocks = Math.ceil(overageDocs / config.overageBlockSize)
  const percent = config.includedDocs > 0 ? Math.round((used * 100) / config.includedDocs) : null
  return {
    overageDocs,
    overageBlocks,
    overageUsd: overageBlocks * config.overageBlockPriceUsd,
    percent,
    shouldWarn: percent !== null && percent >= USAGE_WARNING_PERCENT,
  }
}
