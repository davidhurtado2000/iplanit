import { LandingHeader } from '@/components/landing/landing-header'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { Features } from '@/components/landing/features'
import { Showcase } from '@/components/landing/showcase'
import { Industries } from '@/components/landing/industries'
import { Pricing } from '@/components/landing/pricing'
import { FinalCta } from '@/components/landing/final-cta'
import { LandingFooter } from '@/components/landing/footer'

// Static English copy, same reasoning as app/opengraph-image.tsx - search
// crawlers see this server-rendered markup once, with no access to the
// client-side language context, so it mirrors the site's true default
// language rather than trying to reflect the visitor's toggle state.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://iplanit.io/#organization',
      name: 'iPlanit',
      url: 'https://iplanit.io',
      logo: 'https://iplanit.io/favicon-96x96.png',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'iPlanit',
      url: 'https://iplanit.io',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'SaaS platform for managing bookings, appointments, and schedules for service businesses',
      publisher: { '@id': 'https://iplanit.io/#organization' },
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Pro', price: '25', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Premium', price: '40', priceCurrency: 'USD' },
      ],
    },
  ],
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <LandingHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Showcase />
        <Industries />
        <Pricing />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
