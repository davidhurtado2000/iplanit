import { cookies } from 'next/headers'
import { BLOG_LANGUAGE_COOKIE, type BlogLanguage } from '@/lib/blog-i18n'

// Split out of lib/blog-i18n.ts because that file is also imported by
// components/blog/language-switcher.tsx (a Client Component) - next/headers
// can only be imported from server-only code, so keeping this one function
// here is what lets the rest of blog-i18n.ts stay importable from the
// client without pulling next/headers into the browser bundle.
export async function resolveBlogLanguage(): Promise<BlogLanguage> {
  const cookieStore = await cookies()
  const saved = cookieStore.get(BLOG_LANGUAGE_COOKIE)?.value
  return saved === 'en' ? 'en' : 'es'
}
