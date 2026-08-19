import type { Database } from '@/lib/supabase/types'

export type BlogArticleRow = Database['public']['Tables']['blog_articles']['Row']
export type BlogCategoryRow = Database['public']['Tables']['blog_categories']['Row']

export interface FaqEntry {
  question: string
  answer: string
}

export function parseFaq(faq: unknown): FaqEntry[] {
  if (!Array.isArray(faq)) return []
  return faq.filter(
    (entry): entry is FaqEntry =>
      entry && typeof entry === 'object' && typeof entry.question === 'string' && typeof entry.answer === 'string'
  )
}

const WORDS_PER_MINUTE = 200

export function calculateReadingTime(markdownContent: string): number {
  const wordCount = markdownContent.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE))
}

const GENERAL_CATEGORY_SLUG = 'general'

/**
 * Sección 8 del documento de contenido: override manual primero: si el
 * artículo trae `related_articles_override`, se usa tal cual, en ese orden.
 * Si no, se puntúa el resto de artículos publicados por coincidencia de
 * categoría (+1) y por cada `functional_tags` compartido (+1 cada uno) -
 * la regla explícita del documento es que al menos 1 de las sugerencias
 * venga por funcionalidad, no solo por categoría, así que si el ranking por
 * puntaje no produce ningún resultado cuyo ÚNICO motivo de match sea
 * funcionalidad (no categoría), se fuerza a incluir el mejor candidato por
 * funcionalidad aunque no sea el más alto puntaje. Fallback final: los más
 * recientes de la categoría "General" si no hay ningún cruce en absoluto.
 */
export function getRelatedArticles(
  article: BlogArticleRow,
  allPublished: BlogArticleRow[],
  categories: BlogCategoryRow[],
  limit = 4
): BlogArticleRow[] {
  const others = allPublished.filter((a) => a.id !== article.id)

  if (article.related_articles_override.length > 0) {
    const byId = new Map(others.map((a) => [a.id, a]))
    return article.related_articles_override
      .map((id) => byId.get(id))
      .filter((a): a is BlogArticleRow => !!a)
      .slice(0, limit)
  }

  const articleTags = new Set(article.functional_tags)
  const scored = others
    .map((candidate) => {
      const sharedTags = candidate.functional_tags.filter((tag) => articleTags.has(tag))
      const sameCategory = candidate.category_id === article.category_id
      return {
        candidate,
        score: (sameCategory ? 1 : 0) + sharedTags.length,
        matchesByFunctionOnly: sharedTags.length > 0 && !sameCategory,
      }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  const result: BlogArticleRow[] = []
  const functionOnlyMatch = scored.find((s) => s.matchesByFunctionOnly)
  if (functionOnlyMatch) result.push(functionOnlyMatch.candidate)

  for (const s of scored) {
    if (result.length >= limit) break
    if (!result.includes(s.candidate)) result.push(s.candidate)
  }

  if (result.length === 0) {
    const generalCategoryId = categories.find((c) => c.slug === GENERAL_CATEGORY_SLUG)?.id
    const fallbackPool = generalCategoryId ? others.filter((a) => a.category_id === generalCategoryId) : others
    return fallbackPool
      .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
      .slice(0, limit)
  }

  return result.slice(0, limit)
}

export function ogImageFor(article: Pick<BlogArticleRow, 'og_image_url' | 'featured_image_url'>): string | null {
  return article.og_image_url || article.featured_image_url
}
