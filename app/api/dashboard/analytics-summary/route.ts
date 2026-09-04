import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOpenAIClient, AI_SUMMARY_MODEL } from '@/lib/openai'
import { meetsPlan } from '@/lib/plan-limits'
import { AI_USAGE_MONTHLY_LIMIT, getAiUsageThisMonth, logAiUsage, startOfNextMonthUtc } from '@/lib/ai-usage'
import { isAiAddonActive } from '@/lib/ai-usage-client'
import type { Database } from '@/lib/supabase/types'

interface AnalyticsMetrics {
  currencySymbol: string
  totalRevenue: number
  totalReservations: number
  occupancyRate: number
  bookedHours: number
  openHours: number
  retentionRate: number
  newClients: number
  returningClients: number
  topServiceName: string | null
  topServiceCount: number | null
  averageTicket: number
  noShowRate: number
  cancellationRate: number
}

function buildSummaryPrompt(metrics: AnalyticsMetrics, language: 'es' | 'en') {
  const data = JSON.stringify(metrics)

  if (language === 'en') {
    return {
      system:
        'You help owners of a booking/appointment business understand how their business performed. Given the metrics below, write a short summary (3-4 sentences), in a professional but warm tone. Only use the numbers provided - never invent or estimate a figure that is not in the data. Plain prose, no markdown, no lists.',
      user: `Metrics for the selected period: ${data}`,
    }
  }
  return {
    system:
      'Ayudás a dueños de un negocio de reservas a entender cómo le fue a su negocio. Con las métricas de abajo, escribí un resumen breve (3 a 4 oraciones), en tono profesional pero cercano. Usá únicamente los números provistos - nunca inventes ni estimes un dato que no esté en la información. Prosa simple, sin markdown ni listas.',
    user: `Métricas del período seleccionado: ${data}`,
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const businessId = body?.businessId as string | undefined
    const language: 'es' | 'en' = body?.language === 'en' ? 'en' : 'es'
    const metrics = body?.metrics as AnalyticsMetrics | undefined

    if (!businessId || !metrics) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }

    // RLS is the real access boundary here, same as every other query this
    // session-scoped client makes - if businessId isn't one this user owns
    // or is a member of, the row simply doesn't come back.
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'business_not_found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, ai_addon_active, ai_addon_override, ai_addon_access_until')
      .eq('id', user.id)
      .single()

    // Defense in depth - the Analytics page already gates this client-side,
    // but a direct call to this route shouldn't be able to skip either
    // check, since every call here costs real money. isAiAddonActive covers
    // the manual override (ai_addon_override, e.g. David's own account for
    // testing on the real domain, see scripts/077-ai-addon.sql) and the
    // post-cancellation grace period (ai_addon_access_until, see
    // scripts/078) the same way the UI does.
    if (!meetsPlan(profile?.plan, 'pro') || !isAiAddonActive(profile)) {
      return NextResponse.json({ error: 'plan_required' }, { status: 403 })
    }

    const serviceSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const usageThisMonth = await getAiUsageThisMonth(serviceSupabase, businessId)
    if (usageThisMonth >= AI_USAGE_MONTHLY_LIMIT) {
      return NextResponse.json({ error: 'rate_limited', resetsOn: startOfNextMonthUtc().toISOString() }, { status: 429 })
    }

    const prompt = buildSummaryPrompt(metrics, language)

    const completion = await getOpenAIClient().chat.completions.create({
      model: AI_SUMMARY_MODEL,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    })

    const summary = completion.choices[0]?.message?.content?.trim()
    if (!summary) {
      return NextResponse.json({ error: 'empty_response' }, { status: 502 })
    }

    await logAiUsage(serviceSupabase, businessId, 'summary')

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[iplanit] Error generating analytics AI summary:', err)
    return NextResponse.json({ error: 'summary_failed' }, { status: 500 })
  }
}
