import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import type { BlogArticleRow, BlogCategoryRow } from '@/lib/blog'

/**
 * Compact card matching wireframe_blog_iplanit.html: short fixed-height
 * image strip, category tag + title + reading time only (no excerpt) - a
 * dense grid, not a magazine-style card. Glass surface (translucent white +
 * blur) is the visual treatment layered on top of that structure.
 */
export function ArticleCard({ article, category }: { article: BlogArticleRow; category: BlogCategoryRow | undefined }) {
  return (
    <Link
      href={`/blog/${category?.slug ?? 'general'}/${article.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08]"
    >
      <div className="flex h-[100px] items-center justify-center overflow-hidden bg-white/5">
        {article.featured_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.featured_image_url}
            alt={article.featured_image_alt || ''}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <ImageOff className="h-5 w-5 text-muted-foreground/40" />
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-center gap-2">
          {category && <span className="text-[11px] font-medium text-primary">{category.name}</span>}
          {article.status === 'draft' && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              Borrador
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          {article.title}
        </h3>
        <p className="text-xs text-muted-foreground">{article.reading_time_minutes ?? 5} min de lectura</p>
      </div>
    </Link>
  )
}
