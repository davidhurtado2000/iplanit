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

## 3. Language: both shown together, not conditional

These show both languages stacked in one email (Spanish then English)
rather than only the recipient's own language, since there's no local way
to render/test Supabase's Go-template syntax before trusting it in
production.

## 4. If a saved template ever doesn't seem to take effect

Supabase's template parser processes the ENTIRE file as Go template source
- including text inside HTML comments - before rendering. If the file
contains ANY broken/unclosed curly-brace expression anywhere (even one
only meant as prose, e.g. describing old syntax in a comment for
documentation purposes), the whole template fails to parse. On a parse
error, Supabase silently falls back to its own default template with NO
error shown anywhere in the dashboard editor - the editor keeps showing
your saved content looking perfectly fine, so this is easy to mistake for
a caching/propagation issue instead of what it actually is.

The only place the real error shows up is Supabase Dashboard -> your
project -> Logs -> Auth Logs, as an event named
`templatemailer_template_body_parse_error`. Check there first if a
template change ever doesn't seem to be taking effect, before assuming
it's a caching delay or an SMTP problem.
