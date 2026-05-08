/**
 * QR service - single canonical link per cafe.
 *
 * Owner-printed QR codes must point at the published site. The route is
 * hash-based so customer QR links survive reloads on hosts that do not rewrite
 * nested paths.
 *
 * Origin resolution:
 *   1. VITE_PUBLIC_SITE_URL, recommended for production and local QR previews.
 *   2. window.location.origin, when running on a non-local deployed host.
 */
export type QrKind = "main";

export const QR_KIND_META: Record<QrKind, { label: string; desc: string }> = {
  main: { label: "Cafe QR", desc: "Customers scan to enter your cafe - menu, ordering, booking & rewards." },
};

function isLocalOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(origin);
}

export function origin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const currentOrigin = window.location.origin;
    if (!isLocalOrigin(currentOrigin)) return currentOrigin;
  }

  throw new Error("Missing VITE_PUBLIC_SITE_URL for QR generation.");
}

export function qrUrl(slug: string, _kind: QrKind = "main"): string {
  return `${origin()}/#/cafe/${slug}`;
}

export function qrPath(slug: string, _kind: QrKind = "main"): string {
  return `/#/cafe/${slug}`;
}
