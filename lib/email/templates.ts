export type EmailLanguage = 'es' | 'en'

export interface ReservationEmailData {
  clientName: string
  businessName: string
  /** Null for a visit with no specific service marked as an interest (see
   * reservation-modal.tsx - a visit's service is informational only, never
   * required). Always set for a booking. */
  serviceName: string | null
  /** A visit is never "booking a service" - every template below branches
   * on this so the copy never implies revenue/a service being delivered
   * when there isn't one (see lib/analytics.ts for the same distinction). */
  reservationType: 'booking' | 'visit'
  /** ISO timestamp (UTC) - formatted into the business's own timezone below. */
  startTime: string
  timezone: string
  language: EmailLanguage
  /** Link to app/reservar/cita/[id] - omitted for internally-created
   * reservations made before that public management page existed made sense
   * to link to (kept optional rather than always required). */
  manageUrl?: string
}

// clientName/businessName/serviceName all end up interpolated straight into
// an HTML email body below, and clientName in particular is attacker-
// controlled free text (typed into the public, unauthenticated booking
// form at app/reservar/[slug]/page.tsx, validated server-side only for
// "non-empty" - see create_public_reservation) - so every one of them gets
// escaped before it lands in an email, same as the feedback message.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDateTime(startTime: string, timezone: string, language: EmailLanguage): string {
  const locale = language === 'es' ? 'es-PE' : 'en-US'
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startTime))
}

// Inline-styled on purpose - most email clients strip <style> blocks or
// ignore classes, so every rule here has to survive being read as a plain
// inline style. Kept intentionally simple (one card, one accent color)
// rather than a full design system, since this only needs to render
// correctly, not match every pixel of the app's own UI.
function emailLayout(language: EmailLanguage, title: string, bodyHtml: string): string {
  const poweredBy = language === 'es' ? 'Reservas con iPlanit' : 'Booking powered by iPlanit'
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f5f7; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background-color: #2563eb; padding: 20px 24px;">
      <span style="color: #ffffff; font-size: 18px; font-weight: 700;">iPlanit</span>
    </div>
    <div style="padding: 24px;">
      <h1 style="font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 16px 0;">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding: 16px 24px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">${poweredBy}</p>
    </div>
  </div>
</div>`
}

function detailsCard(rows: Array<[string, string | null | undefined]>): string {
  const rowsHtml = rows
    .filter((row): row is [string, string] => !!row[1])
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding: 6px 0; font-size: 13px; color: #6b7280;">${label}</td>
        <td style="padding: 6px 0; font-size: 13px; color: #111827; font-weight: 500; text-align: right;">${value}</td>
      </tr>`
    )
    .join('')
  return `<table style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; padding: 12px 16px; margin: 16px 0;"><tbody>${rowsHtml}</tbody></table>`
}

function manageButton(url: string | undefined, language: EmailLanguage, reservationType: 'booking' | 'visit'): string {
  if (!url) return ''
  const label =
    language === 'es'
      ? reservationType === 'visit'
        ? 'Ver o cancelar mi visita'
        : 'Ver o cancelar mi reserva'
      : reservationType === 'visit'
        ? 'View or cancel my visit'
        : 'View or cancel my booking'
  return `<a href="${url}" style="display: inline-block; margin-top: 8px; padding: 10px 18px; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 6px;">${label}</a>`
}

// A visit's service (if any was picked) is an interest hint, not something
// being delivered - "Servicio"/"Service" would claim otherwise, so it gets
// its own, deliberately softer label. Returns null (dropped by detailsCard's
// filter) when there's nothing to show, rather than a row with an empty value.
function serviceRow(data: ReservationEmailData): [string, string | null | undefined] {
  const serviceName = data.serviceName ? escapeHtml(data.serviceName) : data.serviceName
  if (data.reservationType === 'visit') {
    return data.language === 'es' ? ['Interesado en', serviceName] : ['Interested in', serviceName]
  }
  return data.language === 'es' ? ['Servicio', serviceName] : ['Service', serviceName]
}

