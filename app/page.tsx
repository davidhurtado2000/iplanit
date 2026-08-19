import { LandingHeader } from '@/components/landing/landing-header'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { Features } from '@/components/landing/features'
import { Showcase } from '@/components/landing/showcase'
import { Industries } from '@/components/landing/industries'
import { Pricing } from '@/components/landing/pricing'
import { Faq } from '@/components/landing/faq'
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
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is iPlanit?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'iPlanit is a booking and scheduling platform for service businesses. Organize your calendar, clients, and team, and let clients book themselves through a public link, any time.',
          },
        },
        {
          '@type': 'Question',
          name: 'How much does iPlanit cost?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "There's a free plan, plus Pro ($25/month) and Premium ($40/month) plans with more features. No credit card required to start.",
          },
        },
        {
          '@type': 'Question',
          name: 'Do I need a credit card to try it?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. You can start on the Free plan without entering any payment details.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can my clients book without calling me?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Share your booking link and clients pick a service and time themselves, with real-time availability.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does it work for my type of business?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'iPlanit works for coworking spaces, medical and dental clinics, veterinary practices, spas, salons, gyms, restaurants, tutoring academies, photo studios, event venues, consultants, and other service businesses.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I cancel anytime?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Yes, there's no long-term contract. You can cancel your paid plan whenever you want.",
          },
        },
        {
          '@type': 'Question',
          name: 'Can I manage more than one location?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, the Premium plan supports multiple locations under one account, with shared client history across all of them.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is my data protected?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Each business's data is isolated at the database level, accessible only to that account, and every connection is encrypted (HTTPS).",
          },
        },
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
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
