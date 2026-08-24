'use client'

import { BLOG_LANGUAGE_COOKIE, type BlogLanguage } from '@/lib/blog-i18n'
import { cn } from '@/lib/utils'

// Deliberately not the app-wide LanguageToggle (components/language-toggle.tsx)
// - that one flips a client-side context in place, which only works because
// both languages' text already live in the same page bundle. Here EN and ES
// are different rows of DB content at different URLs, so switching means a
// real navigation: write the cookie the server reads on the next request,
// then load the target URL. A disabled button (no href) means this article
// has no published translation yet.
export function BlogLanguageSwitcher({
  current,
  links,
  disabledTooltip,
}: {
  current: BlogLanguage
  links: Record<BlogLanguage, string | null>
  disabledTooltip: string
}) {
  const go = (lang: BlogLanguage, href: string | null) => {
    if (lang === current || !href) return
    document.cookie = `${BLOG_LANGUAGE_COOKIE}=${lang}; path=/; max-age=31536000`
    window.location.href = href
  }

  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-white/10">
      {(['en', 'es'] as const).map((lang, i) => {
        const href = links[lang]
        const disabled = lang !== current && !href
        return (
          <button
            key={lang}
            type="button"
            title={disabled ? disabledTooltip : undefined}
            disabled={disabled}
            onClick={() => go(lang, href)}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium transition-colors',
              i === 1 && 'border-l border-white/10',
              lang === current
                ? 'bg-primary text-primary-foreground'
                : disabled
                  ? 'cursor-not-allowed text-muted-foreground/40'
                  : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {lang.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
