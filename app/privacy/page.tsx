import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { PRIVACY_ES, PRIVACY_EN } from '@/lib/legal-content'

export const metadata: Metadata = {
  title: 'Privacy Policy - iPlanit',
  description: 'How iPlanit collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  return <LegalPage es={PRIVACY_ES} en={PRIVACY_EN} />
}
