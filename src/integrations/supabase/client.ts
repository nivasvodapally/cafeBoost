import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_ prefixed versions) are set in your .env file.'
    );
  }

  /**
   * Tab-scoped session storage.
   *
   * Problem: Supabase's default storage key ("supabase-auth-token") is shared
   * across ALL tabs in the same browser profile. This means:
   *   - Owner in Tab A + Guest in Tab B → localStorage is the same key → clobber.
   *   - Token refresh failure in Tab A → clears shared key → Tab B loses session.
   *   - BroadcastChannel syncing (when enabled) propagates events across tabs.
   *
   * Solution: Each tab gets its own UUID-keyed storage bucket. Only that tab's
   * bucket is used. Other tabs' buckets are never touched.
   *
   * Mechanism:
   *   1. Each tab gets a unique TAB_ID (UUID) stored in sessionStorage.
   *   2. A registry lives in localStorage: { tabId -> session }.
   *   3. Each tab only reads/writes its own tabId entry.
   *   4. On sign-in: write to own bucket.
   *   5. On sign-out: clear own bucket (no effect on other tabs).
   *   6. On reload: read own bucket from sessionStorage (persists on refresh).
   *   7. BroadcastChannel is DISABLED — other tabs' events never interfere.
   */

  const TAB_ID_KEY = 'cafeboost:auth:tabid';
  const STORE_VERSION = 'v1';

  /**
   * Tab-scoped session storage.
   *
   * Problem: Supabase's default storage key ("supabase-auth-token") is shared
   * across ALL tabs. This clobbers sessions if one tab is a Guest and another
   * is an Owner.
   *
   * Solution: We use sessionStorage (which survives reloads but is scoped to the tab)
   * and a unique storageKey per tab. This ensures true isolation without leaking
   * data into localStorage.
   */
  function getMyTabId(): string {
    try {
      let id = sessionStorage.getItem(TAB_ID_KEY);
      if (!id) {
        id = `${STORE_VERSION}:${Date.now()}:${crypto.randomUUID?.() ?? Math.random()}`;
        sessionStorage.setItem(TAB_ID_KEY, id);
      }
      return id;
    } catch {
      return `${STORE_VERSION}:ssr:${Date.now()}`;
    }
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
      storageKey: `sb-${getMyTabId()}-auth-token`,
      persistSession: true,
      autoRefreshToken: true,
      // CRITICAL: disable BroadcastChannel so sign-in/sign-out in one tab
      // NEVER fires events in other tabs.
      listenToBroadcastChannel: false,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});