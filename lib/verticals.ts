import { Scissors, Sparkles, Stethoscope, GraduationCap, Dumbbell, MoreHorizontal, type LucideIcon } from 'lucide-react'

/**
 * The 6 /negocios/[vertical] pages, one per blog category except "general"
 * (scripts/065-blog.sql) - slugs are shared with blog_categories.slug on
 * purpose, so a vertical page can link to its blog category with no
 * mapping table. metaTitle/metaDescription are fixed English, same
 * convention as app/page.tsx's JSON-LD: a crawler sees generateMetadata
 * once, server-rendered, with no access to the client-side language
 * toggle - the ON-PAGE content (context/language-context.tsx's
 * t.landing.verticals) is the bilingual part.
 */
export interface Vertical {
  slug: string
  icon: LucideIcon
  metaTitle: string
  metaDescription: string
}

export const VERTICALS: Vertical[] = [
  {
    slug: 'peluquerias-barberias',
    icon: Scissors,
    metaTitle: 'Booking software for hair salons and barbershops | iPlanit',
    metaDescription:
      'Online booking for hair salons and barbershops. Let clients book a stylist or barber themselves, reduce no-shows with reminders, and manage your whole team from one calendar.',
  },
  {
    slug: 'spas-centros-de-belleza',
    icon: Sparkles,
    metaTitle: 'Booking software for spas and beauty centers | iPlanit',
    metaDescription:
      'Online booking for spas and beauty centers. Manage treatment rooms, multiple services per client, and automatic reminders - all from one calendar.',
  },
  {
    slug: 'clinicas-salud',
    icon: Stethoscope,
    metaTitle: 'Scheduling software for clinics and medical offices | iPlanit',
    metaDescription:
      'Appointment scheduling for clinics, dental offices, and health practices. Client history, automatic reminders to cut no-shows, and a public booking link for patients.',
  },
  {
    slug: 'academias-educacion',
    icon: GraduationCap,
    metaTitle: 'Booking software for academies and private lessons | iPlanit',
    metaDescription:
      'Class and lesson scheduling for academies and private tutors. Recurring bookings, teacher assignment, and a public link so students book themselves.',
  },
  {
    slug: 'gimnasios-fitness',
    icon: Dumbbell,
    metaTitle: 'Booking software for gyms and fitness studios | iPlanit',
    metaDescription:
      'Class and session booking for gyms and fitness studios. Trainer assignment, equipment/room scheduling, and automatic reminders for your members.',
  },
  {
    slug: 'otros-negocios-de-servicios',
    icon: MoreHorizontal,
    metaTitle: 'Booking software for service businesses | iPlanit',
    metaDescription:
      'Online booking and scheduling for any service business - coworking spaces, restaurants, photographers, event venues, consultants, and independent professionals.',
  },
]
