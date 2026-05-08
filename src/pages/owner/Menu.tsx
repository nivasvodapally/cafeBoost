import { useEffect, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, UtensilsCrossed, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { menuItemSchema } from "@/lib/validation";

type MenuItem = { id: string; category: string; name: string; description: string | null; price: number; tags: string[] | null; available: boolean };

export default function OwnerMenu() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ category: "", name: "", description: "", price: 0 });
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [editForm, setEditForm] = useState({ category: "", name: "", description: "", price: 0 });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (!cafe) return;
    void supabase.from("menu_items").select("id, category, name, description, price, tags, available")
      .eq("cafe_id", cafe.id).order("category").order("name")
      .then(({ data }) => { setItems((data as MenuItem[]) ?? []); setLoading(false); });
  }, [cafe]);

  const add = async () => {
    if (!cafe) return;
    const parsed = menuItemSchema.safeParse(draft);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    const { data, error } = await supabase.from("menu_items").insert({
      cafe_id: cafe.id, category: parsed.data.category, name: parsed.data.name,
      description: parsed.data.description || null, price: parsed.data.price, tags: [],
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setItems(p => [...p, data as MenuItem]);
    setDraft({ category: "", name: "", description: "", price: 0 });
    toast.success("Item added");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this item? Past orders keep their item names.")) return;
    await supabase.from("menu_items").delete().eq("id", id);
    setItems(p => p.filter(i => i.id !== id));
  };

  const toggle = async (id: string, available: boolean) => {
    await supabase.from("menu_items").update({ available }).eq("id", id);
    setItems(p => p.map(i => i.id === id ? { ...i, available } : i));
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setEditForm({
      category: item.category,
      name: item.name,
      description: item.description ?? "",
      price: Number(item.price),
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const parsed = menuItemSchema.safeParse(editForm);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setEditSaving(true);
    // UPDATE only — never delete + re-insert (would orphan order_items references).
    const { data, error } = await supabase.from("menu_items").update({
      category: parsed.data.category,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price: parsed.data.price,
    }).eq("id", editing.id).select().single();
    setEditSaving(false);
    if (error) { toast.error(error.message); return; }
    setItems(p => p.map(i => i.id === editing.id ? (data as MenuItem) : i));
    setEditing(null);
    toast.success("Item updated");
  };

  if (cafeLoading || loading) return <OwnerLayout title="Menu"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></OwnerLayout>;

  const cats = Array.from(new Set(items.map(i => i.category)));

  return (
    <OwnerLayout title="Menu" subtitle={`${items.length} items`}>
      <Card className="p-4 mb-6">
        <p className="font-semibold text-sm mb-3">Add item</p>
        <div className="grid sm:grid-cols-5 gap-3">
          <Input placeholder="Category" value={draft.category} onChange={e => setDraft(p => ({ ...p, category: e.target.value }))} />
          <Input placeholder="Name" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Description" value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} />
          <Input type="number" step="0.01" placeholder="Price" value={draft.price || ""} onChange={e => setDraft(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))} />
          <Button variant="hero" onClick={add}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>
      </Card>
      {items.length === 0 ? (
        <Card className="p-10 text-center"><UtensilsCrossed className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" /><p className="font-display text-xl font-bold">No menu items</p></Card>
      ) : cats.map(cat => (
        <div key={cat} className="mb-6">
          <h3 className="font-display text-lg font-bold mb-3">{cat}</h3>
          <div className="space-y-2">{items.filter(i => i.category === cat).map(i => (
            <Card key={i.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1"><p className="font-medium text-sm truncate">{i.name}</p>{i.description && <p className="text-xs text-muted-foreground truncate">{i.description}</p>}</div>
              <p className="text-sm font-semibold">₹{Number(i.price).toFixed(2)}</p>
              <Button variant="outline" size="sm" onClick={() => toggle(i.id, !i.available)}>{i.available ? "Hide" : "Show"}</Button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(i)} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(i.id)} aria-label="Delete"><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </Card>
          ))}</div>
        </div>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit menu item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Category</Label><Input value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" value={editForm.price || ""} onChange={e => setEditForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={editSaving}>Cancel</Button>
            <Button variant="hero" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OwnerLayout>
  );
}
