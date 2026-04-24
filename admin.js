import { getApiBase } from "./config.js";

const TOKEN_KEY = "adprofit.admin.token";

const tokenForm = document.getElementById("admin-token-form");
const tokenInput = document.getElementById("admin-token-input");
const tokenErr = document.getElementById("admin-token-error");
const clearBtn = document.getElementById("admin-clear-token-btn");

const summaryMount = document.getElementById("admin-summary-cards");
const usersBody = document.getElementById("admin-users-body");
const workspacesBody = document.getElementById("admin-workspaces-body");
const integrationsBody = document.getElementById("admin-integrations-body");
const systemList = document.getElementById("admin-system-list");
const billingStatus = document.getElementById("admin-billing-status");

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setToken(value) {
  try {
    localStorage.setItem(TOKEN_KEY, value);
  } catch {
    /* ignore */
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function callAdmin(path) {
  const base = getApiBase() || "https://adprofit.onrender.com";
  const token = getToken();
  const res = await fetch(`${base}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "omit",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function renderLoading() {
  if (summaryMount) summaryMount.innerHTML = '<p class="dashboard-empty">Loading admin data…</p>';
  if (usersBody) usersBody.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';
  if (workspacesBody) workspacesBody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
  if (integrationsBody) integrationsBody.innerHTML = '<tr><td colspan="9">Loading…</td></tr>';
  if (systemList) systemList.innerHTML = "<li>Loading system info…</li>";
}

function renderUnauthorized() {
  if (tokenErr) tokenErr.textContent = "Unauthorized. Enter a valid admin token.";
}

function renderSummary(summary) {
  if (!summaryMount) return;
  const cards = [
    ["Total users", summary.totalUsers],
    ["Total workspaces", summary.totalWorkspaces],
    ["Connected Meta accounts", summary.connectedMetaAccounts],
    ["Active demo sessions", summary.activeDemoSessions],
    ["Backend status", summary.backendStatus],
    ["Stripe configured", summary.stripeConfigured ? "Yes" : "No"],
    ["Meta configured", summary.metaConfigured ? "Yes" : "No"],
    ["Database configured", summary.databaseConfigured ? "Yes" : "No"],
  ];
  summaryMount.innerHTML = cards
    .map(
      ([label, value]) => `<article class="metric-card">
        <h3 class="metric-card__label">${esc(label)}</h3>
        <p class="metric-card__value">${esc(value)}</p>
      </article>`
    )
    .join("");
}

function renderUsers(users) {
  if (!usersBody) return;
  if (!Array.isArray(users) || users.length === 0) {
    usersBody.innerHTML = '<tr><td colspan="8">No users found.</td></tr>';
    return;
  }
  usersBody.innerHTML = users
    .map(
      (u) => `<tr>
        <td>${esc(u.id)}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.name)}</td>
        <td>${esc(u.workspace)}</td>
        <td>${esc(u.role)}</td>
        <td>${esc(fmtDate(u.createdAt))}</td>
        <td>${esc(u.lastLogin || "—")}</td>
        <td>${esc(u.status || "active")}</td>
      </tr>`
    )
    .join("");
}

function renderWorkspaces(workspaces) {
  if (!workspacesBody) return;
  if (!Array.isArray(workspaces) || workspaces.length === 0) {
    workspacesBody.innerHTML = '<tr><td colspan="6">No workspaces found.</td></tr>';
    return;
  }
  workspacesBody.innerHTML = workspaces
    .map(
      (w) => `<tr>
        <td>${esc(w.id)}</td>
        <td>${esc(w.name)}</td>
        <td>${esc(w.ownerEmail)}</td>
        <td>${esc(w.plan || "starter")}</td>
        <td>${esc(fmtDate(w.createdAt))}</td>
        <td>${esc(w.connectedIntegrations)}</td>
      </tr>`
    )
    .join("");
}

function renderIntegrations(rows, demoMode) {
  const note = document.getElementById("admin-integrations-note");
  if (note) {
    if (demoMode) {
      note.hidden = false;
      note.textContent =
        "Demo / prototype mode: no encrypted Meta token in the database yet. Complete Meta OAuth with DATABASE_URL and TOKEN_ENCRYPTION_SECRET configured, or use the in-memory prototype row below.";
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }
  if (!integrationsBody) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    integrationsBody.innerHTML = '<tr><td colspan="9">No integrations found.</td></tr>';
    return;
  }
  integrationsBody.innerHTML = rows
    .map(
      (i) => `<tr>
        <td>${esc(i.provider)}</td>
        <td>${esc(i.workspaceName || i.workspaceSlug || "—")}</td>
        <td>${esc(i.accountName || "—")}</td>
        <td>${esc(i.accountId || "—")}</td>
        <td>${esc(i.currency || "—")}</td>
        <td>${esc(i.status || "—")}</td>
        <td>${esc(fmtDate(i.connectedAt))}</td>
        <td>${esc(fmtDate(i.lastSync))}</td>
        <td>${esc(i.source || "—")}</td>
      </tr>`
    )
    .join("");
}

function renderSystem(s) {
  if (!systemList) return;
  const rows = [
    ["Frontend URL", s.frontendUrl],
    ["Backend URL", s.backendUrl],
    ["CORS origin", s.corsOrigin],
    ["Meta App ID configured", s.hasMetaAppId],
    ["Meta secret configured", s.hasMetaSecret],
    ["Meta redirect URI", s.metaRedirectUri],
    ["Stripe key configured", s.hasStripeKey],
    ["Database configured", s.hasDatabaseUrl],
    ["Environment", s.environment],
    ["Demo mode", s.demoMode],
  ];
  systemList.innerHTML = rows
    .map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`)
    .join("");
  if (billingStatus) {
    billingStatus.textContent = s.hasStripeKey
      ? "Stripe key is configured, but checkout logic is placeholder."
      : "Stripe checkout is not configured yet.";
  }
}

