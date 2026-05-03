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

  // Server-authoritative slot availability check.
  const { data: avail, error: availErr } = await supabase.rpc("check_slot_availability", {
    _cafe_id: input.cafeId,
    _date: input.date,
    _time: input.time,
  });
  if (availErr) throw availErr;
  const a = avail as { capacity: number; taken: number; remaining: number };
  if (a.remaining < input.persons) {
    throw new Error("This time slot is fully booked. Please pick another.");
  }

  // Duplicate guard for same customer.
  const { data: existing } = await supabase
    .from("bookings")
    .select("id")
    .eq("cafe_id", input.cafeId)
    .eq("booking_date", input.date)
    .eq("booking_time", input.time)
    .eq("customer_user_id", input.customerUserId)
    .neq("status", "cancelled");
  if ((existing ?? []).length > 0) {
    throw new Error("You already have a booking for this slot.");
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      cafe_id: input.cafeId,
      customer_user_id: input.customerUserId,
      customer_name: input.customerName,
      customer_phone: input.customerPhone ?? null,
      booking_date: input.date,
      booking_time: input.time,
      persons: input.persons,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}
