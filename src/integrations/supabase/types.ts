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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          cafe_id: string
          created_at: string
          id: string
          kind: string
          message: string
        }
        Insert: {
          cafe_id: string
          created_at?: string
          id?: string
          kind?: string
          message: string
        }
        Update: {
          cafe_id?: string
          created_at?: string
          id?: string
          kind?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          average_spend: number | null
          booking_date: string
          booking_time: string
          cafe_id: string
          checked_in_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          customer_user_id: string | null
          estimated_wait_time_minutes: number | null
          id: string
          no_show_count: number | null
          notes: string | null
          persons: number
          preferred_time: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["booking_status"]
          table_no: string | null
          total_visits: number | null
          updated_at: string
          waitlist_added_at: string | null
          waitlist_notes: string | null
          waitlist_position: number | null
          waitlist_promoted_at: string | null
          waitlist_status: Database["public"]["Enums"]["waitlist_status"] | null
        }
        Insert: {
          average_spend?: number | null
          booking_date: string
          booking_time: string
          cafe_id: string
          checked_in_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          customer_user_id?: string | null
          estimated_wait_time_minutes?: number | null
          id?: string
          no_show_count?: number | null
          notes?: string | null
          persons?: number
          preferred_time?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          table_no?: string | null
          total_visits?: number | null
          updated_at?: string
          waitlist_added_at?: string | null
          waitlist_notes?: string | null
          waitlist_position?: number | null
          waitlist_promoted_at?: string | null
          waitlist_status?:
            | Database["public"]["Enums"]["waitlist_status"]
            | null
        }
        Update: {
          average_spend?: number | null
          booking_date?: string
          booking_time?: string
          cafe_id?: string
          checked_in_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          estimated_wait_time_minutes?: number | null
          id?: string
          no_show_count?: number | null
          notes?: string | null
          persons?: number
          preferred_time?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          table_no?: string | null
          total_visits?: number | null
          updated_at?: string
          waitlist_added_at?: string | null
          waitlist_notes?: string | null
          waitlist_position?: number | null
          waitlist_promoted_at?: string | null
          waitlist_status?:
            | Database["public"]["Enums"]["waitlist_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cafe_staff: {
        Row: {
          cafe_id: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cafe_id: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cafe_id?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cafe_staff_codes: {
        Row: {
          active: boolean
          cafe_id: string
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          invited_email: string | null
          max_uses: number | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          updated_at: string
          used_count: number
        }
        Insert: {
          active?: boolean
          cafe_id: string
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          invited_email?: string | null
          max_uses?: number | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          active?: boolean
          cafe_id?: string
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          invited_email?: string | null
          max_uses?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      cafes: {
        Row: {
          accept_online_orders: boolean | null
          accept_reservations: boolean | null
          address: string | null
          allow_payment_simulation: boolean
          analytics_enabled: boolean | null
          auto_response_feedback: boolean | null
          banner_url: string | null
          cash_drawer_enabled: boolean | null
          city: string | null
          country: string | null
          created_at: string
          currency: string | null
          data_retention_days: number | null
          description: string | null
          email: string | null
          eta_presets: number[]
          export_enabled: boolean | null
          feedback_enabled: boolean | null
          feedback_thank_you_message: string | null
          gstin: string | null
          id: string
          kds_pairing_code: string | null
          kds_pairing_code_set_at: string | null
          kds_pin_hash: string | null
          last_invoice_number: number | null
          logo_url: string | null
          loyalty_enabled: boolean | null
          name: string
          onboarding_completed: boolean | null
          opening_hours: Json | null
          operational_alerts_enabled: boolean | null
          order_modification_window_minutes: number | null
          order_timer_enabled: boolean | null
          owner_user_id: string | null
          phone: string | null
          points_per_currency: number
          razorpay_key_id: string | null
          razorpay_key_secret: string | null
          razorpay_mode: string
          realtime_metrics_enabled: boolean | null
          referral_reward_points: number | null
          seating_capacity: number | null
          slot_capacity: number
          slug: string
          sound_alerts_enabled: boolean
          split_bill_enabled: boolean | null
          staff_metrics_enabled: boolean | null
          state: string | null
          stuck_kitchen_minutes: number
          stuck_ready_minutes: number
          stuck_unaccepted_minutes: number
          table_management_enabled: boolean | null
          table_ordering_enabled: boolean
          table_qr_codes_enabled: boolean | null
          tax_rate: number
          timezone: string | null
        }
        Insert: {
          accept_online_orders?: boolean | null
          accept_reservations?: boolean | null
          address?: string | null
          allow_payment_simulation?: boolean
          analytics_enabled?: boolean | null
          auto_response_feedback?: boolean | null
          banner_url?: string | null
          cash_drawer_enabled?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          data_retention_days?: number | null
          description?: string | null
          email?: string | null
          eta_presets?: number[]
          export_enabled?: boolean | null
          feedback_enabled?: boolean | null
          feedback_thank_you_message?: string | null
          gstin?: string | null
          id?: string
          kds_pairing_code?: string | null
          kds_pairing_code_set_at?: string | null
          kds_pin_hash?: string | null
          last_invoice_number?: number | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          name: string
          onboarding_completed?: boolean | null
          opening_hours?: Json | null
          operational_alerts_enabled?: boolean | null
          order_modification_window_minutes?: number | null
          order_timer_enabled?: boolean | null
          owner_user_id?: string | null
          phone?: string | null
          points_per_currency?: number
          razorpay_key_id?: string | null
          razorpay_key_secret?: string | null
          razorpay_mode?: string
          realtime_metrics_enabled?: boolean | null
          referral_reward_points?: number | null
          seating_capacity?: number | null
          slot_capacity?: number
          slug: string
          sound_alerts_enabled?: boolean
          split_bill_enabled?: boolean | null
          staff_metrics_enabled?: boolean | null
          state?: string | null
          stuck_kitchen_minutes?: number
          stuck_ready_minutes?: number
          stuck_unaccepted_minutes?: number
          table_management_enabled?: boolean | null
          table_ordering_enabled?: boolean
          table_qr_codes_enabled?: boolean | null
          tax_rate?: number
          timezone?: string | null
        }
        Update: {
          accept_online_orders?: boolean | null
          accept_reservations?: boolean | null
          address?: string | null
          allow_payment_simulation?: boolean
          analytics_enabled?: boolean | null
          auto_response_feedback?: boolean | null
          banner_url?: string | null
          cash_drawer_enabled?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          data_retention_days?: number | null
          description?: string | null
          email?: string | null
          eta_presets?: number[]
          export_enabled?: boolean | null
          feedback_enabled?: boolean | null
          feedback_thank_you_message?: string | null
          gstin?: string | null
          id?: string
          kds_pairing_code?: string | null
          kds_pairing_code_set_at?: string | null
          kds_pin_hash?: string | null
          last_invoice_number?: number | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          name?: string
          onboarding_completed?: boolean | null
          opening_hours?: Json | null
          operational_alerts_enabled?: boolean | null
          order_modification_window_minutes?: number | null
          order_timer_enabled?: boolean | null
          owner_user_id?: string | null
          phone?: string | null
          points_per_currency?: number
          razorpay_key_id?: string | null
          razorpay_key_secret?: string | null
          razorpay_mode?: string
          realtime_metrics_enabled?: boolean | null
          referral_reward_points?: number | null
          seating_capacity?: number | null
          slot_capacity?: number
          slug?: string
          sound_alerts_enabled?: boolean
          split_bill_enabled?: boolean | null
          staff_metrics_enabled?: boolean | null
          state?: string | null
          stuck_kitchen_minutes?: number
          stuck_ready_minutes?: number
          stuck_unaccepted_minutes?: number
          table_management_enabled?: boolean | null
          table_ordering_enabled?: boolean
          table_qr_codes_enabled?: boolean | null
          tax_rate?: number
          timezone?: string | null
        }
        Relationships: []
      }
      cash_collections: {
        Row: {
          amount: number
          cafe_id: string
          collected_at: string
          id: string
          order_id: string
          staff_id: string
        }
        Insert: {
          amount: number
          cafe_id: string
          collected_at?: string
          id?: string
          order_id: string
          staff_id: string
        }
        Update: {
          amount?: number
          cafe_id?: string
          collected_at?: string
          id?: string
          order_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_collections_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_collections_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_collections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawer_transactions: {
        Row: {
          amount: number
          cafe_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          new_balance: number
          notes: string | null
          previous_balance: number
          reference_booking_id: string | null
          reference_order_id: string | null
          staff_user_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          cafe_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          new_balance?: number
          notes?: string | null
          previous_balance?: number
          reference_booking_id?: string | null
          reference_order_id?: string | null
          staff_user_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          cafe_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          new_balance?: number
          notes?: string | null
          previous_balance?: number
          reference_booking_id?: string | null
          reference_order_id?: string | null
          staff_user_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_transactions_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_transactions_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_transactions_reference_booking_id_fkey"
            columns: ["reference_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_transactions_reference_order_id_fkey"
            columns: ["reference_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_favorites: {
        Row: {
          added_at: string
          cafe_id: string
          customer_id: string
          id: string
          menu_item_id: string
          notes: string | null
        }
        Insert: {
          added_at?: string
          cafe_id: string
          customer_id: string
          id?: string
          menu_item_id: string
          notes?: string | null
        }
        Update: {
          added_at?: string
          cafe_id?: string
          customer_id?: string
          id?: string
          menu_item_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_favorites_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_favorites_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_favorites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_favorites_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_feedback: {
        Row: {
          anonymous: boolean | null
          booking_id: string | null
          cafe_id: string
          category: string
          comments: string | null
          created_at: string
          customer_id: string
          id: string
          order_id: string | null
          rating: number
          responded: boolean | null
          responded_at: string | null
          responded_by: string | null
          response: string | null
          updated_at: string
        }
        Insert: {
          anonymous?: boolean | null
          booking_id?: string | null
          cafe_id: string
          category: string
          comments?: string | null
          created_at?: string
          customer_id: string
          id?: string
          order_id?: string | null
          rating: number
          responded?: boolean | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          updated_at?: string
        }
        Update: {
          anonymous?: boolean | null
          booking_id?: string | null
          cafe_id?: string
          category?: string
          comments?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          rating?: number
          responded?: boolean | null
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_devices: {
        Row: {
          active: boolean
          cafe_id: string
          created_at: string
          device_token: string
          id: string
          label: string | null
          last_seen_at: string | null
          paired_at: string
        }
        Insert: {
          active?: boolean
          cafe_id: string
          created_at?: string
          device_token: string
          id?: string
          label?: string | null
          last_seen_at?: string | null
          paired_at?: string
        }
        Update: {
          active?: boolean
          cafe_id?: string
          created_at?: string
          device_token?: string
          id?: string
          label?: string | null
          last_seen_at?: string | null
          paired_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_devices_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_devices_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_memberships: {
        Row: {
          cafe_id: string
          created_at: string
          customer_user_id: string
          id: string
          last_visit_at: string | null
          loyalty_points: number
          total_visits: number
        }
        Insert: {
          cafe_id: string
          created_at?: string
          customer_user_id: string
          id?: string
          last_visit_at?: string | null
          loyalty_points?: number
          total_visits?: number
        }
        Update: {
          cafe_id?: string
          created_at?: string
          customer_user_id?: string
          id?: string
          last_visit_at?: string | null
          loyalty_points?: number
          total_visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_memberships_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_memberships_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          active: boolean
          cafe_id: string
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["reward_kind"]
          metadata: Json
          required_points: number
          title: string
        }
        Insert: {
          active?: boolean
          cafe_id: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["reward_kind"]
          metadata?: Json
          required_points?: number
          title: string
        }
        Update: {
          active?: boolean
          cafe_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["reward_kind"]
          metadata?: Json
          required_points?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          cafe_id: string
          created_at: string
          customer_user_id: string
          id: string
          note: string | null
          points: number
          related_order_id: string | null
          type: Database["public"]["Enums"]["loyalty_txn_type"]
        }
        Insert: {
          cafe_id: string
          created_at?: string
          customer_user_id: string
          id?: string
          note?: string | null
          points: number
          related_order_id?: string | null
          type?: Database["public"]["Enums"]["loyalty_txn_type"]
        }
        Update: {
          cafe_id?: string
          created_at?: string
          customer_user_id?: string
          id?: string
          note?: string | null
          points?: number
          related_order_id?: string | null
          type?: Database["public"]["Enums"]["loyalty_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean
          cafe_id: string
          category: string
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          tags: string[] | null
        }
        Insert: {
          available?: boolean
          cafe_id: string
          category: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          tags?: string[] | null
        }
        Update: {
          available?: boolean
          cafe_id?: string
          category?: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          cafe_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          owner_user_id: string
          read: boolean
          related_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          cafe_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          owner_user_id: string
          read?: boolean
          related_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          cafe_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          owner_user_id?: string
          read?: boolean
          related_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_alerts: {
        Row: {
          alert_type: string
          cafe_id: string
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
          updated_at: string | null
        }
        Insert: {
          alert_type: string
          cafe_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          title: string
          updated_at?: string | null
        }
        Update: {
          alert_type?: string
          cafe_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_alerts_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_alerts_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          menu_item_id: string | null
          name: string
          order_id: string
          price: number
          quantity: number
        }
        Insert: {
          id?: string
          menu_item_id?: string | null
          name: string
          order_id: string
          price?: number
          quantity?: number
        }
        Update: {
          id?: string
          menu_item_id?: string | null
          name?: string
          order_id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          assigned_staff_id: string | null
          cafe_id: string
          cancellation_requested: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          customer_user_id: string | null
          discount_amount: number
          earned_points: number
          eta_set_by: string | null
          eta_updated_at: string | null
          id: string
          invoice_number: string | null
          modification_reason: string | null
          modified_at: string | null
          modified_by: string | null
          notes: string | null
          original_order_id: string | null
          paid_at: string | null
          paid_collected_by: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          prepared_by: string | null
          preparing_at: string | null
          priority: Database["public"]["Enums"]["order_priority"] | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          ready_at: string | null
          refund_id: string | null
          refund_rejection_reason: string | null
          refund_requested: boolean | null
          refund_workflow_status:
            | Database["public"]["Enums"]["refund_status"]
            | null
          refunded_amount: number | null
          refunded_at: string | null
          refunded_by: string | null
          served_at: string | null
          served_by: string | null
          source: Database["public"]["Enums"]["order_source"]
          split_parent_id: string | null
          split_sequence: number | null
          split_total_count: number | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_no: string | null
          tax_amount: number
          timer_alert_sent: boolean | null
          timer_expected_seconds: number | null
          timer_paused_at: string | null
          timer_started_at: string | null
          timer_total_seconds: number | null
          total_amount: number
          updated_at: string
          wait_eta_minutes: number | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_staff_id?: string | null
          cafe_id: string
          cancellation_requested?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          customer_user_id?: string | null
          discount_amount?: number
          earned_points?: number
          eta_set_by?: string | null
          eta_updated_at?: string | null
          id?: string
          invoice_number?: string | null
          modification_reason?: string | null
          modified_at?: string | null
          modified_by?: string | null
          notes?: string | null
          original_order_id?: string | null
          paid_at?: string | null
          paid_collected_by?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          prepared_by?: string | null
          preparing_at?: string | null
          priority?: Database["public"]["Enums"]["order_priority"] | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          ready_at?: string | null
          refund_id?: string | null
          refund_rejection_reason?: string | null
          refund_requested?: boolean | null
          refund_workflow_status?:
            | Database["public"]["Enums"]["refund_status"]
            | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          served_at?: string | null
          served_by?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          split_parent_id?: string | null
          split_sequence?: number | null
          split_total_count?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_no?: string | null
          tax_amount?: number
          timer_alert_sent?: boolean | null
          timer_expected_seconds?: number | null
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_total_seconds?: number | null
          total_amount?: number
          updated_at?: string
          wait_eta_minutes?: number | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_staff_id?: string | null
          cafe_id?: string
          cancellation_requested?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          discount_amount?: number
          earned_points?: number
          eta_set_by?: string | null
          eta_updated_at?: string | null
          id?: string
          invoice_number?: string | null
          modification_reason?: string | null
          modified_at?: string | null
          modified_by?: string | null
          notes?: string | null
          original_order_id?: string | null
          paid_at?: string | null
          paid_collected_by?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          prepared_by?: string | null
          preparing_at?: string | null
          priority?: Database["public"]["Enums"]["order_priority"] | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          ready_at?: string | null
          refund_id?: string | null
          refund_rejection_reason?: string | null
          refund_requested?: boolean | null
          refund_workflow_status?:
            | Database["public"]["Enums"]["refund_status"]
            | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          served_at?: string | null
          served_by?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          split_parent_id?: string | null
          split_sequence?: number | null
          split_total_count?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_no?: string | null
          tax_amount?: number
          timer_alert_sent?: boolean | null
          timer_expected_seconds?: number | null
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_total_seconds?: number | null
          total_amount?: number
          updated_at?: string
          wait_eta_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_paid_collected_by_fkey"
            columns: ["paid_collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_split_parent_id_fkey"
            columns: ["split_parent_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number | null
          cafe_id: string
          created_at: string
          event: string
          id: string
          method: string | null
          order_id: string
          raw: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          cafe_id: string
          created_at?: string
          event: string
          id?: string
          method?: string | null
          order_id: string
          raw?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          cafe_id?: string
          created_at?: string
          event?: string
          id?: string
          method?: string | null
          order_id?: string
          raw?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birthday: string | null
          cafe_id: string | null
          claimed_at: string | null
          created_at: string
          email: string | null
          favorite_cafes: string[] | null
          full_name: string | null
          id: string
          is_guest: boolean
          notes: string | null
          phone: string | null
          recent_cafes: Json | null
          referral_code: string | null
          referral_count: number | null
          referred_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          tags: string[]
          total_referral_rewards: number | null
          user_id: string
        }
        Insert: {
          birthday?: string | null
          cafe_id?: string | null
          claimed_at?: string | null
          created_at?: string
          email?: string | null
          favorite_cafes?: string[] | null
          full_name?: string | null
          id?: string
          is_guest?: boolean
          notes?: string | null
          phone?: string | null
          recent_cafes?: Json | null
          referral_code?: string | null
          referral_count?: number | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tags?: string[]
          total_referral_rewards?: number | null
          user_id: string
        }
        Update: {
          birthday?: string | null
          cafe_id?: string | null
          claimed_at?: string | null
          created_at?: string
          email?: string | null
          favorite_cafes?: string[] | null
          full_name?: string | null
          id?: string
          is_guest?: boolean
          notes?: string | null
          phone?: string | null
          recent_cafes?: Json | null
          referral_code?: string | null
          referral_count?: number | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tags?: string[]
          total_referral_rewards?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          cafe_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_awarded_at: string | null
          reward_points: number | null
          status: string
        }
        Insert: {
          cafe_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_awarded_at?: string | null
          reward_points?: number | null
          status?: string
        }
        Update: {
          cafe_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_awarded_at?: string | null
          reward_points?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          cafe_id: string
          code: string
          created_at: string
          customer_user_id: string
          id: string
          points_spent: number
          redeemed_at: string | null
          reward_id: string
          reward_title: string
          status: Database["public"]["Enums"]["redemption_status"]
        }
        Insert: {
          cafe_id: string
          code: string
          created_at?: string
          customer_user_id: string
          id?: string
          points_spent: number
          redeemed_at?: string | null
          reward_id: string
          reward_title: string
          status?: Database["public"]["Enums"]["redemption_status"]
        }
        Update: {
          cafe_id?: string
          code?: string
          created_at?: string
          customer_user_id?: string
          id?: string
          points_spent?: number
          redeemed_at?: string | null
          reward_id?: string
          reward_title?: string
          status?: Database["public"]["Enums"]["redemption_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          cafe_id: string | null
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          cafe_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          cafe_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_log_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_audit_log_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      split_bills: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          original_order_id: string
          split_details: Json
          split_order_id: string
          split_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          original_order_id: string
          split_details?: Json
          split_order_id: string
          split_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          original_order_id?: string
          split_details?: Json
          split_order_id?: string
          split_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_bills_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_bills_split_order_id_fkey"
            columns: ["split_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_breaks: {
        Row: {
          cafe_id: string
          created_at: string
          ended_at: string | null
          id: string
          shift_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          cafe_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          shift_id: string
          started_at?: string
          user_id: string
        }
        Update: {
          cafe_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          shift_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_breaks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "staff_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_performance_snapshots: {
        Row: {
          cafe_id: string
          created_at: string | null
          id: string
          metrics: Json
          snapshot_date: string
          staff_id: string
        }
        Insert: {
          cafe_id: string
          created_at?: string | null
          id?: string
          metrics?: Json
          snapshot_date: string
          staff_id: string
        }
        Update: {
          cafe_id?: string
          created_at?: string | null
          id?: string
          metrics?: Json
          snapshot_date?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_performance_snapshots_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_snapshots_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_snapshots_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          cafe_id: string
          clock_in_at: string
          clock_out_at: string | null
          created_at: string
          id: string
          notes: string | null
          total_break_seconds: number
          user_id: string
        }
        Insert: {
          cafe_id: string
          clock_in_at?: string
          clock_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          total_break_seconds?: number
          user_id: string
        }
        Update: {
          cafe_id?: string
          clock_in_at?: string
          clock_out_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          total_break_seconds?: number
          user_id?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          cafe_id: string
          capacity: number
          created_at: string | null
          current_booking_id: string | null
          current_order_id: string | null
          id: string
          location_description: string | null
          notes: string | null
          qr_code_generated_at: string | null
          qr_code_url: string | null
          status: Database["public"]["Enums"]["table_status"] | null
          table_name: string | null
          table_number: string
          updated_at: string | null
        }
        Insert: {
          cafe_id: string
          capacity?: number
          created_at?: string | null
          current_booking_id?: string | null
          current_order_id?: string | null
          id?: string
          location_description?: string | null
          notes?: string | null
          qr_code_generated_at?: string | null
          qr_code_url?: string | null
          status?: Database["public"]["Enums"]["table_status"] | null
          table_name?: string | null
          table_number: string
          updated_at?: string | null
        }
        Update: {
          cafe_id?: string
          capacity?: number
          created_at?: string | null
          current_booking_id?: string | null
          current_order_id?: string | null
          id?: string
          location_description?: string | null
          notes?: string | null
          qr_code_generated_at?: string | null
          qr_code_url?: string | null
          status?: Database["public"]["Enums"]["table_status"] | null
          table_name?: string | null
          table_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_current_booking_id_fkey"
            columns: ["current_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_current_order_id_fkey"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      cafe_daily_metrics: {
        Row: {
          avg_order_value: number | null
          cafe_id: string | null
          cancelled_orders: number | null
          completed_bookings: number | null
          metric_date: string | null
          no_show_bookings: number | null
          successful_payments: number | null
          total_bookings: number | null
          total_orders: number | null
          total_payments: number | null
          total_refund_amount: number | null
          total_refunds: number | null
          total_revenue: number | null
          unique_customers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cafes_public: {
        Row: {
          accept_online_orders: boolean | null
          accept_reservations: boolean | null
          address: string | null
          banner_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          loyalty_enabled: boolean | null
          name: string | null
          opening_hours: Json | null
          seating_capacity: number | null
          sensitive_data_redacted: string | null
          slot_capacity: number | null
          slug: string | null
          sound_alerts_enabled: boolean | null
          state: string | null
          table_ordering_enabled: boolean | null
          timezone: string | null
        }
        Insert: {
          accept_online_orders?: boolean | null
          accept_reservations?: boolean | null
          address?: string | null
          banner_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          name?: string | null
          opening_hours?: Json | null
          seating_capacity?: number | null
          sensitive_data_redacted?: never
          slot_capacity?: number | null
          slug?: string | null
          sound_alerts_enabled?: boolean | null
          state?: string | null
          table_ordering_enabled?: boolean | null
          timezone?: string | null
        }
        Update: {
          accept_online_orders?: boolean | null
          accept_reservations?: boolean | null
          address?: string | null
          banner_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          name?: string | null
          opening_hours?: Json | null
          seating_capacity?: number | null
          sensitive_data_redacted?: never
          slot_capacity?: number | null
          slug?: string | null
          sound_alerts_enabled?: boolean | null
          state?: string | null
          table_ordering_enabled?: boolean | null
          timezone?: string | null
        }
        Relationships: []
      }
      staff_performance_metrics: {
        Row: {
          avg_order_time_minutes: number | null
          bookings_handled: number | null
          cafe_id: string | null
          first_activity: string | null
          full_name: string | null
          last_activity: string | null
          orders_handled: number | null
          role: Database["public"]["Enums"]["app_role"] | null
          total_revenue_handled: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_to_waitlist: {
        Args: {
          _booking_date: string
          _booking_time: string
          _cafe_id: string
          _customer_name: string
          _customer_phone: string
          _customer_user_id: string
          _notes?: string
          _persons: number
          _special_requests?: string
        }
        Returns: string
      }
      advance_order_workflow: {
        Args: {
          _next_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
        }
        Returns: Json
      }
      approve_redemption: {
        Args: { _redemption_id: string }
        Returns: undefined
      }
      approve_redemption_by_code: {
        Args: { _cafe_id: string; _code: string }
        Returns: Json
      }
      can_modify_order: { Args: { order_id: string }; Returns: boolean }
      can_user_act_on: {
        Args: { _action: string; _cafe_id: string; _user_id: string }
        Returns: boolean
      }
      can_work_order_status: {
        Args: {
          _cafe_id: string
          _status: Database["public"]["Enums"]["order_status"]
          _user_id: string
        }
        Returns: boolean
      }
      cancel_order_by_customer: { Args: { _order_id: string }; Returns: Json }
      cancel_order_by_staff: { Args: { _order_id: string }; Returns: undefined }
      check_order_rate_limit: {
        Args: { p_cafe_id: string; p_user_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          _cafe_id: string
          _max_attempts?: number
          _time_window?: string
          _user_id: string
        }
        Returns: boolean
      }
      check_slot_availability: {
        Args: { _cafe_id: string; _date: string; _time: string }
        Returns: Json
      }
      cleanup_old_analytics_data: { Args: never; Returns: number }
      clock_in: { Args: never; Returns: Json }
      clock_out: { Args: { _notes?: string }; Returns: Json }
      close_cash_drawer: {
        Args: {
          _cafe_id: string
          _closing_amount: number
          _notes?: string
          _staff_user_id?: string
        }
        Returns: string
      }
      complete_referral: {
        Args: { cafe_id: string; referral_id: string }
        Returns: Json
      }
      create_booking_atomic:
        | {
            Args: {
              _booking_date: string
              _booking_time: string
              _cafe_id: string
              _customer_name: string
              _customer_phone: string
              _customer_user_id: string
              _notes: string
              _persons: number
            }
            Returns: string
          }
        | {
            Args: {
              p_booking_date: string
              p_booking_time: string
              p_cafe_id: string
              p_customer_name: string
              p_customer_phone: string
              p_customer_user_id: string
              p_notes?: string
              p_persons: number
            }
            Returns: string
          }
      create_operational_alert: {
        Args: {
          _alert_type: string
          _cafe_id: string
          _description?: string
          _metadata?: Json
          _severity: string
          _title: string
        }
        Returns: string
      }
      deny_order_cancellation: {
        Args: { _order_id: string }
        Returns: undefined
      }
      deny_refund_request: {
        Args: { _order_id: string; _reason: string }
        Returns: Json
      }
      discover_cafes: {
        Args: never
        Returns: {
          accept_online_orders: boolean
          accept_reservations: boolean
          city: string
          description: string
          id: string
          logo_url: string
          name: string
          slug: string
          state: string
        }[]
      }
      end_break: { Args: never; Returns: Json }
      export_analytics_data: {
        Args: {
          p_cafe_id: string
          p_end_date?: string
          p_export_type: string
          p_start_date?: string
        }
        Returns: Json
      }
      finalize_order_refund: { Args: { _order_id: string }; Returns: Json }
      generate_referral_code: { Args: { user_id: string }; Returns: string }
      generate_table_qr_code: {
        Args: { cafe_id: string; table_id: string }
        Returns: string
      }
      get_available_tables: {
        Args: {
          _booking_date?: string
          _booking_time?: string
          _cafe_id: string
          _persons: number
        }
        Returns: {
          capacity: number
          location_description: string
          status: Database["public"]["Enums"]["table_status"]
          table_id: string
          table_name: string
          table_number: string
        }[]
      }
      get_booking_analytics_dashboard: {
        Args: { _cafe_id: string; _days_back?: number }
        Returns: {
          average_party_size: number
          cancellation_rate: number
          confirmed_bookings: number
          most_popular_day: string
          no_show_count: number
          peak_hour: string
          repeat_customer_rate: number
          revenue_from_bookings: number
          total_bookings: number
          waitlist_bookings: number
        }[]
      }
      get_cafe_feedback_analytics: {
        Args: { p_cafe_id: string; p_days?: number }
        Returns: {
          average_rating: number
          category_ratings: Json
          rating_distribution: Json
          response_rate: number
          total_feedback: number
        }[]
      }
      get_cafe_public: {
        Args: { p_cafe_id: string }
        Returns: {
          accept_online_orders: boolean | null
          accept_reservations: boolean | null
          address: string | null
          banner_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          loyalty_enabled: boolean | null
          name: string | null
          opening_hours: Json | null
          seating_capacity: number | null
          sensitive_data_redacted: string | null
          slot_capacity: number | null
          slug: string | null
          sound_alerts_enabled: boolean | null
          state: string | null
          table_ordering_enabled: boolean | null
          timezone: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cafes_public"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_cash_drawer_summary: {
        Args: { _cafe_id: string; _date?: string }
        Returns: {
          cash_in: number
          cash_out: number
          closing_balance: number
          discrepancy: number
          expected_balance: number
          opening_balance: number
          total_refunds: number
          total_sales: number
        }[]
      }
      get_customer_analytics: {
        Args: { p_cafe_id: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          avg_order_value: number
          avg_visit_frequency_days: number
          customer_acquisition_channels: Json
          customer_lifetime_value: number
          loyalty_engagement_rate: number
          new_customers: number
          returning_customers: number
          top_customers: Json
          total_customers: number
        }[]
      }
      get_customer_favorites: {
        Args: { p_cafe_id?: string; p_customer_id: string }
        Returns: {
          added_at: string
          category: string
          favorite_id: string
          item_description: string
          item_image_url: string
          item_name: string
          item_price: number
          menu_item_id: string
          notes: string
        }[]
      }
      get_financial_analytics: {
        Args: { p_cafe_id: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          average_daily_revenue: number
          daily_revenue_trend: Json
          gross_margin: number
          gross_profit: number
          payment_methods: Json
          period_end: string
          period_start: string
          refund_rate: number
          revenue_by_category: Json
          total_cogs: number
          total_revenue: number
        }[]
      }
      get_live_ops_board: { Args: { _cafe_id: string }; Returns: Json }
      get_my_staff_stats: { Args: { _days?: number }; Returns: Json }
      get_operational_analytics: {
        Args: { p_cafe_id: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          avg_order_value: number
          avg_preparation_time_minutes: number
          customer_retention_rate: number
          order_cancellation_rate: number
          peak_hours: Json
          period_end: string
          period_start: string
          popular_items: Json
          staff_efficiency: Json
          table_turnover_rate: number
          total_orders: number
          total_revenue: number
        }[]
      }
      get_order_timer_status: {
        Args: { order_id: string }
        Returns: {
          elapsed_seconds: number
          expected_seconds: number
          is_paused: boolean
          is_running: boolean
          should_alert: boolean
        }[]
      }
      get_owner_analytics: {
        Args: { _cafe_id: string; _end: string; _start: string }
        Returns: Json
      }
      get_payments_dashboard: {
        Args: { _cafe_id: string; _end: string; _start: string }
        Returns: Json
      }
      get_public_cafe_info: {
        Args: { cafe_id: string }
        Returns: {
          accept_online_orders: boolean
          accept_reservations: boolean
          banner_url: string
          city: string
          country: string
          description: string
          id: string
          logo_url: string
          loyalty_enabled: boolean
          name: string
          opening_hours: Json
          seating_capacity: number
          slot_capacity: number
          slug: string
          state: string
          table_ordering_enabled: boolean
          tax_rate: number
        }[]
      }
      get_realtime_metrics: {
        Args: { p_cafe_id: string }
        Returns: {
          active_tables: number
          avg_wait_time_minutes: number
          current_hour_orders: number
          current_hour_revenue: number
          pending_orders: number
          preparing_orders: number
          today_orders: number
          today_revenue: number
          waiting_customers: number
        }[]
      }
      get_staff_leaderboard: {
        Args: { cafe_id: string; period_days?: number }
        Returns: {
          average_preparation_time_seconds: number
          customer_satisfaction_rating: number
          orders_processed: number
          rank: number
          role: string
          staff_id: string
          staff_name: string
        }[]
      }
      get_staff_performance: {
        Args: { _cafe_id: string; _days?: number }
        Returns: Json
      }
      get_staff_shifts: {
        Args: { _cafe_id: string; _days?: number }
        Returns: Json
      }
      get_waitlist_analytics: {
        Args: { _cafe_id: string; _end_date?: string; _start_date?: string }
        Returns: {
          average_party_size: number
          average_wait_time_minutes: number
          most_common_party_size: number
          peak_waitlist_time: string
          promotion_rate: number
          total_waitlist_bookings: number
        }[]
      }
      has_cafe_staff_role: {
        Args: {
          _cafe_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initiate_refund_request: { Args: { _order_id: string }; Returns: Json }
      is_active_cafe_staff: {
        Args: { _cafe_id: string; _user_id: string }
        Returns: boolean
      }
      is_cafe_owner: {
        Args: { _cafe_id: string; _user_id: string }
        Returns: boolean
      }
      is_on_shift: {
        Args: { _cafe_id: string; _user_id: string }
        Returns: boolean
      }
      join_staff_with_code: {
        Args: { _code: string; _full_name?: string }
        Returns: Json
      }
      kds_act_on_order: {
        Args: {
          _action: string
          _eta_minutes?: number
          _order_id: string
          _token: string
        }
        Returns: Json
      }
      kds_get_orders: { Args: { _token: string }; Returns: Json }
      kds_pair_device: {
        Args: { _cafe_id: string; _code: string; _label: string; _pin: string }
        Returns: Json
      }
      kds_pair_device_v2: {
        Args: { _code?: string; _label?: string; _pin?: string; _slug?: string }
        Returns: Json
      }
      kds_set_credentials: {
        Args: { _cafe_id: string; _new_code: string; _new_pin: string }
        Returns: Json
      }
      log_security_event: {
        Args: {
          p_details?: Json
          p_event_type: string
          p_ip_address?: unknown
          p_user_agent?: string
        }
        Returns: undefined
      }
      manager_reassign_order: {
        Args: { _new_assignee: string; _order_id: string }
        Returns: Json
      }
      mark_order_paid: { Args: { _order_id: string }; Returns: Json }
      merge_guest_into_user: {
        Args: { _email: string; _new_user_id: string; _phone: string }
        Returns: number
      }
      modify_order: {
        Args: {
          modification_reason?: string
          modified_by_user_id?: string
          new_items: Json
          order_id: string
        }
        Returns: string
      }
      onboard_new_cafe: {
        Args: {
          _city: string
          _description: string
          _name: string
          _slug: string
        }
        Returns: string
      }
      open_cash_drawer: {
        Args: {
          _cafe_id: string
          _notes?: string
          _opening_amount: number
          _staff_user_id?: string
        }
        Returns: string
      }
      owns_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      pause_order_timer: { Args: { order_id: string }; Returns: undefined }
      place_order: {
        Args: {
          p_cafe_id: string
          p_items: Json
          p_notes?: string
          p_payment_method?: string
          p_table_no?: string
        }
        Returns: string
      }
      place_order_and_update_loyalty: {
        Args: {
          _cafe_id: string
          _customer_name: string
          _customer_phone: string
          _customer_user_id: string
          _items: Json
          _notes: string
          _source: Database["public"]["Enums"]["order_source"]
          _table_no: string
        }
        Returns: Json
      }
      process_order_refund: { Args: { _order_id: string }; Returns: Json }
      promote_waitlist_booking: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      record_payment_capture:
        | {
            Args: {
              _method: string
              _order_id: string
              _rzp_order_id: string
              _rzp_payment_id: string
              _rzp_signature: string
            }
            Returns: Json
          }
        | {
            Args: {
              _method: string
              _order_id: string
              _paid_amount_paise?: number
              _rzp_order_id: string
              _rzp_payment_id: string
              _rzp_signature: string
            }
            Returns: Json
          }
      record_payment_refund: {
        Args: { _amount: number; _order_id: string; _refund_id: string }
        Returns: Json
      }
      record_staff_performance_snapshot: {
        Args: { cafe_id: string; staff_id: string }
        Returns: Json
      }
      redeem_reward: { Args: { _reward_id: string }; Returns: Json }
      refresh_cafe_daily_metrics: { Args: never; Returns: undefined }
      refund_order: { Args: { _order_id: string }; Returns: undefined }
      request_order_refund: { Args: { _order_id: string }; Returns: undefined }
      resolve_operational_alert: {
        Args: { _alert_id: string; _resolved_by?: string }
        Returns: boolean
      }
      resume_order_timer: { Args: { order_id: string }; Returns: undefined }
      role_on_shift_count: {
        Args: {
          _cafe_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: number
      }
      send_booking_reminder: {
        Args: { _booking_id: string; _reminder_type?: string }
        Returns: boolean
      }
      set_order_eta: {
        Args: { _minutes: number; _order_id: string }
        Returns: Json
      }
      set_payment_method: {
        Args: { _method: string; _order_id: string }
        Returns: undefined
      }
      simulate_payment: {
        Args: { _order_id: string; _outcome: string }
        Returns: Json
      }
      split_bill: {
        Args: {
          order_id: string
          split_details: Json
          split_type: string
          user_id: string
        }
        Returns: string
      }
      split_order: {
        Args: { order_id: string; split_instructions: Json }
        Returns: string[]
      }
      start_break: { Args: never; Returns: Json }
      start_order_timer: {
        Args: { expected_minutes?: number; order_id: string }
        Returns: undefined
      }
      update_table_status: {
        Args: {
          _booking_id?: string
          _order_id?: string
          _status: Database["public"]["Enums"]["table_status"]
          _table_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "customer"
        | "manager"
        | "cashier"
        | "chef"
        | "waiter"
        | "runner"
      booking_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "no_show"
        | "cancelled"
        | "completed"
      loyalty_txn_type: "earned" | "redeemed" | "manual"
      notification_kind:
        | "new_order"
        | "new_booking"
        | "new_customer"
        | "reward_redeemed"
        | "order_update"
        | "info"
      order_priority: "low" | "normal" | "high" | "vip"
      order_source: "qr" | "app" | "walk_in" | "table"
      order_status:
        | "placed"
        | "accepted"
        | "preparing"
        | "ready"
        | "served"
        | "completed"
        | "delivered"
        | "cancelled"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      redemption_status: "pending" | "redeemed" | "cancelled"
      refund_status: "none" | "requested" | "refunded" | "rejected"
      reward_kind: "points" | "visits" | "birthday" | "referral"
      table_status:
        | "available"
        | "occupied"
        | "reserved"
        | "cleaning"
        | "out_of_service"
      waitlist_status: "active" | "promoted" | "cancelled" | "expired"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "owner",
        "customer",
        "manager",
        "cashier",
        "chef",
        "waiter",
        "runner",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "checked_in",
        "no_show",
        "cancelled",
        "completed",
      ],
      loyalty_txn_type: ["earned", "redeemed", "manual"],
      notification_kind: [
        "new_order",
        "new_booking",
        "new_customer",
        "reward_redeemed",
        "order_update",
        "info",
      ],
      order_priority: ["low", "normal", "high", "vip"],
      order_source: ["qr", "app", "walk_in", "table"],
      order_status: [
        "placed",
        "accepted",
        "preparing",
        "ready",
        "served",
        "completed",
        "delivered",
        "cancelled",
      ],
      payment_status: ["pending", "paid", "failed", "refunded"],
      redemption_status: ["pending", "redeemed", "cancelled"],
      refund_status: ["none", "requested", "refunded", "rejected"],
      reward_kind: ["points", "visits", "birthday", "referral"],
      table_status: [
        "available",
        "occupied",
        "reserved",
        "cleaning",
        "out_of_service",
      ],
      waitlist_status: ["active", "promoted", "cancelled", "expired"],
    },
  },
} as const
<claude-code-hint v="1" type="plugin" value="supabase@claude-plugins-official" />
