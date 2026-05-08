/**
 * bookingService — booking creation with slot capacity, opening-hours
 * validation, and duplicate guard.
 */
import { supabase } from "@/integrations/supabase/client";

export type CreateBookingInput = {
  cafeId: string;
  customerUserId: string;
  customerName: string;
  customerPhone?: string | null;
  date: string;
  time: string;
  persons: number;
  notes?: string | null;
};

type DayHours = { open: string; close: string; closed?: boolean };
type OpeningHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function timeInRange(t: string, open: string, close: string) {
  // Compare HH:mm strings lexicographically (works since fixed width).
  return t >= open && t <= close;
}

export function validateAgainstOpeningHours(
  date: string,
  time: string,
  hours: OpeningHours | null | undefined,
): string | null {
  if (!hours || Object.keys(hours).length === 0) return null; // no hours configured → allow
  const day = DAY_KEYS[new Date(`${date}T00:00:00`).getDay()];
  const cfg = hours[day];
  if (!cfg || cfg.closed) return "The cafe is closed on the selected day.";
  if (!cfg.open || !cfg.close) return null;
  if (!timeInRange(time, cfg.open, cfg.close)) {
    return `Please pick a time between ${cfg.open} and ${cfg.close}.`;
  }
  return null;
}

export async function createBooking(input: CreateBookingInput) {
  if (!input.date || !input.time) throw new Error("Pick a date and time");
  if (input.persons < 1 || input.persons > 50) throw new Error("Invalid party size");

  const bookingDateTime = new Date(`${input.date}T${input.time}`);
  if (Number.isNaN(bookingDateTime.getTime())) throw new Error("Invalid date / time");
  if (bookingDateTime.getTime() < Date.now() - 60_000) throw new Error("Pick a future time");

  const { data: cafe } = await supabase
    .from("cafes")
    .select("slot_capacity, accept_reservations, opening_hours")
    .eq("id", input.cafeId)
    .maybeSingle();
  if (cafe && cafe.accept_reservations === false) {
    throw new Error("This cafe is not accepting reservations right now");
  }
  const oh = cafe?.opening_hours as OpeningHours | null | undefined;
  const ohErr = validateAgainstOpeningHours(input.date, input.time, oh);
  if (ohErr) throw new Error(ohErr);

  // Use the atomic booking function to prevent race conditions
  const { data: bookingId, error } = await supabase.rpc("create_booking_atomic", {
    _cafe_id: input.cafeId,
    _customer_user_id: input.customerUserId,
    _customer_name: input.customerName,
    _customer_phone: input.customerPhone ?? null,
    _booking_date: input.date,
    _booking_time: input.time,
    _persons: input.persons,
    _notes: input.notes ?? null
  });

  if (error) {
    // Map common error messages to user-friendly ones
    if (error.message.includes('fully booked')) {
      throw new Error("This time slot is fully booked. Please pick another.");
    }
    if (error.message.includes('already have a booking')) {
      throw new Error("You already have a booking for this slot.");
    }
    if (error.message.includes('Invalid party size')) {
      throw new Error("Invalid party size");
    }
    throw error;
  }

  // Return the booking ID in the same format as before
  return { id: bookingId };
}