// Fires right when a reservation is created (still 'pending' - nobody has
// approved it yet), so this deliberately does NOT say "confirmed" - that
// word is reserved for buildApprovedEmail below, which fires at the actual
// moment staff changes the status to 'confirmed'. Both existing under the
// same "confirmations" toggle would be genuinely confusing to a client if
// they both claimed "your booking is confirmed" one after the other.
export function buildConfirmationEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, startTime, timezone, language, manageUrl, reservationType } = data
  const when = formatDateTime(startTime, timezone, language)
  const isVisit = reservationType === 'visit'
  const safeClientName = escapeHtml(clientName)
  const safeBusinessName = escapeHtml(businessName)

  if (language === 'es') {
    return {
      subject: isVisit ? `Solicitud de visita recibida - ${businessName}` : `Solicitud de reserva recibida - ${businessName}`,
      html: emailLayout(
        'es',
        isVisit ? 'Recibimos tu solicitud de visita' : 'Recibimos tu solicitud de reserva',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${safeClientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">${
           isVisit
             ? `Recibimos tu solicitud de visita a <strong>${safeBusinessName}</strong>. Te avisaremos en cuanto quede confirmada.`
             : `Recibimos tu solicitud de reserva en <strong>${safeBusinessName}</strong>. Te avisaremos en cuanto quede confirmada.`
         }</p>
         ${detailsCard([serviceRow(data), ['Fecha y hora', when]])}
         ${manageButton(manageUrl, 'es', reservationType)}`
      ),
    }
  }
  return {
    subject: isVisit ? `Visit request received - ${businessName}` : `Booking request received - ${businessName}`,
    html: emailLayout(
      'en',
      isVisit ? 'We received your visit request' : 'We received your booking request',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${safeClientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">${
         isVisit
           ? `We received your visit request to <strong>${safeBusinessName}</strong>. We'll let you know once it's confirmed.`
           : `We received your booking request with <strong>${safeBusinessName}</strong>. We'll let you know once it's confirmed.`
       }</p>
       ${detailsCard([serviceRow(data), ['Date and time', when]])}
       ${manageButton(manageUrl, 'en', reservationType)}`
    ),
  }
}

// Fires when staff explicitly marks a pending reservation as 'confirmed' -
// the actual moment the word "confirmed" becomes true, unlike the creation
// email above which fires while still pending.
export function buildApprovedEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, startTime, timezone, language, manageUrl, reservationType } = data
  const when = formatDateTime(startTime, timezone, language)
  const isVisit = reservationType === 'visit'
  const safeClientName = escapeHtml(clientName)
  const safeBusinessName = escapeHtml(businessName)

  if (language === 'es') {
    return {
      subject: isVisit ? `Visita confirmada - ${businessName}` : `Reserva confirmada - ${businessName}`,
      html: emailLayout(
        'es',
        isVisit ? 'Tu visita fue confirmada' : 'Tu reserva fue confirmada',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${safeClientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">${
           isVisit
             ? `¡Buenas noticias! Tu visita a <strong>${safeBusinessName}</strong> quedó confirmada. Te esperamos pronto.`
             : `Buenas noticias: tu reserva en <strong>${safeBusinessName}</strong> ya fue confirmada.`
         }</p>
         ${detailsCard([serviceRow(data), ['Fecha y hora', when]])}
         ${manageButton(manageUrl, 'es', reservationType)}`
      ),
    }
  }
  return {
    subject: isVisit ? `Visit confirmed - ${businessName}` : `Booking confirmed - ${businessName}`,
    html: emailLayout(
      'en',
      isVisit ? 'Your visit is confirmed' : 'Your booking is confirmed',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${safeClientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">${
         isVisit
           ? `Good news! Your visit to <strong>${safeBusinessName}</strong> is confirmed. We look forward to seeing you.`
           : `Good news: your booking with <strong>${safeBusinessName}</strong> is now confirmed.`
       }</p>
       ${detailsCard([serviceRow(data), ['Date and time', when]])}
       ${manageButton(manageUrl, 'en', reservationType)}`
    ),
  }
}

export function buildCancellationEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, startTime, timezone, language, reservationType } = data
  const when = formatDateTime(startTime, timezone, language)
  const isVisit = reservationType === 'visit'
  const safeClientName = escapeHtml(clientName)
  const safeBusinessName = escapeHtml(businessName)

  if (language === 'es') {
    return {
      subject: isVisit ? `Visita cancelada - ${businessName}` : `Reserva cancelada - ${businessName}`,
      html: emailLayout(
        'es',
        isVisit ? 'Tu visita fue cancelada' : 'Tu reserva fue cancelada',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${safeClientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">${
           isVisit
             ? `Se canceló tu visita a <strong>${safeBusinessName}</strong>.`
             : `Se canceló tu reserva en <strong>${safeBusinessName}</strong>.`
         }</p>
         ${detailsCard([serviceRow(data), ['Fecha y hora', when]])}
         <p style="font-size: 13px; color: #6b7280; margin: 16px 0 0 0;">Si esto no lo hiciste tú, contacta directamente al negocio.</p>`
      ),
    }
  }
  return {
    subject: isVisit ? `Visit cancelled - ${businessName}` : `Booking cancelled - ${businessName}`,
    html: emailLayout(
      'en',
      isVisit ? 'Your visit was cancelled' : 'Your booking was cancelled',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${safeClientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">${
         isVisit
           ? `Your visit to <strong>${safeBusinessName}</strong> was cancelled.`
           : `Your booking with <strong>${safeBusinessName}</strong> was cancelled.`
       }</p>
       ${detailsCard([serviceRow(data), ['Date and time', when]])}
       <p style="font-size: 13px; color: #6b7280; margin: 16px 0 0 0;">If you didn't do this, please contact the business directly.</p>`
    ),
  }
}

