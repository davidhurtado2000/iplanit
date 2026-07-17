export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
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
        Relationships: []
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
          country: 'PE' | 'US'
          tax_id: string | null
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
          country?: 'PE' | 'US'
          tax_id?: string | null
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
          country?: 'PE' | 'US'
          tax_id?: string | null
          logo_url?: string | null
          plan?: 'free' | 'premium'
          type?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: string
          business_id: string
          name: string
          description: string | null
          duration_minutes: number
          price: number
          price_usd: number | null
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
          price_usd?: number | null
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
          price_usd?: number | null
          color?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          business_id: string
          name: string
          email: string | null
          phone: string | null
          notes: string | null
          dni: string | null
          ruc: string | null
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
          dni?: string | null
          ruc?: string | null
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
          dni?: string | null
          ruc?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      service_resources: {
        Row: {
          id: string
          service_id: string
          resource_id: string
          business_id: string
          created_at: string
        }
        Insert: {
          id?: string
          service_id: string
          resource_id: string
          business_id: string
          created_at?: string
        }
        Update: {
          id?: string
          service_id?: string
          resource_id?: string
          business_id?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      client_reservation_counts: {
        Row: {
          client_id: string
          business_id: string
          reservation_count: number
          confirmed_count: number
          last_reservation_at: string | null
        }
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
