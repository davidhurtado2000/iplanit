import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

export async function GET(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    // Validate user owns this business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get reservations for this date
    const { searchParams: params } = new URL(request.url)
    const date = params.get('date')

    if (!date) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    }

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const { data: reservations, error: reservationsError } = await supabase
      .from('reservations')
      .select('*, services(*), resources(*), clients(*)')
      .eq('business_id', businessId)
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time', { ascending: true })

    if (reservationsError) throw reservationsError

    return NextResponse.json(reservations)
  } catch (error) {
    console.error('Error fetching reservations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