export function buildReminderEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, startTime, timezone, language, manageUrl, reservationType } = data
  const when = formatDateTime(startTime, timezone, language)
  const isVisit = reservationType === 'visit'
  const safeClientName = escapeHtml(clientName)
  const safeBusinessName = escapeHtml(businessName)

  if (language === 'es') {
    return {
      subject: isVisit ? `Recordatorio: tu visita a ${businessName}` : `Recordatorio: tu reserva en ${businessName}`,
      html: emailLayout(
        'es',
        isVisit ? 'Recordatorio de tu visita' : 'Recordatorio de tu reserva',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${safeClientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">${
           isVisit
             ? `Este es un recordatorio de tu próxima visita a <strong>${safeBusinessName}</strong>. ¡Te esperamos!`
             : `Este es un recordatorio de tu próxima reserva en <strong>${safeBusinessName}</strong>.`
         }</p>
         ${detailsCard([serviceRow(data), ['Fecha y hora', when]])}
         ${manageButton(manageUrl, 'es', reservationType)}`
      ),
    }
  }
  return {
    subject: isVisit ? `Reminder: your visit to ${businessName}` : `Reminder: your booking at ${businessName}`,
    html: emailLayout(
      'en',
      isVisit ? 'Your visit is coming up' : 'Your booking is coming up',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${safeClientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">${
         isVisit
           ? `This is a reminder about your upcoming visit to <strong>${safeBusinessName}</strong>. We look forward to seeing you!`
           : `This is a reminder about your upcoming booking with <strong>${safeBusinessName}</strong>.`
       }</p>
       ${detailsCard([serviceRow(data), ['Date and time', when]])}
       ${manageButton(manageUrl, 'en', reservationType)}`
    ),
  }
}

export interface TrialEndingEmailData {
  language: EmailLanguage
  priceUsd: number
  trialEndDate: Date
}

// Fires from the customer.subscription.trial_will_end webhook event,
// ~3 days before the first real charge - the mandatory heads-up so
// cancelling still feels like a real choice, not a surprise charge.
export function buildTrialEndingEmail(data: TrialEndingEmailData): { subject: string; html: string } {
  const { language, priceUsd, trialEndDate } = data
  const locale = language === 'es' ? 'es-PE' : 'en-US'
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(trialEndDate)
  const manageUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://iplanit.io'}/dashboard/settings`

  if (language === 'es') {
    return {
      subject: 'Tu mes gratis de iPlanit termina pronto',
      html: emailLayout(
        'es',
        'Tu mes gratis termina pronto',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola,</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">Tu mes de prueba gratis termina el <strong>${when}</strong>. A partir de esa fecha se cobrara automaticamente <strong>$${priceUsd}/mes</strong> a la tarjeta registrada, a menos que canceles antes.</p>
         <p style="font-size: 14px; color: #374151; margin: 16px 0 0 0;">Puedes cancelar en cualquier momento desde tu cuenta, sin costo.</p>
         <a href="${manageUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 18px; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 6px;">Administrar mi suscripcion</a>`
      ),
    }
  }
  return {
    subject: 'Your free month of iPlanit is ending soon',
    html: emailLayout(
      'en',
      'Your free month is ending soon',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi there,</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">Your free trial month ends on <strong>${when}</strong>. Starting then, <strong>$${priceUsd}/month</strong> will be charged automatically to your card on file, unless you cancel before that date.</p>
       <p style="font-size: 14px; color: #374151; margin: 16px 0 0 0;">You can cancel anytime from your account at no cost.</p>
       <a href="${manageUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 18px; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 6px;">Manage my subscription</a>`
    ),
  }
}

export interface FeedbackEmailData {
  message: string
  userEmail: string
  userName: string | null
  businessName: string | null
  pageUrl: string | null
  createdAt: string
}

// Internal, founder-facing only (never sent to a client) - always in
// Spanish rather than branching on the submitter's language, since the one
// reader is always David regardless of who sent the feedback.
export function buildFeedbackNotificationEmail(data: FeedbackEmailData): { subject: string; html: string } {
  const { message, userEmail, userName, businessName, pageUrl, createdAt } = data
  const when = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(createdAt))

  return {
    subject: `Nuevo feedback${businessName ? ` - ${businessName}` : ''}`,
    html: emailLayout(
      'es',
      'Nuevo feedback recibido',
      `<p style="font-size: 14px; color: #374151; white-space: pre-wrap; margin: 0 0 16px 0;">${escapeHtml(message)}</p>
       ${detailsCard([
         ['De', userName ? `${escapeHtml(userName)} (${escapeHtml(userEmail)})` : escapeHtml(userEmail)],
         ['Negocio', businessName ? escapeHtml(businessName) : null],
         ['Pagina', pageUrl ? escapeHtml(pageUrl) : null],
         ['Fecha', when],
       ])}`
    ),
  }
}
