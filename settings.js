import { getSession, signOutToLogin } from "./auth.js";
import { getApiBase } from "./config.js";

const userEl = document.getElementById("settings-user");
const metaEl = document.getElementById("settings-meta-connection");
const wsEl = document.getElementById("settings-workspace-info");
const signOutBtn = document.getElementById("settings-sign-out");

const session = getSession();
if (userEl) {
  userEl.textContent = `Signed in as: ${session?.email || "Demo user"}`;
}

if (wsEl) {
  if (session?.workspaceId) {
    wsEl.textContent = `Active workspace ID: ${session.workspaceId}`;
  } else {
    wsEl.textContent = "No workspace id in session — sign in again after API signup.";
  }
}

if (signOutBtn instanceof HTMLButtonElement) {
  signOutBtn.addEventListener("click", () => signOutToLogin());
}

async function initConnection() {
  const base = getApiBase();
  if (!metaEl) return;
  if (!base) {
    metaEl.textContent =
      "Meta: configure API base (meta tag or localStorage) to see connection status.";
    return;
  }
  try {
    const res = await fetch(`${base}/v1/integrations/meta/connection`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.connection) {
      metaEl.textContent = `${data.connection.accountName || data.connection.accountId} · ${data.connection.currency || "—"} · status ${data.connection.status || "—"}`;
      return;
    }
    metaEl.textContent = "No Meta ad account selected. Connect from the dashboard.";
  } catch {
    metaEl.textContent = "Could not reach the API for Meta status.";
  }
}

initConnection();
