import { useEffect, useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function CustomerProfile() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [birthday, setBirthday] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(profile?.full_name ?? ""); setPhone(profile?.phone ?? ""); setBirthday(profile?.birthday ?? "");
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: name || null, phone: phone || null, birthday: birthday || null,
    }).eq("user_id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    void refreshProfile();
  };

  if (loading) return <CustomerLayout title="Profile"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></CustomerLayout>;

  return (
    <CustomerLayout title="Profile">
      <Card className="p-6 space-y-4">
        <div className="space-y-2"><Label>Email</Label><Input value={profile?.email ?? ""} disabled /></div>
        <div className="space-y-2"><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></div>
        <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={40} /></div>
        <div className="space-y-2"><Label>Birthday</Label><Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} /></div>
        <Button variant="hero" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
      </Card>
    </CustomerLayout>
  );
}
