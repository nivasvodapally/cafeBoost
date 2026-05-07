import { useEffect, useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Heart, Star, Users, Copy, Share2, Gift, Trash2, Edit, Plus, Check, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveCafe } from "@/lib/cafeContext";
import { toast } from "sonner";
import { CustomerFavoritesService } from "@/services/customerFavoritesService";
import { ReferralService } from "@/services/referralService";

type FavoriteMenuItem = {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  menu_item_price: number;
  notes: string | null;
  created_at: string;
};

export default function CustomerFavorites() {
  const { user } = useAuth();
  const cafe = useActiveCafe();
  const [favorites, setFavorites] = useState<FavoriteMenuItem[]>([]);
  const [referralCode, setReferralCode] = useState<string>("");
  const [referralStats, setReferralStats] = useState<{ totalReferrals: number; pendingReferrals: number; completedReferrals: number; rewardAmount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [addFavoriteDialog, setAddFavoriteDialog] = useState(false);
  const [editFavoriteDialog, setEditFavoriteDialog] = useState<{ open: boolean; favorite: FavoriteMenuItem | null }>({ open: false, favorite: null });
  const [referralDialog, setReferralDialog] = useState(false);
  const [applyReferralDialog, setApplyReferralDialog] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [notes, setNotes] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const loadData = async () => {
    if (!cafe || !user) return;
    
    setLoading(true);
    try {
      // Load favorites
      const favs = await CustomerFavoritesService.getFavorites(cafe.id);
      setFavorites(favs);
      
      // Load referral code and stats
      const code = await ReferralService.getOrCreateReferralCode();
      setReferralCode(code);
      
      const stats = await ReferralService.getReferralStats();
      setReferralStats(stats);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error("Failed to load favorites and referrals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cafe && user) {
      void loadData();
    }
  }, [cafe, user]);

  const handleAddFavorite = async () => {
    if (!cafe || !user) return;
    
    // In a real implementation, this would open a menu to select items
    // For now, we'll show a toast
    toast.info("To add favorites, go to the menu and click the heart icon on any item.");
    setAddFavoriteDialog(false);
  };

  const handleRemoveFavorite = async (favoriteId: string) => {
    try {
      await CustomerFavoritesService.removeFavorite(favoriteId);
      toast.success("Removed from favorites");
      void loadData();
    } catch (error) {
      console.error('Error removing favorite:', error);
      toast.error("Failed to remove favorite");
    }
  };

  const handleUpdateFavoriteNotes = async () => {
    if (!editFavoriteDialog.favorite) return;
    
    try {
      await CustomerFavoritesService.updateFavoriteNotes(editFavoriteDialog.favorite.id, editNotes);
      toast.success("Notes updated");
      setEditFavoriteDialog({ open: false, favorite: null });
      setEditNotes("");
      void loadData();
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error("Failed to update notes");
    }
  };

  const handleCopyReferralLink = async () => {
    const link = ReferralService.getReferralLink(referralCode);
    await navigator.clipboard.writeText(link);
    toast.success("Referral link copied to clipboard!");
  };

  const handleShareReferralLink = async () => {
    const link = ReferralService.getReferralLink(referralCode);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me at this cafe!',
          text: `Use my referral code ${referralCode} to get rewards when you join!`,
          url: link,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      await navigator.clipboard.writeText(link);
      toast.success("Referral link copied to clipboard!");
    }
  };

  const handleApplyReferralCode = async () => {
    if (!referralCodeInput.trim()) {
      toast.error("Please enter a referral code");
      return;
    }

    try {
      await ReferralService.applyReferralCode(referralCodeInput.trim(), user?.id || '');
      toast.success("Referral code applied successfully!");
      setApplyReferralDialog(false);
      setReferralCodeInput("");
      void loadData();
    } catch (error) {
      console.error('Error applying referral code:', error);
      toast.error("Failed to apply referral code. It may be invalid or already used.");
    }
  };

  if (loading) {
    return (
      <CustomerLayout title="Favorites & Referrals">
        <div className="grid place-items-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout title="Favorites & Referrals" subtitle="Manage your favorite items and referral rewards">
      <div className="space-y-6 pb-20 px-4">
        {/* Favorites Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-500" />
              <h2 className="font-display text-xl font-bold">My Favorites</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAddFavoriteDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Favorite
            </Button>
          </div>

          {favorites.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-display text-lg font-bold">No favorites yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Add items you love from the menu by clicking the heart icon
              </p>
              <Button className="mt-4" onClick={() => window.location.href = "/app/menu"}>
                Browse Menu
              </Button>
            </Card>
          ) : (
            <div className="grid gap-3">
              {favorites.map((fav) => (
                <Card key={fav.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">{fav.menu_item_name}</h3>
                        <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">Favorite</span>
                      </div>
                      <p className="text-sm font-bold text-accent mt-1">₹{fav.menu_item_price.toFixed(2)}</p>
                      {fav.notes && (
                        <p className="text-xs text-muted-foreground mt-2 italic">"{fav.notes}"</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Added {new Date(fav.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditFavoriteDialog({ open: true, favorite: fav });
                          setEditNotes(fav.notes || "");
                        }}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Notes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/20"
                        onClick={() => handleRemoveFavorite(fav.id)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Referrals Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <h2 className="font-display text-xl font-bold">Referral Program</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setApplyReferralDialog(true)}>
                <Check className="w-4 h-4 mr-2" />
                Apply Code
              </Button>
              <Button variant="hero" size="sm" onClick={() => setReferralDialog(true)}>
                <Share2 className="w-4 h-4 mr-2" />
                Share & Earn
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{referralStats?.totalReferrals || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Referrals</p>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{referralStats?.completedReferrals || 0}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Star className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">₹{referralStats?.rewardAmount || 0}</p>
                  <p className="text-xs text-muted-foreground">Reward Value</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Your Referral Code</p>
                <p className="text-2xl font-mono font-bold tracking-wider mt-2">{referralCode}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Share this code with friends to earn rewards when they join and make their first order
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={handleCopyReferralLink}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
                <Button variant="hero" onClick={handleShareReferralLink}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>
          </Card>
        </section>
      </div>

      {/* Add Favorite Dialog */}
      <Dialog open={addFavoriteDialog} onOpenChange={setAddFavoriteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Favorite Item</DialogTitle>
            <DialogDescription>
              Add menu items to your favorites for quick reordering
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="text-center py-8">
              <Heart className="w-12 h-12 text-rose-100 mx-auto mb-4" />
              <p className="font-medium">Browse the menu to add favorites</p>
              <p className="text-sm text-muted-foreground mt-2">
                Click the heart icon on any menu item to add it to your favorites
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFavoriteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => window.location.href = "/app/menu"}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Menu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Favorite Notes Dialog */}
      <Dialog open={editFavoriteDialog.open} onOpenChange={(open) => setEditFavoriteDialog({ open, favorite: editFavoriteDialog.favorite })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Favorite Notes</DialogTitle>
            <DialogDescription>
              Add personal notes for this favorite item
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                className="w-full min-h-[100px] p-3 border rounded-md"
                placeholder="E.g., Extra spicy, no onions, with extra cheese..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFavoriteDialog({ open: false, favorite: null })}>
              Cancel
            </Button>
            <Button onClick={handleUpdateFavoriteNotes}>
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Referral Dialog */}
      <Dialog open={referralDialog} onOpenChange={setReferralDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share & Earn Rewards</DialogTitle>
            <DialogDescription>
              Invite friends to join and earn rewards when they make their first order
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 mb-4">
              <div className="text-center">
                <p className="text-3xl font-mono font-bold tracking-wider mb-2">{referralCode}</p>
                <p className="text-sm text-muted-foreground">Your personal referral code</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-bold">1</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Share your code</p>
                  <p className="text-xs text-muted-foreground">Send your referral code to friends</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-bold">2</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Friend joins & orders</p>
                  <p className="text-xs text-muted-foreground">They use your code when signing up</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-bold">3</span>
                </div>
                <div>
                  <p className="font-medium text-sm">You earn rewards</p>
                  <p className="text-xs text-muted-foreground">Get rewards when their order completes</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleCopyReferralLink} className="flex-1">
              <Copy className="w-4 h-4 mr-2" />
              Copy Link
            </Button>
            <Button onClick={handleShareReferralLink} className="flex-1">
              <Share2 className="w-4 h-4 mr-2" />
              Share Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Referral Code Dialog */}
      <Dialog open={applyReferralDialog} onOpenChange={setApplyReferralDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Referral Code</DialogTitle>
            <DialogDescription>
              Enter a friend's referral code to get rewards
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="referral-code">Referral Code</Label>
              <Input
                id="referral-code"
                placeholder="Enter referral code"
                value={referralCodeInput}
                onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                className="text-center font-mono text-lg tracking-wider"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Applying a referral code may give you bonus points or discounts on your first order
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyReferralDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyReferralCode} disabled={!referralCodeInput.trim()}>
              Apply Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}