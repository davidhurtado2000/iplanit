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
          currency: 'PEN' | 'USD'
          cancellation_policy_hours: number
          offers_parking: boolean
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
          currency?: 'PEN' | 'USD'
          cancellation_policy_hours?: number
          offers_parking?: boolean
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
          currency?: 'PEN' | 'USD'
          cancellation_policy_hours?: number
          offers_parking?: boolean
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
          pricing_mode: 'fixed' | 'preset' | 'hourly'
          hourly_rate: number | null
          hourly_rate_usd: number | null
          min_hours: number | null
          max_hours: number | null
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
          pricing_mode?: 'fixed' | 'preset' | 'hourly'
          hourly_rate?: number | null
          hourly_rate_usd?: number | null
          min_hours?: number | null
          max_hours?: number | null
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
          pricing_mode?: 'fixed' | 'preset' | 'hourly'
          hourly_rate?: number | null
          hourly_rate_usd?: number | null
          min_hours?: number | null
          max_hours?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_duration_options: {
        Row: {
          id: string
          service_id: string
          business_id: string
          duration_minutes: number
          price: number | null
          price_usd: number | null
          created_at: string
        }
        Insert: {
          id?: string
          service_id: string
          business_id: string
          duration_minutes: number
          price?: number | null
          price_usd?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          service_id?: string
          business_id?: string
          duration_minutes?: number
          price?: number | null
          price_usd?: number | null
          created_at?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          id: string
          business_id: string
          name: string
          type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
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
          type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
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
          type?: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
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
          document_type: 'dni' | 'ruc' | 'ein' | 'passport' | 'other' | null
          document_number: string | null
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
          document_type?: 'dni' | 'ruc' | 'ein' | 'passport' | 'other' | null
          document_number?: string | null
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
          document_type?: 'dni' | 'ruc' | 'ein' | 'passport' | 'other' | null
          document_number?: string | null
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
          service_id: string | null
          client_id: string
          resource_id: string | null
          parking_resource_id: string | null
          series_id: string | null
          start_time: string
          end_time: string
          status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
          type: 'booking' | 'visit'
          price: number | null
          price_usd: number | null
          cancelled_by: 'client' | 'business' | null
          cancelled_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          service_id?: string | null
          client_id: string
          resource_id?: string | null
          parking_resource_id?: string | null
          series_id?: string | null
          start_time: string
          end_time: string
          status?: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
          type?: 'booking' | 'visit'
          price?: number | null
          price_usd?: number | null
          cancelled_by?: 'client' | 'business' | null
          cancelled_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          service_id?: string | null
          client_id?: string
          resource_id?: string | null
          parking_resource_id?: string | null
          series_id?: string | null
          start_time?: string
          end_time?: string
          status?: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
          type?: 'booking' | 'visit'
          price?: number | null
          price_usd?: number | null
          cancelled_by?: 'client' | 'business' | null
          cancelled_at?: string | null
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
      business_members: {
        Row: {
          id: string
          business_id: string
          user_id: string
          email: string
          full_name: string | null
          role: 'admin' | 'sales'
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          user_id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'sales'
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          user_id?: string
          email?: string
          full_name?: string | null
          role?: 'admin' | 'sales'
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
          no_show_count: number
          late_cancellation_count: number
          last_reservation_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_business_staff: {
        Args: { p_business_id: string; p_email: string; p_role?: 'admin' | 'sales' }
        Returns: Json
      }
      is_business_accessible: {
        Args: { target_business_id: string }
        Returns: boolean
      }
      business_member_role: {
        Args: { target_business_id: string }
        Returns: string
      }
      get_public_business: {
        Args: { p_slug: string }
        Returns: Json
      }
      get_public_services: {
        Args: { p_business_id: string }
        Returns: Json
      }
      get_public_business_hours: {
        Args: { p_business_id: string }
        Returns: Json
      }
      get_public_busy_times: {
        Args: { p_business_id: string; p_resource_id: string | null; p_from: string; p_to: string }
        Returns: Json
      }
      create_public_reservation: {
        Args: {
          p_slug: string
          p_service_id: string
          p_resource_id: string | null
          p_start_time: string
          p_client_name: string
          p_client_email: string | null
          p_client_phone: string | null
          p_notes: string | null
          p_duration_option_id?: string | null
          p_needs_parking?: boolean
          p_hours?: number | null
        }
        Returns: Json
      }
      find_available_parking_resource: {
        Args: { p_business_id: string; p_start: string; p_end: string }
        Returns: string | null
      }
      get_public_reservation_status: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      cancel_public_reservation: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
    }
    Enums: Record<string, never>
  }
}
