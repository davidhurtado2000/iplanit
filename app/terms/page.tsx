import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { TERMS_ES, TERMS_EN } from '@/lib/legal-content'

export const metadata: Metadata = {
  title: 'Terms and Conditions - iPlanit',
  description: 'The terms and conditions for using the iPlanit booking and scheduling platform.',
}

export default function TermsPage() {
  return <LegalPage es={TERMS_ES} en={TERMS_EN} />
}
