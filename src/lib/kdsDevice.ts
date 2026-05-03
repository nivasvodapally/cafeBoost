/**
 * KDS device session — a paired kitchen tablet stores a long-lived token
 * in localStorage. The token authenticates calls to the kds_* RPCs.
 */
const TOKEN_KEY = "cafeboost:kds:token";
const LABEL_KEY = "cafeboost:kds:label";

export const kdsDevice = {
  getToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  getLabel(): string | null {
    try { return localStorage.getItem(LABEL_KEY); } catch { return null; }
  },
  save(token: string, label?: string | null) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (label) localStorage.setItem(LABEL_KEY, label);
    } catch { /* ignore */ }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LABEL_KEY);
    } catch { /* ignore */ }
  },
};
