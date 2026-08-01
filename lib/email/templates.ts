export type EmailLanguage = 'es' | 'en'

export interface ReservationEmailData {
  clientName: string
  businessName: string
  serviceName: string
  /** ISO timestamp (UTC) - formatted into the business's own timezone below. */
  startTime: string
  timezone: string
  language: EmailLanguage
  /** Link to app/reservar/cita/[id] - omitted for internally-created
   * reservations made before that public management page existed made sense
   * to link to (kept optional rather than always required). */
  manageUrl?: string
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

function detailsCard(rows: Array<[string, string]>): string {
  const rowsHtml = rows
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

function manageButton(url: string | undefined, language: EmailLanguage): string {
  if (!url) return ''
  const label = language === 'es' ? 'Ver o cancelar mi reserva' : 'View or cancel my booking'
  return `<a href="${url}" style="display: inline-block; margin-top: 8px; padding: 10px 18px; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 6px;">${label}</a>`
}

// Fires right when a reservation is created (still 'pending' - nobody has
// approved it yet), so this deliberately does NOT say "confirmed" - that
// word is reserved for buildApprovedEmail below, which fires at the actual
// moment staff changes the status to 'confirmed'. Both existing under the
// same "confirmations" toggle would be genuinely confusing to a client if
// they both claimed "your booking is confirmed" one after the other.
export function buildConfirmationEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, serviceName, startTime, timezone, language, manageUrl } = data
  const when = formatDateTime(startTime, timezone, language)

  if (language === 'es') {
    return {
      subject: `Solicitud de reserva recibida - ${businessName}`,
      html: emailLayout(
        'es',
        'Recibimos tu solicitud de reserva',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${clientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">Recibimos tu solicitud de reserva en <strong>${businessName}</strong>. Te avisaremos en cuanto quede confirmada.</p>
         ${detailsCard([
           ['Servicio', serviceName],
           ['Fecha y hora', when],
         ])}
         ${manageButton(manageUrl, 'es')}`
      ),
    }
  }
  return {
    subject: `Booking request received - ${businessName}`,
    html: emailLayout(
      'en',
      'We received your booking request',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${clientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">We received your booking request with <strong>${businessName}</strong>. We'll let you know once it's confirmed.</p>
       ${detailsCard([
         ['Service', serviceName],
         ['Date and time', when],
       ])}
       ${manageButton(manageUrl, 'en')}`
    ),
  }
}

// Fires when staff explicitly marks a pending reservation as 'confirmed' -
// the actual moment the word "confirmed" becomes true, unlike the creation
// email above which fires while still pending.
export function buildApprovedEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, serviceName, startTime, timezone, language, manageUrl } = data
  const when = formatDateTime(startTime, timezone, language)

  if (language === 'es') {
    return {
      subject: `Reserva confirmada - ${businessName}`,
      html: emailLayout(
        'es',
        'Tu reserva fue confirmada',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${clientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">Buenas noticias: tu reserva en <strong>${businessName}</strong> ya fue confirmada.</p>
         ${detailsCard([
           ['Servicio', serviceName],
           ['Fecha y hora', when],
         ])}
         ${manageButton(manageUrl, 'es')}`
      ),
    }
  }
  return {
    subject: `Booking confirmed - ${businessName}`,
    html: emailLayout(
      'en',
      'Your booking is confirmed',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${clientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">Good news: your booking with <strong>${businessName}</strong> is now confirmed.</p>
       ${detailsCard([
         ['Service', serviceName],
         ['Date and time', when],
       ])}
       ${manageButton(manageUrl, 'en')}`
    ),
  }
}

export function buildCancellationEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, serviceName, startTime, timezone, language } = data
  const when = formatDateTime(startTime, timezone, language)

  if (language === 'es') {
    return {
      subject: `Reserva cancelada - ${businessName}`,
      html: emailLayout(
        'es',
        'Tu reserva fue cancelada',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${clientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">Se canceló tu reserva en <strong>${businessName}</strong>.</p>
         ${detailsCard([
           ['Servicio', serviceName],
           ['Fecha y hora', when],
         ])}
         <p style="font-size: 13px; color: #6b7280; margin: 16px 0 0 0;">Si esto no lo hiciste tú, contacta directamente al negocio.</p>`
      ),
    }
  }
  return {
    subject: `Booking cancelled - ${businessName}`,
    html: emailLayout(
      'en',
      'Your booking was cancelled',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${clientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">Your booking with <strong>${businessName}</strong> was cancelled.</p>
       ${detailsCard([
         ['Service', serviceName],
         ['Date and time', when],
       ])}
       <p style="font-size: 13px; color: #6b7280; margin: 16px 0 0 0;">If you didn't do this, please contact the business directly.</p>`
    ),
  }
}

export function buildReminderEmail(data: ReservationEmailData): { subject: string; html: string } {
  const { clientName, businessName, serviceName, startTime, timezone, language, manageUrl } = data
  const when = formatDateTime(startTime, timezone, language)

  if (language === 'es') {
    return {
      subject: `Recordatorio: tu reserva en ${businessName}`,
      html: emailLayout(
        'es',
        'Recordatorio de tu reserva',
        `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hola ${clientName},</p>
         <p style="font-size: 14px; color: #374151; margin: 0;">Este es un recordatorio de tu próxima reserva en <strong>${businessName}</strong>.</p>
         ${detailsCard([
           ['Servicio', serviceName],
           ['Fecha y hora', when],
         ])}
         ${manageButton(manageUrl, 'es')}`
      ),
    }
  }
  return {
    subject: `Reminder: your booking at ${businessName}`,
    html: emailLayout(
      'en',
      'Your booking is coming up',
      `<p style="font-size: 14px; color: #374151; margin: 0 0 8px 0;">Hi ${clientName},</p>
       <p style="font-size: 14px; color: #374151; margin: 0;">This is a reminder about your upcoming booking with <strong>${businessName}</strong>.</p>
       ${detailsCard([
         ['Service', serviceName],
         ['Date and time', when],
       ])}
       ${manageButton(manageUrl, 'en')}`
    ),
  }
}
