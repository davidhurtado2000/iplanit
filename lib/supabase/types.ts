export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          plan: 'free' | 'premium'
          timezone: string
          language: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          plan?: 'free' | 'premium'
          timezone?: string
          language?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          plan?: 'free' | 'premium'
          timezone?: string
          language?: string
          created_at?: string
          updated_at?: string
        }
      }
      businesses: {
        Row: {
          id: string
          owner_id: string
          name: string
          slug: string | null
          description: string | null
          timezone: string
          phone: string | null
          email: string | null
          website: string | null
          address: string | null
          city: string | null
          country: string | null
          logo_url: string | null
          plan: 'free' | 'premium'
          type: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          slug?: string | null
          description?: string | null
          timezone?: string
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          logo_url?: string | null
          plan?: 'free' | 'premium'
          type?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          name?: string
          slug?: string | null
          description?: string | null
          timezone?: string
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          logo_url?: string | null
          plan?: 'free' | 'premium'
          type?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      services: {
        Row: {
          id: string
          business_id: string
          name: string
          description: string | null
          duration_minutes: number
          price: number
          color: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          description?: string | null
          duration_minutes?: number
          price?: number
          color?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          description?: string | null
          duration_minutes?: number
          price?: number
          color?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      resources: {
        Row: {
          id: string
          business_id: string
          name: string
          type: 'room' | 'person' | 'equipment' | 'virtual'
          color: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          type: 'room' | 'person' | 'equipment' | 'virtual'
          color?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          type?: 'room' | 'person' | 'equipment' | 'virtual'
          color?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          business_id: string
          name: string
          email: string | null
          phone: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          email?: string | null
          phone?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      reservations: {
        Row: {
          id: string
          business_id: string
          service_id: string
          client_id: string
          resource_id: string | null
          series_id: string | null
          start_time: string
          end_time: string
          status: 'confirmed' | 'pending' | 'cancelled' | 'completed'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          service_id: string
          client_id: string
          resource_id?: string | null
          series_id?: string | null
          start_time: string
          end_time: string
          status?: 'confirmed' | 'pending' | 'cancelled' | 'completed'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          service_id?: string
          client_id?: string
          resource_id?: string | null
          series_id?: string | null
          start_time?: string
          end_time?: string
          status?: 'confirmed' | 'pending' | 'cancelled' | 'completed'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      reservation_series: {
        Row: {
          id: string
          business_id: string
          client_id: string
          service_id: string
          resource_id: string | null
          days_of_week: number[]
          session_count: number
          notes: string | null
          status: 'active' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          client_id: string
          service_id: string
          resource_id?: string | null
          days_of_week: number[]
          session_count: number
          notes?: string | null
          status?: 'active' | 'cancelled'
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          client_id?: string
          service_id?: string
          resource_id?: string | null
          days_of_week?: number[]
          session_count?: number
          notes?: string | null
          status?: 'active' | 'cancelled'
          created_at?: string
        }
      }
      business_hours: {
        Row: {
          id: string
          business_id: string
          day_of_week: number
          open_time: string
          close_time: string
          is_closed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          day_of_week: number
          open_time: string
          close_time: string
          is_closed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          day_of_week?: number
          open_time?: string
          close_time?: string
          is_closed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