async function loadAll() {
  renderLoading();
  if (tokenErr) tokenErr.textContent = "";
  const [summary, users, workspaces, integrations, system] = await Promise.all([
    callAdmin("/v1/admin/summary"),
    callAdmin("/v1/admin/users"),
    callAdmin("/v1/admin/workspaces"),
    callAdmin("/v1/admin/integrations"),
    callAdmin("/v1/admin/system"),
  ]);

  if (
    [summary, users, workspaces, integrations, system].some(
      (r) => r.res.status === 401
    )
  ) {
    renderUnauthorized();
    return;
  }

  if (!summary.res.ok || !users.res.ok || !workspaces.res.ok || !integrations.res.ok || !system.res.ok) {
    if (tokenErr) tokenErr.textContent = "Could not load admin API right now. Try again.";
    return;
  }

  renderSummary(summary.data.summary || {});
  renderUsers(users.data.users || []);
  renderWorkspaces(workspaces.data.workspaces || []);
  renderIntegrations(
    integrations.data.integrations || [],
    Boolean(integrations.data.demoMode)
  );
  renderSystem(system.data || {});
}

if (tokenInput instanceof HTMLInputElement) {
  tokenInput.value = getToken();
}

if (tokenForm instanceof HTMLFormElement) {
  tokenForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const token =
      tokenInput instanceof HTMLInputElement ? tokenInput.value.trim() : "";
    if (!token) {
      if (tokenErr) tokenErr.textContent = "Enter an admin token.";
      return;
    }
    setToken(token);
    loadAll();
  });
}

if (clearBtn instanceof HTMLButtonElement) {
  clearBtn.addEventListener("click", () => {
    clearToken();
    if (tokenInput instanceof HTMLInputElement) tokenInput.value = "";
    if (tokenErr) tokenErr.textContent = "Admin token cleared.";
    renderLoading();
  });
}

loadAll().catch(() => {
  if (tokenErr) tokenErr.textContent = "Backend unavailable. Retry after saving token.";
});
