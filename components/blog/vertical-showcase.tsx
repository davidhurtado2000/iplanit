import Link from 'next/link'
import { ArticleCard } from '@/components/blog/article-card'
import type { BlogArticleRow, BlogCategoryRow } from '@/lib/blog'
import { blogT, categoryName, type BlogLanguage } from '@/lib/blog-i18n'

const SLOTS = 3

// wireframe_blog_iplanit.html: one row per vertical (category), real
// articles filling in from the left, "próximo artículo" dashed placeholders
// for the rest - shows the blog's planned breadth across verticals even
// before every category has content yet, instead of only ever showing
// categories that already happen to have an article.
export function VerticalShowcase({
  category,
  articles,
  language,
}: {
  category: BlogCategoryRow
  articles: BlogArticleRow[]
  language: BlogLanguage
}) {
  const t = blogT(language)
  const shown = articles.slice(0, SLOTS)
  const placeholderCount = Math.max(0, SLOTS - shown.length)

  return (
    <section className="border-t border-white/10 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-medium text-foreground">{categoryName(category, language)}</h2>
        <Link href={`/blog/${category.slug}`} className="text-sm text-primary hover:underline">
          {t.viewAll}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {shown.map((article) => (
          <ArticleCard key={article.id} article={article} category={category} language={language} />
        ))}
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[170px] items-center justify-center rounded-xl border border-dashed border-white/15 p-3"
          >
            <span className="text-xs text-muted-foreground">{t.nextArticle}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
