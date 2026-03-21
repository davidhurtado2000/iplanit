import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in login:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    console.error('Error fetching session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) throw error

    return NextResponse.json({ message: 'Signed out successfully' })
  } catch (error) {
    console.error('Error signing out:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
