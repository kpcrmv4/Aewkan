export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          base_place_id: string | null
          company_name_en: string
          company_name_th: string
          id: boolean
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          base_place_id?: string | null
          company_name_en?: string
          company_name_th?: string
          id?: boolean
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          base_place_id?: string | null
          company_name_en?: string
          company_name_th?: string
          id?: boolean
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_base_place_fk"
            columns: ["base_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor: string
          at: string
          booking_id: string
          data: Json
          id: number
          kind: string
        }
        Insert: {
          actor?: string
          at?: string
          booking_id: string
          data?: Json
          id?: never
          kind: string
        }
        Update: {
          actor?: string
          at?: string
          booking_id?: string
          data?: Json
          id?: never
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_photos: {
        Row: {
          booking_id: string
          id: string
          kind: string
          storage_path: string
          taken_at: string
        }
        Insert: {
          booking_id: string
          id?: string
          kind: string
          storage_path: string
          taken_at?: string
        }
        Update: {
          booking_id?: string
          id?: string
          kind?: string
          storage_path?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_photos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_stops: {
        Row: {
          booking_id: string
          checked_in_at: string | null
          dwell_min: number
          measured: boolean
          place_id: string
          planned_km: number
          planned_minutes: number
          seq: number
        }
        Insert: {
          booking_id: string
          checked_in_at?: string | null
          dwell_min?: number
          measured?: boolean
          place_id: string
          planned_km?: number
          planned_minutes?: number
          seq: number
        }
        Update: {
          booking_id?: string
          checked_in_at?: string | null
          dwell_min?: number
          measured?: boolean
          place_id?: string
          planned_km?: number
          planned_minutes?: number
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_stops_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_stops_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          booking_no: string
          cash_collected: number | null
          contact_channel: string
          created_at: string
          created_by: string | null
          customer_contact: string
          customer_lang: string
          customer_name: string
          deposit: number
          driver_id: string | null
          festival: boolean
          finished_at: string | null
          hotel: string
          id: string
          lang_driver: boolean
          mode: string
          note: string
          parent_booking_id: string | null
          pax: number
          pickup_place_id: string
          pickup_time: string
          plan: Json
          price_lines: Json
          price_total: number
          push_opt_in: boolean
          quote_deadline: string | null
          quote_deposit: number | null
          quote_hours: number | null
          quote_message: string | null
          quote_price: number | null
          quote_sent_at: string | null
          return_discount_pct: number | null
          round_trip: boolean
          rule_version: number
          started_at: string | null
          status: string
          travel_date: string
          updated_at: string
          vehicle_key: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          booking_no: string
          cash_collected?: number | null
          contact_channel?: string
          created_at?: string
          created_by?: string | null
          customer_contact: string
          customer_lang?: string
          customer_name: string
          deposit: number
          driver_id?: string | null
          festival?: boolean
          finished_at?: string | null
          hotel?: string
          id?: string
          lang_driver?: boolean
          mode: string
          note?: string
          parent_booking_id?: string | null
          pax: number
          pickup_place_id: string
          pickup_time: string
          plan?: Json
          price_lines?: Json
          price_total: number
          push_opt_in?: boolean
          quote_deadline?: string | null
          quote_deposit?: number | null
          quote_hours?: number | null
          quote_message?: string | null
          quote_price?: number | null
          quote_sent_at?: string | null
          return_discount_pct?: number | null
          round_trip?: boolean
          rule_version: number
          started_at?: string | null
          status?: string
          travel_date: string
          updated_at?: string
          vehicle_key: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          booking_no?: string
          cash_collected?: number | null
          contact_channel?: string
          created_at?: string
          created_by?: string | null
          customer_contact?: string
          customer_lang?: string
          customer_name?: string
          deposit?: number
          driver_id?: string | null
          festival?: boolean
          finished_at?: string | null
          hotel?: string
          id?: string
          lang_driver?: boolean
          mode?: string
          note?: string
          parent_booking_id?: string | null
          pax?: number
          pickup_place_id?: string
          pickup_time?: string
          plan?: Json
          price_lines?: Json
          price_total?: number
          push_opt_in?: boolean
          quote_deadline?: string | null
          quote_deposit?: number | null
          quote_hours?: number | null
          quote_message?: string | null
          quote_price?: number | null
          quote_sent_at?: string | null
          return_discount_pct?: number | null
          round_trip?: boolean
          rule_version?: number
          started_at?: string | null
          status?: string
          travel_date?: string
          updated_at?: string
          vehicle_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_parent_booking_id_fkey"
            columns: ["parent_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_pickup_place_id_fkey"
            columns: ["pickup_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_rule_version_fkey"
            columns: ["rule_version"]
            isOneToOne: false
            referencedRelation: "pricing_rule_sets"
            referencedColumns: ["version"]
          },
        ]
      }
      commission_reports: {
        Row: {
          booking_id: string
          company_share: number
          driver_share: number
          place_id: string
          reported_at: string
          rule_type: string
          sale_amount: number | null
          seq: number
          total: number
        }
        Insert: {
          booking_id: string
          company_share: number
          driver_share: number
          place_id: string
          reported_at?: string
          rule_type: string
          sale_amount?: number | null
          seq: number
          total: number
        }
        Update: {
          booking_id?: string
          company_share?: number
          driver_share?: number
          place_id?: string
          reported_at?: string
          rule_type?: string
          sale_amount?: number | null
          seq?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_reports_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          amount: number
          note: string
          place_id: string
          split_key: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          note?: string
          place_id: string
          split_key: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          note?: string
          place_id?: string
          split_key?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_counters: {
        Row: {
          last_no: number
          prefix: string
        }
        Insert: {
          last_no: number
          prefix: string
        }
        Update: {
          last_no?: number
          prefix?: string
        }
        Relationships: []
      }
      driver_off_days: {
        Row: {
          day: string
          driver_id: string
          reason: string
        }
        Insert: {
          day: string
          driver_id: string
          reason?: string
        }
        Update: {
          day?: string
          driver_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_off_days_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          car_en: string
          car_th: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          langs: string[]
          langs_en: string[]
          line_id: string
          name_en: string
          nickname: string
          note: string
          phone: string
          plate: string
          rating: number
          updated_at: string
          vehicle_key: string
          years: number
        }
        Insert: {
          car_en?: string
          car_th?: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          langs?: string[]
          langs_en?: string[]
          line_id?: string
          name_en?: string
          nickname: string
          note?: string
          phone?: string
          plate?: string
          rating?: number
          updated_at?: string
          vehicle_key: string
          years?: number
        }
        Update: {
          car_en?: string
          car_th?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          langs?: string[]
          langs_en?: string[]
          line_id?: string
          name_en?: string
          nickname?: string
          note?: string
          phone?: string
          plate?: string
          rating?: number
          updated_at?: string
          vehicle_key?: string
          years?: number
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json
          has_secret: boolean | null
          is_enabled: boolean
          key: string
          secret_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          has_secret?: boolean | null
          is_enabled?: boolean
          key: string
          secret_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          has_secret?: boolean | null
          is_enabled?: boolean
          key?: string
          secret_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      job_links: {
        Row: {
          audience: string
          booking_id: string
          created_at: string
          id: string
          last_seen_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          audience: string
          booking_id: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          audience?: string
          booking_id?: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      line_links: {
        Row: {
          booking_id: string
          created_at: string
          line_user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          line_user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          line_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string
          error: string | null
          id: number
          kind: string
          status: string
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string
          error?: string | null
          id?: never
          kind: string
          status: string
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string
          error?: string | null
          id?: never
          kind?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          method: string
          paid_at: string | null
          provider_ref: string | null
          purpose: string
          slip_path: string | null
          status: string
          updated_at: string
          verified_by: string | null
          verify_result: Json | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          method: string
          paid_at?: string | null
          provider_ref?: string | null
          purpose?: string
          slip_path?: string | null
          status?: string
          updated_at?: string
          verified_by?: string | null
          verify_result?: Json | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          method?: string
          paid_at?: string | null
          provider_ref?: string | null
          purpose?: string
          slip_path?: string | null
          status?: string
          updated_at?: string
          verified_by?: string | null
          verify_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          group_th: string
          key: string
          name_th: string
          sort: number
        }
        Insert: {
          group_th: string
          key: string
          name_th: string
          sort?: number
        }
        Update: {
          group_th?: string
          key?: string
          name_th?: string
          sort?: number
        }
        Relationships: []
      }
      places: {
        Row: {
          category: string
          created_at: string
          default_dwell_min: number
          id: string
          is_hidden: boolean
          is_mountain: boolean
          is_pickup: boolean
          label_pos: string
          lat: number
          lng: number
          name_en: string
          name_th: string
          slug: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          default_dwell_min?: number
          id?: string
          is_hidden?: boolean
          is_mountain?: boolean
          is_pickup?: boolean
          label_pos?: string
          lat: number
          lng: number
          name_en: string
          name_th: string
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_dwell_min?: number
          id?: string
          is_hidden?: boolean
          is_mountain?: boolean
          is_pickup?: boolean
          label_pos?: string
          lat?: number
          lng?: number
          name_en?: string
          name_th?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rule_sets: {
        Row: {
          created_at: string
          created_by: string | null
          is_current: boolean
          note: string
          rules: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          is_current?: boolean
          note?: string
          rules: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          is_current?: boolean
          note?: string
          rules?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      push_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: boolean
          is_enabled: boolean
          public_key: string
          secret_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: boolean
          is_enabled?: boolean
          public_key: string
          secret_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: boolean
          is_enabled?: boolean
          public_key?: string
          secret_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          job_link_id: string
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          job_link_id: string
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          job_link_id?: string
          p256dh?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_job_link_id_fkey"
            columns: ["job_link_id"]
            isOneToOne: false
            referencedRelation: "job_links"
            referencedColumns: ["id"]
          },
        ]
      }
      return_offers: {
        Row: {
          booking_id: string
          discount_pct: number
          dismissed_at: string | null
          from_place_id: string
          return_booking_id: string | null
          sent_at: string
          valid_until: string
        }
        Insert: {
          booking_id: string
          discount_pct: number
          dismissed_at?: string | null
          from_place_id: string
          return_booking_id?: string | null
          sent_at?: string
          valid_until: string
        }
        Update: {
          booking_id?: string
          discount_pct?: number
          dismissed_at?: string | null
          from_place_id?: string
          return_booking_id?: string | null
          sent_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_offers_from_place_id_fkey"
            columns: ["from_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_offers_return_booking_id_fkey"
            columns: ["return_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          revoked_at: string | null
          role_key: string
        }
        Insert: {
          permission_key: string
          revoked_at?: string | null
          role_key: string
        }
        Update: {
          permission_key?: string
          revoked_at?: string | null
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string
          is_system: boolean
          key: string
          name_th: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string
          is_system?: boolean
          key: string
          name_th: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string
          is_system?: boolean
          key?: string
          name_th?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          km: number
          measured_at: string
          minutes: number
          note: string
          place_a: string
          place_b: string
          samples: number
          source: string
        }
        Insert: {
          km: number
          measured_at?: string
          minutes: number
          note?: string
          place_a: string
          place_b: string
          samples?: number
          source: string
        }
        Update: {
          km?: number
          measured_at?: string
          minutes?: number
          note?: string
          place_a?: string
          place_b?: string
          samples?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_place_a_fkey"
            columns: ["place_a"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segments_place_b_fkey"
            columns: ["place_b"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          role_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role_key: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role_key: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role_key?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      trip_templates: {
        Row: {
          created_at: string
          date_hint: string | null
          id: string
          is_active: boolean
          name_en: string
          name_th: string
          round_trip: boolean
          sort: number
          stops: Json
          sub_en: string
          sub_th: string
          vehicle_key: string
        }
        Insert: {
          created_at?: string
          date_hint?: string | null
          id?: string
          is_active?: boolean
          name_en: string
          name_th: string
          round_trip?: boolean
          sort?: number
          stops: Json
          sub_en?: string
          sub_th?: string
          vehicle_key?: string
        }
        Update: {
          created_at?: string
          date_hint?: string | null
          id?: string
          is_active?: boolean
          name_en?: string
          name_th?: string
          round_trip?: boolean
          sort?: number
          stops?: Json
          sub_en?: string
          sub_th?: string
          vehicle_key?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_id: string
          provider: string
          received_at: string
        }
        Insert: {
          event_id: string
          provider: string
          received_at?: string
        }
        Update: {
          event_id?: string
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_staff_invite: {
        Args: { p_full_name: string; p_token: string }
        Returns: string
      }
      admin_job_kpis: { Args: never; Returns: Json }
      admin_payment_kpis: { Args: never; Returns: Json }
      admin_review_payment: {
        Args: { p_approve: boolean; p_note?: string; p_payment: string }
        Returns: Json
      }
      admin_set_status: {
        Args: {
          p_booking: string
          p_from: string
          p_reason?: string
          p_to: string
        }
        Returns: boolean
      }
      archive_role: { Args: { p_key: string }; Returns: undefined }
      create_staff_invite: {
        Args: { p_email: string; p_role: string; p_token: string }
        Returns: Json
      }
      cron_notify: { Args: never; Returns: number }
      current_owner_id: { Args: never; Returns: string }
      deposit_due: { Args: { p_booking: string }; Returns: number }
      deposit_open: {
        Args: { p_deadline: string; p_status: string }
        Returns: boolean
      }
      expire_online_payments: { Args: never; Returns: number }
      expire_quotes: { Args: never; Returns: number }
      get_integration_secret: { Args: { p_key: string }; Returns: string }
      get_job_view: { Args: { p_token: string }; Returns: Json }
      get_public_catalog: { Args: never; Returns: Json }
      get_push_config: { Args: never; Returns: Json }
      get_push_private_key: { Args: never; Returns: Json }
      get_staff_invite: { Args: { p_token: string }; Returns: Json }
      has_perm: { Args: { p_key: string }; Returns: boolean }
      integration_secret_fields: { Args: never; Returns: Json }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      issue_job_link: {
        Args: { p_audience: string; p_booking: string; p_token: string }
        Returns: string
      }
      job_checkin: { Args: { p_seq: number; p_token: string }; Returns: number }
      job_commission: {
        Args: { p_sale: number; p_seq: number; p_token: string }
        Returns: Json
      }
      job_driver_link: {
        Args: { p_token: string }
        Returns: {
          audience: string
          booking_id: string
          created_at: string
          id: string
          last_seen_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "job_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      job_finish: { Args: { p_cash: number; p_token: string }; Returns: Json }
      job_link_for: {
        Args: { p_token: string }
        Returns: {
          audience: string
          booking_id: string
          created_at: string
          id: string
          last_seen_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "job_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      job_pay_info: { Args: { p_token: string }; Returns: Json }
      job_pay_slip: { Args: { p_path: string; p_token: string }; Returns: Json }
      job_photo_path_ok: { Args: { p_name: string }; Returns: boolean }
      job_push_subscribe: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_token: string
        }
        Returns: undefined
      }
      job_record_photo: {
        Args: { p_kind: string; p_path: string; p_token: string }
        Returns: undefined
      }
      job_return_dismiss: { Args: { p_token: string }; Returns: undefined }
      job_start: { Args: { p_token: string }; Returns: undefined }
      line_bind: { Args: { p_token: string; p_user: string }; Returns: Json }
      log_notification: {
        Args: {
          p_booking: string
          p_channel: string
          p_error: string
          p_kind: string
          p_status: string
        }
        Returns: undefined
      }
      merge_integration_secret: {
        Args: { p_key: string; p_patch: Json }
        Returns: string[]
      }
      my_permissions: { Args: never; Returns: string[] }
      next_booking_no: { Args: never; Returns: string }
      owner_exists: { Args: never; Returns: boolean }
      payment_settle: {
        Args: {
          p_actor: string
          p_payment: string
          p_provider_ref: string
          p_result: Json
        }
        Returns: Json
      }
      payment_slip_path_ok: { Args: { p_name: string }; Returns: boolean }
      perms_within_mine: { Args: { p_perms: string[] }; Returns: boolean }
      publish_rule_set: {
        Args: { p_note?: string; p_rules: Json }
        Returns: number
      }
      revoke_staff_invite: { Args: { p_id: string }; Returns: undefined }
      role_perms: { Args: { p_role: string }; Returns: string[] }
      set_integration_secret: {
        Args: { p_key: string; p_secret: string }
        Returns: undefined
      }
      set_push_keys: {
        Args: {
          p_private: string
          p_public: string
          p_replace?: boolean
          p_subject: string
        }
        Returns: undefined
      }
      set_push_settings: {
        Args: { p_enabled: boolean; p_subject: string }
        Returns: undefined
      }
      token_hash: { Args: { p_token: string }; Returns: string }
      transfer_ownership: { Args: { p_new_owner: string }; Returns: undefined }
      update_staff: {
        Args: { p_active?: boolean; p_role?: string; p_staff: string }
        Returns: undefined
      }
      upsert_role: {
        Args: {
          p_description: string
          p_key: string
          p_name: string
          p_permissions: string[]
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
