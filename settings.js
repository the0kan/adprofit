import { getSession, signOutToLogin } from "./auth.js";
import { getApiBase } from "./config.js";

const userEl = document.getElementById("settings-user");
const metaEl = document.getElementById("settings-meta-connection");
const signOutBtn = document.getElementById("settings-sign-out");

const session = getSession();
if (userEl) {
  userEl.textContent = `Signed in as: ${session?.email || "Demo user"}`;
}

if (signOutBtn instanceof HTMLButtonElement) {
  signOutBtn.addEventListener("click", () => signOutToLogin());
}

async function initConnection() {
  const base = getApiBase();
  if (!base || !metaEl) return;
  try {
    const res = await fetch(`${base}/v1/integrations/meta/connection`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.connection) {
      metaEl.textContent = `Meta connection: ${data.connection.accountName || data.connection.accountId} (${data.connection.currency || "—"})`;
      return;
    }
    metaEl.textContent = "Meta connection: not connected.";
  } catch {
    metaEl.textContent = "Meta connection: unavailable right now.";
  }
}

initConnection();
