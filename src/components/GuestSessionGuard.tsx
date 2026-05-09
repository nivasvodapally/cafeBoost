/**
 * Validates the stored active-cafe still exists in the DB on app mount.
 * If the cafe was deleted, the active cafe context is cleared so customers
 * aren't stuck in a stale or spoofed cafe session.
 */
import { useValidateActiveCafe } from "@/lib/cafeContext";

export function GuestSessionGuard() {
  useValidateActiveCafe();
  return null;
}