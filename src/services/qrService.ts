/**
 * QR service — single canonical link per cafe.
 *
 * Owner-printed QR codes must point at the PUBLISHED site (not the preview
 * URL the owner happens to be on). The route is hash-based so customer QR
 * links survive reloads even on hosts that do not rewrite nested paths.
 * We resolve the public origin in this order:
 *   1. VITE_PUBLIC_SITE_URL    (recommended explicit override)
 *   2. window.location.origin  if it isn't a Lovable preview/sandbox host
 *   3. https://cafeboosts.lovable.app (the project's published default)
 */
export type QrKind = "main";

export const QR_KIND_META: Record<QrKind, { label: string; desc: string }> = {
  main: { label: "Cafe QR", desc: "Customers scan to enter your cafe — menu, ordering, booking & rewards." },
};

const DEFAULT_PUBLISHED_ORIGIN = "https://cafeboosts.lovable.app";

function isPreviewOrigin(origin: string): boolean {
  return /id-preview--|sandbox\.lovable\.dev|localhost|127\.0\.0\.1/i.test(origin);
}

export function origin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const o = window.location.origin;
    if (!isPreviewOrigin(o)) return o;
  }
  return DEFAULT_PUBLISHED_ORIGIN;
}

export function qrUrl(slug: string, _kind: QrKind = "main"): string {
  return `${origin()}/#/cafe/${slug}`;
}

export function qrPath(slug: string, _kind: QrKind = "main"): string {
  return `/#/cafe/${slug}`;
}
