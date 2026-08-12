'use client'

import Link from 'next/link'
import { Mail, Phone } from 'lucide-react'
import { useLanguage } from '@/context/language-context'

// Same contact email already public on /terms and /privacy
// (lib/legal-content.ts) - reused here rather than a new one, so there's
// exactly one contact address across the whole site. Phone numbers: Peru
// (+51) and US (+1, Colorado area code - matches the LLC's state of
// incorporation) per David.
const CONTACT_EMAIL = 'davidsoftwareservicesllc@gmail.com'
const CONTACT_PHONES = ['+51 983 720 200', '+1 720 546 9411']

export function LandingFooter() {
  const { t } = useLanguage()
  const l = t.landing
  const year = new Date().getFullYear()

  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <img src="/favicon-96x96.png" alt="" className="h-7 w-7 dark:hidden" />
              <img src="/favicon-96x96-white.png" alt="" className="hidden h-7 w-7 dark:block" />
              <img src="/logotipo_modolight.png" alt="iPlanit" className="h-5 w-auto dark:hidden" />
              <img src="/logotipo_mododark.png" alt="iPlanit" className="hidden h-5 w-auto dark:block" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{l.footerTagline}</p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-12 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.footerProduct}</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><a href="#funciones" className="text-muted-foreground hover:text-foreground">{l.navFeatures}</a></li>
                <li><a href="#para-tu-negocio" className="text-muted-foreground hover:text-foreground">{l.navIndustries}</a></li>
                <li><a href="#planes" className="text-muted-foreground hover:text-foreground">{l.navPricing}</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.footerLegal}</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/terms" className="text-muted-foreground hover:text-foreground">{l.footerTerms}</Link></li>
                <li><Link href="/privacy" className="text-muted-foreground hover:text-foreground">{l.footerPrivacy}</Link></li>
              </ul>
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.footerContact}</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {CONTACT_EMAIL}
                  </a>
                </li>
                {CONTACT_PHONES.map((phone) => (
                  <li key={phone}>
                    <a
                      href={`tel:${phone.replace(/\s+/g, '')}`}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t pt-6 text-xs text-muted-foreground">
          &copy; {year} {l.footerCompany}. {l.footerRights}
        </div>
      </div>
    </footer>
  )
}
