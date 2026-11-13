import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { HelpArticleView } from '@/components/help/help-article-view'
import { HELP_ARTICLES } from '@/lib/help/articles'

// Help for worker accounts (/mi-agenda) - they have no dashboard, so their
// articles live here, all on one page. Static content, no login needed.
export const metadata = { title: 'Ayuda · Mi agenda' }

export default function WorkerHelpPage() {
  const articles = HELP_ARTICLES.filter((a) => a.audience === 'worker')
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-6">
        <Link href="/mi-agenda" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver a mi agenda
        </Link>
        {articles.map((a) => (
          <HelpArticleView key={a.slug} article={a} showLink={false} />
        ))}
      </main>
    </div>
  )
}
