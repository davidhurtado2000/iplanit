import { ArticleCard } from '@/components/blog/article-card'
import type { BlogArticleRow, BlogCategoryRow } from '@/lib/blog'
import { blogT, type BlogLanguage } from '@/lib/blog-i18n'

export function RelatedArticles({
  articles,
  categories,
  language,
}: {
  articles: BlogArticleRow[]
  categories: BlogCategoryRow[]
  language: BlogLanguage
}) {
  if (articles.length === 0) return null
  const t = blogT(language)

  return (
    <section className="mt-16 border-t border-white/10 pt-10">
      <h2 className="text-xl font-bold text-foreground">{t.continueReading}</h2>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            category={categories.find((c) => c.id === article.category_id)}
            language={language}
          />
        ))}
      </div>
    </section>
  )
}
