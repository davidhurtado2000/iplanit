import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

export async function POST(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { businessId, serviceId, clientId, resourceId, startTime, endTime, status, notes } = body

    // Validate user owns this business
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check for time conflicts if resourceId is specified
    if (resourceId) {
      const { data: conflictingReservations } = await supabase
        .from('reservations')
        .select('id')
        .eq('business_id', businessId)
        .eq('resource_id', resourceId)
        .neq('status', 'cancelled')
        .gte('end_time', startTime)
        .lte('start_time', endTime)

      if (conflictingReservations && conflictingReservations.length > 0) {
        return NextResponse.json(
          { error: 'Time slot already reserved for this resource' },
          { status: 409 }
        )
      }
    }

    // Create reservation
    const { data: reservation, error: createError } = await supabase
      .from('reservations')
      .insert([
        {
          business_id: businessId,
          service_id: serviceId,
          client_id: clientId,
          resource_id: resourceId || null,
          start_time: startTime,
          end_time: endTime,
          status: status || 'confirmed',
          notes: notes || '',
        },
      ])
      .select()

    if (createError) throw createError

    return NextResponse.json(reservation[0], { status: 201 })
  } catch (error) {
    console.error('Error creating reservation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reservationId, ...updates } = body

    // Get reservation to verify ownership
    const { data: reservation } = await supabase
      .from('reservations')
      .select('business_id')
      .eq('id', reservationId)
      .single()

    if (!reservation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Verify user owns the business
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', reservation.business_id)
      .eq('owner_id', user.id)
      .single()

    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Update reservation
    const { data: updated, error: updateError } = await supabase
      .from('reservations')
      .update(updates)
      .eq('id', reservationId)
      .select()

    if (updateError) throw updateError

    return NextResponse.json(updated[0])
  } catch (error) {
    console.error('Error updating reservation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
