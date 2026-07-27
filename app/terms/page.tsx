import { LegalPage } from '@/components/legal-page'
import { TERMS_ES, TERMS_EN } from '@/lib/legal-content'

export default function TermsPage() {
  return <LegalPage es={TERMS_ES} en={TERMS_EN} />
}
