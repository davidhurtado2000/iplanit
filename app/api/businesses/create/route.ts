import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { owner_id, name, timezone, slug } = body

    // Validate required fields
    if (!owner_id || !name || !timezone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create a Supabase admin client for server-side operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Insert the business directly - user was just created in registration flow
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .insert([
        {
          owner_id,
          name,
          timezone,
          slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        },
      ])
      .select()
      .single()

    if (businessError) {
      console.error('[v0] Business creation DB error:', businessError)
      return NextResponse.json(
        { error: 'Failed to create business: ' + businessError.message },
        { status: 400 }
      )
    }

    console.log('[v0] Business created:', business.id)

    return NextResponse.json(
      {
        business,
        message: 'Business created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[v0] Error in business creation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
