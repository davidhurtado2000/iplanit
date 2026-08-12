import { LandingHeader } from '@/components/landing/landing-header'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { Features } from '@/components/landing/features'
import { Showcase } from '@/components/landing/showcase'
import { Industries } from '@/components/landing/industries'
import { Pricing } from '@/components/landing/pricing'
import { FinalCta } from '@/components/landing/final-cta'
import { LandingFooter } from '@/components/landing/footer'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
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
