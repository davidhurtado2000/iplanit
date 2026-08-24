import { cookies } from 'next/headers'

export type BlogLanguage = 'es' | 'en'

// Separate from the app-wide `app-language` cookie/localStorage
// (context/language-context.tsx) on purpose - that one is client-only and
// assumes both languages are already loaded in the page's JS bundle, which
// doesn't hold for blog articles (each is one real row of DB content, not a
// static translated string tree). The blog resolves its language
// server-side, per request, from its own cookie.
export const BLOG_LANGUAGE_COOKIE = 'blog-language'

export async function resolveBlogLanguage(): Promise<BlogLanguage> {
  const cookieStore = await cookies()
  const saved = cookieStore.get(BLOG_LANGUAGE_COOKIE)?.value
  return saved === 'en' ? 'en' : 'es'
}

const dict = {
  es: {
    blogLabel: 'Blog',
    homeLabel: 'Inicio',
    metaTitle: 'Blog - iPlanit',
    metaDescription: 'Guías y consejos para negocios de servicios sobre reservas, agenda y gestión de clientes.',
    noArticlesPublished: 'Todavía no hay artículos publicados.',
    latestKicker: 'últimos artículos',
    allArticlesTitle: 'Todos los artículos',
    draftBadge: 'Borrador',
    draftOnlyAdmins: 'Borrador — solo visible para admins',
    faqTitle: 'Preguntas frecuentes',
    noCategoryArticles: 'Todavía no hay artículos en esta categoría.',
    categoryDescriptionFallback: (name: string) => `Artículos sobre ${name.toLowerCase()} en el blog de iPlanit.`,
    viewAll: 'ver todos →',
    nextArticle: 'próximo artículo',
    continueReading: 'Sigue leyendo',
    minRead: (n: number) => `${n} min de lectura`,
    notYetTranslated: 'Este artículo todavía no está disponible en inglés',
  },
  en: {
    blogLabel: 'Blog',
    homeLabel: 'Home',
    metaTitle: 'Blog - iPlanit',
    metaDescription: 'Guides and tips for service businesses on bookings, scheduling, and client management.',
    noArticlesPublished: 'No published articles yet.',
    latestKicker: 'latest articles',
    allArticlesTitle: 'All articles',
    draftBadge: 'Draft',
    draftOnlyAdmins: 'Draft — only visible to admins',
    faqTitle: 'Frequently asked questions',
    noCategoryArticles: 'No articles in this category yet.',
    categoryDescriptionFallback: (name: string) => `Articles about ${name.toLowerCase()} on the iPlanit blog.`,
    viewAll: 'see all →',
    nextArticle: 'next article',
    continueReading: 'Keep reading',
    minRead: (n: number) => `${n} min read`,
    notYetTranslated: 'This article is not available in Spanish yet',
  },
} as const

export function blogT(language: BlogLanguage) {
  return dict[language]
}

export function categoryName(category: { name: string; name_en: string | null }, language: BlogLanguage): string {
  return language === 'en' ? category.name_en || category.name : category.name
}

export function categoryDescription(
  category: { short_description: string | null; short_description_en: string | null },
  language: BlogLanguage
): string | null {
  return language === 'en' ? category.short_description_en || category.short_description : category.short_description
}
