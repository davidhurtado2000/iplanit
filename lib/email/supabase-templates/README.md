# Supabase auth email templates

Supabase's own auth emails (signup confirmation, password reset) are configured
entirely in the Supabase Dashboard, not in this repo's code - these HTML files
are a version-controlled copy of what's pasted there, kept for the same reason
`scripts/*.sql` are kept even though they're run manually.

Only `confirm-signup.html` and `reset-password.html` matter for this app -
Supabase also has "Invite user", "Magic Link", and "Change Email Address"
templates, but none of those flows are used here (team invites go through the
custom `add_business_staff` RPC, not Supabase's built-in invite; login is
password-based, not magic link; email can't be changed in Settings today).

## 1. Route these emails through Resend instead of Supabase's default mailer

Supabase's built-in email sending is meant for testing only (very low rate
limit, generic unbranded sender). Since `iplanit.io` is already verified in
Resend (see `lib/email/resend.ts`), route through it instead:

Supabase Dashboard -> Project Settings -> Authentication -> SMTP Settings ->
Enable Custom SMTP:
- Sender email: `cuenta@iplanit.io` (no new mailbox needed - Resend only
  requires the *domain* to be verified, same reasoning as
  `NOTIFICATIONS_FROM_EMAIL` in `lib/email/resend.ts`)
- Sender name: `iPlanit`
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend` (literally the word "resend" - this is Resend's fixed
  SMTP username)
- Password: your Resend API key (the same `RESEND_API_KEY` value already in
  `.env.local`/Vercel)

## 2. Paste the templates

Supabase Dashboard -> Authentication -> Email Templates:
- "Confirm signup" -> replace the body with `confirm-signup.html`'s content.
- "Reset Password" -> replace the body with `reset-password.html`'s content.

Save each, then test by signing up a throwaway account and requesting a
password reset, confirming both arrive from `cuenta@iplanit.io` with the new
design instead of Supabase's default template.
