import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shows a modal prompting the guest user to sign in before they can place
 * orders or book tables. Placed on action-heavy pages where auth is required.
 */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    // Show the prompt when the user is a guest (no account)
    if (!user || profile?.is_guest) {
      setOpen(true);
    }
  }, [loading, user, profile]);

  if (loading || !user || profile?.is_guest) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (v) setOpen(true); }}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="w-5 h-5 text-accent" />
              Create an account to continue
            </DialogTitle>
            <DialogDescription>
              You can browse the menu as a guest, but you'll need an account to place orders or book tables.
              It takes just 30 seconds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col">
            <Button
              variant="hero"
              onClick={() => {
                setOpen(false);
                window.location.href = "/#/auth?mode=signup";
              }}
            >
              <UserPlus className="w-4 h-4" /> Create free account
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                window.location.href = "/#/auth?mode=signin";
              }}
            >
              Sign in with existing account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return <>{children}</>;
}
