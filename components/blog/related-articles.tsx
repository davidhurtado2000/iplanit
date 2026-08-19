import { ArticleCard } from '@/components/blog/article-card'
import type { BlogArticleRow, BlogCategoryRow } from '@/lib/blog'

export function RelatedArticles({
  articles,
  categories,
}: {
  articles: BlogArticleRow[]
  categories: BlogCategoryRow[]
}) {
  if (articles.length === 0) return null

  return (
    <section className="mt-16 border-t border-white/10 pt-10">
      <h2 className="text-xl font-bold text-foreground">Sigue leyendo</h2>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            category={categories.find((c) => c.id === article.category_id)}
          />
        ))}
      </div>
    </section>
  )
}
