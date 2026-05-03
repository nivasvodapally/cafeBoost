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
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          booking_time: string
          cafe_id: string
          checked_in_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          customer_user_id: string | null
          id: string
          notes: string | null
          persons: number
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          booking_date: string
          booking_time: string
          cafe_id: string
          checked_in_at?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          customer_user_id?: string | null
          id?: string
          notes?: string | null
          persons?: number
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          booking_date?: string
          booking_time?: string
          cafe_id?: string
          checked_in_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          id?: string
          notes?: string | null
          persons?: number
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
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
          banner_url: string | null
          city: string | null
          country: string | null
          created_at: string
          currency: string | null
          description: string | null
          email: string | null
          eta_presets: number[]
          id: string
          kds_pairing_code: string | null
          kds_pairing_code_set_at: string | null
          kds_pin_hash: string | null
          logo_url: string | null
          loyalty_enabled: boolean | null
          name: string
          onboarding_completed: boolean | null
          opening_hours: Json | null
          owner_user_id: string | null
          phone: string | null
          points_per_currency: number
          razorpay_mode: string
          seating_capacity: number | null
          slot_capacity: number
          slug: string
          sound_alerts_enabled: boolean
          state: string | null
          stuck_kitchen_minutes: number
          stuck_ready_minutes: number
          stuck_unaccepted_minutes: number
          table_ordering_enabled: boolean
          tax_rate: number
          timezone: string | null
        }
        Insert: {
          accept_online_orders?: boolean | null
          accept_reservations?: boolean | null
          address?: string | null
          allow_payment_simulation?: boolean
          banner_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          email?: string | null
          eta_presets?: number[]
          id?: string
          kds_pairing_code?: string | null
          kds_pairing_code_set_at?: string | null
          kds_pin_hash?: string | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          name: string
          onboarding_completed?: boolean | null
          opening_hours?: Json | null
          owner_user_id?: string | null
          phone?: string | null
          points_per_currency?: number
          razorpay_mode?: string
          seating_capacity?: number | null
          slot_capacity?: number
          slug: string
          sound_alerts_enabled?: boolean
          state?: string | null
          stuck_kitchen_minutes?: number
          stuck_ready_minutes?: number
          stuck_unaccepted_minutes?: number
          table_ordering_enabled?: boolean
          tax_rate?: number
          timezone?: string | null
        }
        Update: {
          accept_online_orders?: boolean | null
          accept_reservations?: boolean | null
          address?: string | null
          allow_payment_simulation?: boolean
          banner_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          email?: string | null
          eta_presets?: number[]
          id?: string
          kds_pairing_code?: string | null
          kds_pairing_code_set_at?: string | null
          kds_pin_hash?: string | null
          logo_url?: string | null
          loyalty_enabled?: boolean | null
          name?: string
          onboarding_completed?: boolean | null
          opening_hours?: Json | null
          owner_user_id?: string | null
          phone?: string | null
          points_per_currency?: number
          razorpay_mode?: string
          seating_capacity?: number | null
          slot_capacity?: number
          slug?: string
          sound_alerts_enabled?: boolean
          state?: string | null
          stuck_kitchen_minutes?: number
          stuck_ready_minutes?: number
          stuck_unaccepted_minutes?: number
          table_ordering_enabled?: boolean
          tax_rate?: number
          timezone?: string | null
        }
        Relationships: []
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
          completed_at: string | null
          completed_by: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          customer_user_id: string | null
          earned_points: number
          eta_set_by: string | null
          eta_updated_at: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          prepared_by: string | null
          preparing_at: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          ready_at: string | null
          refund_id: string | null
          refunded_amount: number | null
          refunded_at: string | null
          served_at: string | null
          served_by: string | null
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_no: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
          wait_eta_minutes: number | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_staff_id?: string | null
          cafe_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          customer_user_id?: string | null
          earned_points?: number
          eta_set_by?: string | null
          eta_updated_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          prepared_by?: string | null
          preparing_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          ready_at?: string | null
          refund_id?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          served_at?: string | null
          served_by?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_no?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          wait_eta_minutes?: number | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_staff_id?: string | null
          cafe_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          earned_points?: number
          eta_set_by?: string | null
          eta_updated_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          prepared_by?: string | null
          preparing_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          ready_at?: string | null
          refund_id?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          served_at?: string | null
          served_by?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_no?: string | null
          tax_amount?: number
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
          role: Database["public"]["Enums"]["app_role"]
          tags: string[]
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
          role?: Database["public"]["Enums"]["app_role"]
          tags?: string[]
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
          role?: Database["public"]["Enums"]["app_role"]
          tags?: string[]
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
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
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
      [_ in never]: never
    }
    Functions: {
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
      cancel_order_by_staff: { Args: { _order_id: string }; Returns: undefined }
      check_slot_availability: {
        Args: { _cafe_id: string; _date: string; _time: string }
        Returns: Json
      }
      clock_in: { Args: never; Returns: Json }
      clock_out: { Args: { _notes?: string }; Returns: Json }
      end_break: { Args: never; Returns: Json }
      get_live_ops_board: { Args: { _cafe_id: string }; Returns: Json }
      get_my_staff_stats: { Args: { _days?: number }; Returns: Json }
      get_owner_analytics: {
        Args: { _cafe_id: string; _end: string; _start: string }
        Returns: Json
      }
      get_payments_dashboard: {
        Args: { _cafe_id: string; _end: string; _start: string }
        Returns: Json
      }
      get_staff_performance: {
        Args: { _cafe_id: string; _days?: number }
        Returns: Json
      }
      get_staff_shifts: {
        Args: { _cafe_id: string; _days?: number }
        Returns: Json
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
      manager_reassign_order: {
        Args: { _new_assignee: string; _order_id: string }
        Returns: Json
      }
      mark_order_paid: { Args: { _order_id: string }; Returns: Json }
      merge_guest_into_user: {
        Args: { _email: string; _new_user_id: string; _phone: string }
        Returns: number
      }
      owns_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
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
      record_payment_capture: {
        Args: {
          _method: string
          _order_id: string
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
      redeem_reward: { Args: { _reward_id: string }; Returns: Json }
      refund_order: { Args: { _order_id: string }; Returns: undefined }
      role_on_shift_count: {
        Args: {
          _cafe_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: number
      }
      set_order_eta: {
        Args: { _minutes: number; _order_id: string }
        Returns: Json
      }
      simulate_payment: {
        Args: { _order_id: string; _outcome: string }
        Returns: Json
      }
      start_break: { Args: never; Returns: Json }
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
      reward_kind: "points" | "visits" | "birthday" | "referral"
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
      reward_kind: ["points", "visits", "birthday", "referral"],
    },
  },
} as const
