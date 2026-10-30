import Twilio from 'twilio'

// Server-only - none of these have a NEXT_PUBLIC_ prefix, so bundlers never
// ship them to the browser. Only import this file from API routes / server
// code. Auth uses a restricted API Key (SID+Secret) rather than the
// account's main Auth Token, scoped to Messaging only (least privilege) -
// see docs/roadmap-ia-whatsapp.md Parte 1.
let _client: ReturnType<typeof Twilio> | undefined

export function getTwilioClient() {
  if (!_client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const apiKeySid = process.env.TWILIO_API_KEY_SID
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
    if (!accountSid) throw new Error('TWILIO_ACCOUNT_SID is not set')
    if (!apiKeySid) throw new Error('TWILIO_API_KEY_SID is not set')
    if (!apiKeySecret) throw new Error('TWILIO_API_KEY_SECRET is not set')
    _client = Twilio(apiKeySid, apiKeySecret, { accountSid })
  }
  return _client
}

// David's Twilio trial "Try out WhatsApp" number - only usable with
// recipients who joined by messaging it first (confirmed working
// 2026-09-02, using the pre-built "Appointment Reminders" content
// template - see REMINDER_TEMPLATE_SID below). Overridable via env once
// a business's own connected WhatsApp number replaces it in production -
// that's the one line that needs to change, nothing else in the sending
// code depends on which number this is.
export function getWhatsappFromNumber(): string {
  return process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+17372212163'
}

// Twilio's pre-built "Appointment Reminders" content template - free to use
// on trial accounts, no custom Content Template Builder access needed
// (that's paid-only). Good enough to validate the send flow end-to-end;
// swap for a custom-worded template later if the generic copy isn't right
// for production.
export const REMINDER_TEMPLATE_SID = 'HXfe5ab5f00277942d4d4200328b4d403c'

export function toWhatsappAddress(phone: string): string {
  return phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`
}

export interface WhatsappReminderVars {
  clientName: string
  businessName: string
  serviceName: string
  date: string
  time: string
}

// Meta rejects template variables containing newlines, tabs, or 4+
// consecutive spaces - all possible in names typed into a free-text form.
function cleanVar(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 200) || '-'
}

// Our own approved "recordatorio_cita" template (5 variables: client,
// business, service, date, time - see the template text sent to Meta).
// Set per language in Vercel once Meta approves it; until then this keeps
// using Twilio's free sample template with no variables, so the existing
// sandbox setup keeps working unchanged.
function reminderTemplateSid(language: 'es' | 'en') {
  return language === 'en'
    ? process.env.TWILIO_REMINDER_TEMPLATE_SID_EN || process.env.TWILIO_REMINDER_TEMPLATE_SID
    : process.env.TWILIO_REMINDER_TEMPLATE_SID
}

// normalizedPhone is a country-code-prefixed digit string with no leading
// "+" (the shape public.normalize_phone_for_matching returns, e.g.
// "51983720200") - see scripts/076-whatsapp-reminders.sql.
export async function sendWhatsappReminder(
  normalizedPhone: string,
  vars: WhatsappReminderVars,
  language: 'es' | 'en'
) {
  const ownTemplateSid = reminderTemplateSid(language)
  return getTwilioClient().messages.create({
    from: getWhatsappFromNumber(),
    to: toWhatsappAddress(`+${normalizedPhone}`),
    ...(ownTemplateSid
      ? {
          contentSid: ownTemplateSid,
          contentVariables: JSON.stringify({
            1: cleanVar(vars.clientName),
            2: cleanVar(vars.businessName),
            3: cleanVar(vars.serviceName),
            4: cleanVar(vars.date),
            5: cleanVar(vars.time),
          }),
        }
      : { contentSid: REMINDER_TEMPLATE_SID }),
  })
}
