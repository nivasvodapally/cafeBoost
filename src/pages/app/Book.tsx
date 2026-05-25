import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CalendarCheck, AlertCircle, Clock, Users } from "lucide-react";
import { useActiveCafe } from "@/lib/cafeContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { createBooking, validateAgainstOpeningHours } from "@/services/bookingService";
import { WaitlistService } from "@/services/waitlistService";
import { supabase } from "@/integrations/supabase/client";

const TIMES = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"];

export default function CustomerBook() {
  const cafe = useActiveCafe();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("19:00");
  const [persons, setPersons] = useState(2);
  const [notes, setNotes] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [bookingType, setBookingType] = useState<"confirmed" | "waitlist">("confirmed");
  const [openingHours, setOpeningHours] = useState<Record<string, { open: string; close: string; closed?: boolean }> | null>(null);
  const [slotInfo, setSlotInfo] = useState<{ remaining: number; capacity: number } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Load cafe opening hours once.
  useEffect(() => {
    if (!cafe) return;
    void supabase.from("cafes").select("opening_hours").eq("id", cafe.id).maybeSingle()
      .then(({ data }) => setOpeningHours((data?.opening_hours as typeof openingHours) ?? null))
      .catch((err) => console.error("Failed to load opening hours:", err));
  }, [cafe]);

  // Live availability check on date/time change.
  useEffect(() => {
    if (!cafe || !date || !time) return;
    const ohErr = validateAgainstOpeningHours(date, time, openingHours);
    if (ohErr) { setInlineError(ohErr); setSlotInfo(null); return; }
    setInlineError(null);
    void supabase.rpc("check_slot_availability", { _cafe_id: cafe.id, _date: date, _time: time })
      .then(({ data }) => {
        if (!data) return;
        const a = data as { remaining: number; capacity: number; taken: number };
        setSlotInfo({ remaining: a.remaining, capacity: a.capacity });
      })
      .catch((err) => console.error("Failed to check slot availability:", err));
  }, [cafe, date, time, openingHours]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cafe) return;
    if (!user) {
      navigate(`/auth?mode=signup&returnTo=${encodeURIComponent("/app/book")}`);
      return;
    }
    if (inlineError) { toast.error(inlineError); return; }
    const customerName = (name || profile?.full_name || user.email || "Customer").trim();
    setSaving(true);
    try {
      if (bookingType === "confirmed") {
        await createBooking({
          cafeId: cafe.id,
          customerUserId: user.id,
          customerName,
          customerPhone: (phone || profile?.phone || "").trim() || null,
          date, time, persons,
          notes: notes.trim() || null,
        });
        toast.success("Booking requested!");
      } else {
        // Join waitlist
        const bookingId = await WaitlistService.joinWaitlist({
          cafeId: cafe.id,
          customerUserId: user.id,
          customerName,
          customerPhone: (phone || profile?.phone || "").trim() || null,
          bookingDate: date,
          bookingTime: time,
          persons,
          notes: notes.trim() || null,
          specialRequests: specialRequests.trim() || null,
        });
        toast.success("Added to waitlist! You'll be notified when a table becomes available.");
      }
      setDone(true);
      setNotes("");
      setSpecialRequests("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not book");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const isWaitlist = bookingType === "waitlist";
    return (
      <CustomerLayout title="Book a table" subtitle={cafe?.name}>
        <Card className="p-8 text-center">
          {isWaitlist ? (
            <Clock className="w-12 h-12 text-warning mx-auto mb-4" />
          ) : (
            <CalendarCheck className="w-12 h-12 text-success mx-auto mb-4" />
          )}
          <p className="font-display text-2xl font-bold">
            {isWaitlist ? "Added to Waitlist!" : "Booking received!"}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {isWaitlist
              ? "You'll be notified when a table becomes available. Check your bookings page for updates."
              : `${cafe?.name} will confirm shortly.`}
          </p>
          <div className="flex gap-2 justify-center mt-6">
            <Button variant="outline" onClick={() => setDone(false)}>New booking</Button>
          </div>
        </Card>
      </CustomerLayout>
    );
  }

  const slotFull = slotInfo && slotInfo.remaining < persons;
  const blocked = Boolean(inlineError || slotFull);

  return (
    <CustomerLayout title="Book a table" subtitle={cafe?.name}>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Your name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required maxLength={80} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 234 567 8900" maxLength={40} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Date *</Label><Input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="space-y-2">
              <Label>Time *</Label>
              <select value={time} onChange={e => setTime(e.target.value)} required className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                {TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2"><Label>Number of people *</Label><Input type="number" min={1} max={50} value={persons} onChange={e => setPersons(parseInt(e.target.value) || 1)} required /></div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="General notes…" maxLength={500} />
          </div>
          
          <div className="space-y-2">
            <Label>Special Requests (for waitlist)</Label>
            <Input value={specialRequests} onChange={e => setSpecialRequests(e.target.value)} placeholder="Any special requirements, allergies, etc." maxLength={500} />
          </div>

          {/* Booking type selection */}
          <div className="space-y-3">
            <Label>Booking Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={bookingType === "confirmed" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setBookingType("confirmed")}
              >
                <CalendarCheck className="w-4 h-4 mr-2" />
                Regular Booking
              </Button>
              <Button
                type="button"
                variant={bookingType === "waitlist" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setBookingType("waitlist")}
              >
                <Clock className="w-4 h-4 mr-2" />
                Join Waitlist
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {bookingType === "confirmed"
                ? "Book immediately if seats are available."
                : "Join waitlist if no seats available. You'll be notified when a table opens."}
            </p>
          </div>

          {inlineError && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {inlineError}
            </div>
          )}
          
          {!inlineError && slotFull && (
            <div className="flex items-start gap-2 text-sm text-warning bg-warning/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              Only {slotInfo!.remaining} seats left at this time.
              {bookingType === "confirmed"
                ? " Please pick another slot or reduce party size."
                : " You can still join the waitlist."}
            </div>
          )}
          
          {!blocked && slotInfo && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{slotInfo.remaining} of {slotInfo.capacity} seats available at this time.</span>
            </div>
          )}

          <Button
            type="submit"
            variant="hero"
            size="lg"
            className="w-full"
            disabled={saving || (bookingType === "confirmed" && blocked)}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : bookingType === "confirmed" ? (
              "Request Booking"
            ) : (
              "Join Waitlist"
            )}
          </Button>
        </form>
      </Card>

      </CustomerLayout>
  );
}
