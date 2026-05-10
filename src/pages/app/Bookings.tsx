import { useEffect, useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, MapPin, Users, Clock, CalendarCheck, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

type Booking = {
  id: string;
  cafe_id: string;
  booking_date: string;
  booking_time: string;
  persons: number;
  status: 'pending' | 'confirmed' | 'checked_in' | 'no_show' | 'cancelled' | 'completed';
  notes: string | null;
  table_no: string | null;
  cafe: { name: string; address: string | null };
};

export default function CustomerBookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Guest: show prompt to sign in
  if (!user) {
    return (
      <CustomerLayout title="My Bookings" subtitle="Manage your table reservations">
        <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-border px-6">
          <CalendarCheck className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-xl font-display font-bold">Sign in to view bookings</h3>
          <p className="text-muted-foreground mt-2 mb-6">Book tables and manage your reservations.</p>
          <Button onClick={() => navigate("/auth?mode=signin&returnTo=/app/bookings")}>Sign in</Button>
        </div>
      </CustomerLayout>
    );
  }

  useEffect(() => {
    if (!user) return;
    const fetchBookings = async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, cafe:cafes(name, address)")
        .eq("customer_user_id", user.id)
        .order("booking_date", { ascending: false });

      if (error) {
        console.error("Error fetching bookings:", error);
      } else {
        setBookings(data as unknown as Booking[]);
      }
      setLoading(false);
    };

    fetchBookings();
  }, [user]);

  const getStatusColor = (status: Booking['status']) => {
    switch (status) {
      case 'confirmed': return 'bg-success/15 text-success border-success/20';
      case 'pending': return 'bg-amber-500/15 text-amber-700 border-amber-500/20';
      case 'cancelled':
      case 'no_show': return 'bg-destructive/15 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <CustomerLayout title="My Bookings" subtitle="Manage your table reservations">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : bookings.length === 0 ? (
        <Card className="p-12 text-center">
          <CalendarCheck className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-xl font-display font-bold">No bookings yet</h3>
          <p className="text-muted-foreground mt-2 mb-6">You haven't made any table reservations yet.</p>
          <Button onClick={() => navigate("/discover")}>Discover Cafes</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => (
            <Card key={b.id} className="p-5 overflow-hidden border-l-4 border-l-accent">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-lg">{b.cafe.name}</h4>
                    <Badge variant="outline" className={`capitalize ${getStatusColor(b.status)}`}>
                      {b.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(b.booking_date).toLocaleDateString()}</div>
                    <div className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {b.booking_time}</div>
                    <div className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {b.persons} people</div>
                  </div>
                  {b.cafe.address && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                      <MapPin className="w-4 h-4" /> {b.cafe.address}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/cafe/${b.cafe_id}`)}>
                    View Cafe
                  </Button>
                </div>
              </div>
              {b.notes && (
                <div className="mt-4 pt-4 border-t border-border/50 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                  <span className="font-semibold text-foreground mr-1">Notes:</span> {b.notes}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
