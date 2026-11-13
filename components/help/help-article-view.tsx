import Link from 'next/link'
import { AlertTriangle, ArrowRight, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { HelpArticle, HelpBlock } from '@/lib/help/articles'

/** Renders **bold** - the only formatting help articles use. */
export function HelpText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

export function HelpArticleBadges({ article }: { article: HelpArticle }) {
  if (!article.plan && !article.ownerOnly) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {article.plan && (
        <Badge variant="secondary" className="text-[10px] font-medium">
          {article.plan === 'pro' ? 'Pro y Premium' : 'Premium'}
        </Badge>
      )}
      {article.ownerOnly && (
        <Badge variant="outline" className="text-[10px] font-medium">
          Solo el dueño
        </Badge>
      )}
    </span>
  )
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'h':
      return <h2 className="pt-2 text-base font-semibold text-foreground">{block.text}</h2>
    case 'p':
      return (
        <p className="leading-relaxed text-muted-foreground">
          <HelpText text={block.text} />
        </p>
      )
    case 'steps':
      return (
        <ol className="space-y-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5 leading-relaxed text-muted-foreground">
                <HelpText text={item} />
              </span>
            </li>
          ))}
        </ol>
      )
    case 'list':
      return (
        <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-muted-foreground marker:text-primary/60">
          {block.items.map((item, i) => (
            <li key={i}>
              <HelpText text={item} />
            </li>
          ))}
        </ul>
      )
    case 'tip':
      return (
        <p className="flex gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <HelpText text={block.text} />
          </span>
        </p>
      )
    case 'warning':
      return (
        <p className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <HelpText text={block.text} />
          </span>
        </p>
      )
  }
}

export function HelpArticleView({ article, showLink = true }: { article: HelpArticle; showLink?: boolean }) {
  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <HelpArticleBadges article={article} />
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{article.title}</h1>
        <p className="text-muted-foreground">{article.summary}</p>
      </header>
      {showLink && article.link && (
        <Button asChild className="gap-2">
          <Link href={article.link.href}>
            {article.link.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
      <div className="space-y-4">
        {article.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </article>
  )
}
