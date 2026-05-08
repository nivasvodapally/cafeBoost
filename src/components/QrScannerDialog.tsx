import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, QrCode, X } from "lucide-react";
import { toast } from "sonner";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

/**
 * Customer QR scanner. Reads QR codes containing a CafeBoost cafe URL
 * (e.g. https://app.cafeboost.app/cafe/aurora-coffee or /cafe/aurora-coffee?table=4)
 * and routes the customer to that cafe page.
 */
export function QrScannerDialog({ open, onOpenChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null); setStarting(true);
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        if (!back || !videoRef.current) {
          setError("No camera available on this device.");
          setStarting(false);
          return;
        }
        controlsRef.current = await reader.decodeFromVideoDevice(back.deviceId, videoRef.current, (result) => {
          if (!result) return;
          const text = result.getText();
          handleScanned(text);
        });
        setStarting(false);
      } catch (e) {
        setStarting(false);
        setError(e instanceof Error ? e.message : "Couldn't access the camera. Allow camera access and try again.");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleScanned = (raw: string) => {
    try {
      let path = raw.trim();
      // Accept full URL, relative path, or hash-based URL (printed QRs use /#/cafe/slug)
      if (/^https?:\/\//i.test(path)) {
        const u = new URL(path);
        // Combine pathname + hash so /#/cafe/slug works
        path = u.pathname + (u.hash || "") + u.search;
      }
      // Strip leading "#" / "/#" so the regex matches both formats
      path = path.replace(/^\/?#/, "");
      // Also accept ?cafe=slug short form
      const qMatch = path.match(/[?&]cafe=([\w-]+)/i);
      if (qMatch) {
        controlsRef.current?.stop();
        onOpenChange(false);
        navigate(`/cafe/${qMatch[1]}`);
        return;
      }
      // Match /cafe/<slug> optionally followed by /table/<tableNo>
      const match = path.match(/\/cafe\/([\w-]+)(?:\/table\/([\w-]+))?(\?[^#]*)?/);
      if (!match) {
        toast.error("This QR doesn't look like a cafe code.");
        return;
      }
      controlsRef.current?.stop();
      onOpenChange(false);
      const slug = match[1];
      const table = match[2];
      const search = match[3] ?? "";
      navigate(table ? `/cafe/${slug}/table/${table}${search}` : `/cafe/${slug}${search}`);
    } catch {
      toast.error("Couldn't read that QR code.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="w-4 h-4" /> Scan cafe QR</DialogTitle>
          <DialogDescription>Point your camera at a CafeBoost QR to open the cafe's menu.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {starting && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-6 border-2 border-white/70 rounded-lg" />
        </div>
        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
        <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-2">
          <X className="w-4 h-4" /> Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
