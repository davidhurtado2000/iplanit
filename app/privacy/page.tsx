import { LegalPage } from '@/components/legal-page'
import { PRIVACY_ES, PRIVACY_EN } from '@/lib/legal-content'

export default function PrivacyPage() {
  return <LegalPage es={PRIVACY_ES} en={PRIVACY_EN} />
}
