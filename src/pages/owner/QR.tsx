import { useEffect, useRef, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer, Copy, Check, Sparkles } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import QRCode from "qrcode";
import { qrUrl, qrPath } from "@/services/qrService";
import { toast } from "sonner";

/**
 * Single canonical Cafe QR — one premium card, no duplicate variants.
 * Table-ordering QR is kept as an opt-in advanced section (Settings toggle).
 */
function QRCanvas({ url, size = 280 }: { url: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) void QRCode.toCanvas(ref.current, url, { width: size, margin: 2, color: { dark: "#1a1a1a", light: "#ffffff" } });
  }, [url, size]);
  return <canvas ref={ref} className="mx-auto rounded-2xl" />;
}

export default function OwnerQR() {
  const { cafe, loading } = useOwnerCafe();
  const [tableNo, setTableNo] = useState("1");
  const [copied, setCopied] = useState(false);

  if (loading) return <OwnerLayout title="QR Code"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></OwnerLayout>;
  const slug = cafe?.slug ?? "your-cafe";
  const url = qrUrl(slug, "main");
  const tableUrl = `${url}/table/${encodeURIComponent(tableNo || "1")}`;

  const downloadPNG = async (u: string, label: string) => {
    const dataUrl = await QRCode.toDataURL(u, { width: 1024, margin: 2 });
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${slug}-${label}.png`; a.click();
    toast.success("PNG downloaded");
  };
  const printPoster = async (u: string, label: string) => {
    const dataUrl = await QRCode.toDataURL(u, { width: 720, margin: 2 });
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${cafe?.name ?? "Cafe"} — ${label}</title>
      <style>body{font-family:'Helvetica Neue',system-ui,sans-serif;text-align:center;padding:80px 24px;color:#1a1a1a;background:#faf7f2}h1{font-size:42px;margin-bottom:8px;letter-spacing:-.02em}h2{font-size:18px;color:#7a6f5f;margin-top:0;font-weight:500}img{margin:36px auto;display:block;max-width:380px;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,.08)}p{color:#9a8e7d;font-size:11px;font-family:'SF Mono',monospace;word-break:break-all;margin-top:20px}.footer{margin-top:48px;font-size:13px;color:#7a6f5f;font-weight:500}</style></head>
      <body><h1>${cafe?.name ?? "Cafe"}</h1><h2>Scan to order, book & earn rewards</h2><img src="${dataUrl}" alt="QR"/><p>${u}</p><div class="footer">Powered by CafeBoost</div><script>window.print()</script></body></html>`);
  };
  const copyLink = async (u: string) => {
    await navigator.clipboard.writeText(u);
    setCopied(true); toast.success("Link copied to clipboard"); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <OwnerLayout title="Cafe QR Code" subtitle="One premium QR — your customers' gateway to everything you offer.">
      <div className="max-w-xl mx-auto">
        <Card className="p-10 text-center bg-gradient-card border-border/60 shadow-elegant">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent-foreground text-[11px] font-semibold mb-5">
            <Sparkles className="w-3 h-3" /> Your single cafe QR
          </div>
          <div className="bg-background p-5 rounded-3xl inline-block shadow-soft">
            <QRCanvas url={url} />
          </div>
          <h3 className="font-display text-2xl font-bold mt-6">{cafe?.name ?? "Your Cafe"}</h3>
          <p className="text-sm text-muted-foreground mt-1.5">Menu · Book · Rewards · Orders — all in one scan</p>
          <p className="text-xs text-muted-foreground mt-4 font-mono break-all bg-muted/60 px-3 py-2 rounded-lg inline-block max-w-full">{qrPath(slug, "main")}</p>
          <div className="grid grid-cols-3 gap-2 mt-6">
            <Button variant="hero" size="sm" onClick={() => downloadPNG(url, "qr")}><Download className="w-3.5 h-3.5 mr-1" /> PNG</Button>
            <Button variant="outline" size="sm" onClick={() => printPoster(url, "Cafe QR")}><Printer className="w-3.5 h-3.5 mr-1" /> Poster</Button>
            <Button variant="outline" size="sm" onClick={() => copyLink(url)}>{copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />} {copied ? "Copied" : "Copy"}</Button>
          </div>
        </Card>

        {cafe?.table_ordering_enabled ? (
          <Card className="p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-base font-bold">Table-ordering QR</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Print one per table — orders arrive tagged.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Table #</label>
                <input value={tableNo} onChange={e => setTableNo(e.target.value)} className="w-16 h-9 px-2 rounded-md border border-input text-sm text-center" />
              </div>
            </div>
            <div className="flex justify-center py-3"><QRCanvas url={tableUrl} size={160} /></div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => downloadPNG(tableUrl, `table-${tableNo}`)}><Download className="w-3.5 h-3.5 mr-1" /> PNG</Button>
              <Button variant="outline" size="sm" onClick={() => printPoster(tableUrl, `Table ${tableNo}`)}><Printer className="w-3.5 h-3.5 mr-1" /> Poster</Button>
              <Button variant="outline" size="sm" onClick={() => copyLink(tableUrl)}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-5 mt-6 border-dashed">
            <p className="text-sm text-muted-foreground text-center">
              Want per-table QRs? Enable <span className="font-semibold text-foreground">Table ordering QR</span> in Settings.
            </p>
          </Card>
        )}
      </div>
    </OwnerLayout>
  );
}
