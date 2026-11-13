import { describe, expect, it } from 'vitest'
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticle, searchHelp } from './articles'

describe('help articles', () => {
  it('have unique slugs, known categories and valid related links', () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const categories = new Set(HELP_CATEGORIES.map((c) => c.key))
    for (const a of HELP_ARTICLES) {
      expect(categories.has(a.category)).toBe(true)
      for (const r of a.related ?? []) expect(helpArticle(r), `${a.slug} -> ${r}`).toBeDefined()
      expect(a.blocks.length).toBeGreaterThan(0)
    }
  })

  it('never leaves an unclosed **bold** marker', () => {
    for (const a of HELP_ARTICLES) {
      for (const b of a.blocks) {
        const texts = 'text' in b ? [b.text] : b.items
        for (const t of texts) expect((t.match(/\*\*/g) ?? []).length % 2, `${a.slug}: ${t}`).toBe(0)
      }
    }
  })

  it('searches ignoring accents and case', () => {
    expect(searchHelp('PROPINA').map((a) => a.slug)).toContain('comisiones-propinas')
    expect(searchHelp('comision').map((a) => a.slug)[0]).toBe('comisiones-propinas')
    expect(searchHelp('boleta').map((a) => a.slug)).toContain('emitir-comprobante')
    expect(searchHelp('xyzzy')).toHaveLength(0)
  })
})
