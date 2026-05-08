/**
 * waitlistService — waitlist management for bookings
 * Provides functions to join waitlist, promote from waitlist, get analytics
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type WaitlistBookingInput = {
  cafeId: string;
  customerUserId: string;
  customerName: string;
  customerPhone?: string | null;
  bookingDate: string;
  bookingTime: string;
  persons: number;
  notes?: string | null;
  specialRequests?: string | null;
};

export type WaitlistAnalytics = {
  total_waitlist: number;
  active_waitlist: number;
  avg_wait_time_minutes: number;
  promoted_today: number;
  estimated_wait_times: Array<{
    time_slot: string;
    avg_wait_minutes: number;
    waitlist_count: number;
  }>;
};

export type BookingAnalyticsDashboard = {
  total_bookings: number;
  confirmed_bookings: number;
  waitlist_bookings: number;
  no_show_rate: number;
  average_party_size: number;
  peak_hours: Array<{
    hour: string;
    booking_count: number;
  }>;
  frequent_customers: Array<{
    customer_name: string;
    total_visits: number;
    average_spend: number | null;
  }>;
};

export class WaitlistService {
  /**
   * Add a booking to the waitlist
   */
  static async joinWaitlist(input: WaitlistBookingInput): Promise<string> {
    if (!input.bookingDate || !input.bookingTime) {
      throw new Error("Pick a date and time");
    }
    if (input.persons < 1 || input.persons > 50) {
      throw new Error("Invalid party size");
    }

    const bookingDateTime = new Date(`${input.bookingDate}T${input.bookingTime}`);
    if (Number.isNaN(bookingDateTime.getTime())) {
      throw new Error("Invalid date / time");
    }
    if (bookingDateTime.getTime() < Date.now() - 60_000) {
      throw new Error("Pick a future time");
    }

    const { data: cafe } = await supabase
      .from("cafes")
      .select("accept_reservations, opening_hours")
      .eq("id", input.cafeId)
      .maybeSingle();

    if (cafe && cafe.accept_reservations === false) {
      throw new Error("This cafe is not accepting reservations right now");
    }

    // Use the add_to_waitlist function
    const { data: bookingId, error } = await supabase.rpc("add_to_waitlist", {
      _cafe_id: input.cafeId,
      _customer_user_id: input.customerUserId,
      _customer_name: input.customerName,
      _customer_phone: input.customerPhone ?? null,
      _booking_date: input.bookingDate,
      _booking_time: input.bookingTime,
      _persons: input.persons,
      _notes: input.notes ?? null,
      _special_requests: input.specialRequests ?? null,
    });

    if (error) {
      // Map common error messages to user-friendly ones
      if (error.message.includes('already have a booking')) {
        throw new Error("You already have a booking for this slot.");
      }
      if (error.message.includes('Invalid party size')) {
        throw new Error("Invalid party size");
      }
      throw error;
    }

    return bookingId;
  }

  /**
   * Promote a waitlist booking to confirmed status
   */
  static async promoteFromWaitlist(bookingId: string): Promise<void> {
    const { error } = await supabase.rpc("promote_waitlist_booking", {
      _booking_id: bookingId,
    });

    if (error) {
      if (error.message.includes('not found')) {
        throw new Error("Booking not found");
      }
      if (error.message.includes('not in waitlist')) {
        throw new Error("Booking is not in waitlist");
      }
      throw error;
    }
  }

  /**
   * Get waitlist analytics for a cafe
   */
  static async getWaitlistAnalytics(cafeId: string): Promise<WaitlistAnalytics> {
    const { data, error } = await supabase.rpc("get_waitlist_analytics", {
      _cafe_id: cafeId,
    });

    if (error) {
      console.error("Error fetching waitlist analytics:", error);
      throw error;
    }

    return data || {
      total_waitlist: 0,
      active_waitlist: 0,
      avg_wait_time_minutes: 0,
      promoted_today: 0,
      estimated_wait_times: [],
    };
  }

  /**
   * Get booking analytics dashboard for a cafe
   */
  static async getBookingAnalyticsDashboard(cafeId: string): Promise<BookingAnalyticsDashboard> {
    const { data, error } = await supabase.rpc("get_booking_analytics_dashboard", {
      _cafe_id: cafeId,
    });

    if (error) {
      console.error("Error fetching booking analytics:", error);
      throw error;
    }

    return data || {
      total_bookings: 0,
      confirmed_bookings: 0,
      waitlist_bookings: 0,
      no_show_rate: 0,
      average_party_size: 0,
      peak_hours: [],
      frequent_customers: [],
    };
  }

  /**
   * Send in-app booking reminder (creates notification instead of SMS)
   */
  static async sendBookingReminder(bookingId: string): Promise<void> {
    const { error } = await supabase.rpc("send_booking_reminder", {
      _booking_id: bookingId,
    });

    if (error) {
      console.error("Error sending booking reminder:", error);
      throw error;
    }
  }

  /**
   * Get active waitlist for a cafe
   */
  static async getActiveWaitlist(cafeId: string) {
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        profiles:customer_user_id (
          full_name,
          phone
        )
      `)
      .eq("cafe_id", cafeId)
      .eq("waitlist_status", "active")
      .order("waitlist_position", { ascending: true });

    if (error) {
      console.error("Error fetching active waitlist:", error);
      throw error;
    }

    return data || [];
  }

  /**
   * Update waitlist position and estimated wait time
   */
  static async updateWaitlistPosition(
    bookingId: string,
    position: number,
    estimatedWaitMinutes: number
  ): Promise<void> {
    const { error } = await supabase
      .from("bookings")
      .update({
        waitlist_position: position,
        estimated_wait_time_minutes: estimatedWaitMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) {
      console.error("Error updating waitlist position:", error);
      throw error;
    }
  }

  /**
   * Cancel a waitlist booking
   */
  static async cancelWaitlistBooking(bookingId: string): Promise<void> {
    const { error } = await supabase
      .from("bookings")
      .update({
        waitlist_status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (error) {
      console.error("Error cancelling waitlist booking:", error);
      throw error;
    }
  }

  /**
   * Get customer's waitlist position
   */
  static async getCustomerWaitlistPosition(
    cafeId: string,
    customerUserId: string
  ): Promise<{ position: number; estimatedWaitMinutes: number } | null> {
    const { data, error } = await supabase
      .from("bookings")
      .select("waitlist_position, estimated_wait_time_minutes")
      .eq("cafe_id", cafeId)
      .eq("customer_user_id", customerUserId)
      .eq("waitlist_status", "active")
      .maybeSingle();

    if (error) {
      console.error("Error fetching customer waitlist position:", error);
      throw error;
    }

    if (!data) return null;

    return {
      position: data.waitlist_position || 0,
      estimatedWaitMinutes: data.estimated_wait_time_minutes || 0,
    };
  }
}