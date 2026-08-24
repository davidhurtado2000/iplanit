import Link from 'next/link'
import type { BlogCategoryRow } from '@/lib/blog'
import { blogT, categoryName, type BlogLanguage } from '@/lib/blog-i18n'
import { BlogLanguageSwitcher } from '@/components/blog/language-switcher'

// Shortened labels for the header nav only (wireframe_blog_iplanit.html
// shows "Spas"/"Clínicas"/"Academias", not the full DB names) - the real,
// full category names are still used everywhere else (cards, category
// pages, the dropdown-less inline list here just needs to fit one line).
const SHORT_LABELS: Record<string, string> = {
  'spas-centros-de-belleza': 'Spas',
  'clinicas-salud': 'Clínicas',
  'academias-educacion': 'Academias',
  'gimnasios-fitness': 'Gimnasios',
  'otros-negocios-de-servicios': 'Otros',
}

const SHORT_LABELS_EN: Record<string, string> = {
  'spas-centros-de-belleza': 'Spas',
  'clinicas-salud': 'Clinics',
  'academias-educacion': 'Academies',
  'gimnasios-fitness': 'Gyms',
  'otros-negocios-de-servicios': 'Other',
}

export function BlogHeader({
  categories,
  language,
  translationLinks,
}: {
  categories: BlogCategoryRow[]
  language: BlogLanguage
  translationLinks: Record<BlogLanguage, string | null>
}) {
  const t = blogT(language)
  const shortLabels = language === 'en' ? SHORT_LABELS_EN : SHORT_LABELS

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <img src="/favicon-96x96-white.png" alt="" className="h-8 w-8 shrink-0" />
          <img src="/logotipo_mododark.png" alt="iPlanit" className="h-6 w-auto" />
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {categories.map((category) => (
            <Link key={category.id} href={`/blog/${category.slug}`} className="whitespace-nowrap transition-colors hover:text-foreground">
              {shortLabels[category.slug] ?? categoryName(category, language)}
            </Link>
          ))}
        </nav>
        <BlogLanguageSwitcher current={language} links={translationLinks} disabledTooltip={t.notYetTranslated} />
      </div>
    </header>
  )
}
