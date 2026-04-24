/**
 * AdProfit — runtime config (browser, no bundler)
 * Set API base via: <meta name="adprofit-api-base" content="https://api.example.com">
 * or query ?api=… or localStorage adprofit.apiBase (e.g. local http://localhost:3000,
 * production https://adprofit.onrender.com or your deployed API host)
 * Only **http:** and **https:** URLs are accepted (blocks javascript:, data:, etc.).
 */

/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normalizeApiBase(raw) {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return t;
  } catch {
    return null;
  }
}

/**
 * @returns {string | null}
 */
export function getApiBase() {
  const meta = document.querySelector('meta[name="adprofit-api-base"]');
  const fromMeta = normalizeApiBase(meta?.getAttribute("content")?.trim());

  let fromQuery = null;
  try {
    fromQuery = normalizeApiBase(
      new URLSearchParams(window.location.search).get("api")
    );
  } catch {
    /* ignore */
  }

  let fromLs = null;
  try {
    fromLs = normalizeApiBase(localStorage.getItem("adprofit.apiBase"));
  } catch {
    /* private mode */
  }

  let fromGlobal = null;
  if (typeof window !== "undefined" && window.__ADPROFIT_API_BASE__) {
    fromGlobal = normalizeApiBase(String(window.__ADPROFIT_API_BASE__));
  }

  return fromQuery || fromLs || fromGlobal || fromMeta;
}

/**
 * Workspace id for dashboard API URL (future: route param / session).
 * @param {{ workspaceId?: string } | null | undefined} session
 */
export function getWorkspaceIdForApi(session) {
  const fromSession = session?.workspaceId?.trim();
  if (fromSession) return fromSession;
  return "ws_nw_01";
}
