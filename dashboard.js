/**
 * AdProfit — dashboard client (mock data → DOM)
 * Swap `getDashboardPayload()` for a fetch later; keep render functions pure where possible.
 */

import { getDashboardPayload } from "./data.js";
import { deriveCampaignMetrics } from "./metrics.js";
import { runInsightsEngine, DEMO_SIGNALS } from "./insights-engine.js";
import {
  assertAuthenticatedAppShell,
  getSession,
  signOutToLogin,
} from "./auth.js";
import { getApiBase, getWorkspaceIdForApi } from "./config.js";
import { renderSpendRevenueChart } from "./chart.js";

const DISMISSED_ALERTS_KEY = "adprofit.dismissedAlertIds.v1";
const INTEGRATION_DEMO_KEY = "adprofit.demo.integrationOverrides.v1";
const LIVE_META_STATE_KEY = "adprofit.meta.liveState.v1";

/**
 * Reads `?meta=` from the URL (OAuth return), then removes it from the address bar.
 * @returns {string} e.g. connected | select-account | denied | oauth_error
 */
function consumeMetaOAuthQueryParams() {
  try {
    const u = new URL(window.location.href);
    const meta = u.searchParams.get("meta");
    if (!meta) return "";
    u.searchParams.delete("meta");
    const q = u.searchParams.toString();
    window.history.replaceState({}, "", u.pathname + (q ? `?${q}` : ""));
    return meta;
  } catch {
    return "";
  }
}

/** @returns {string[]} */
function readDismissedAlertIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** @param {string[]} ids */
function writeDismissedAlertIds(ids) {
  try {
    const unique = [...new Set(ids.filter((x) => typeof x === "string"))];
    localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(unique));
  } catch {
    /* ignore */
  }
}

/**
 * @param {object[]} allAlerts
 * @returns {object[]}
 */
function filterActiveAlerts(allAlerts) {
  const dismissed = new Set(readDismissedAlertIds());
  return (Array.isArray(allAlerts) ? allAlerts : []).filter(
    (a) => a?.id && !dismissed.has(a.id)
  );
}

function updateAlertsToolbar() {
  const bar = document.getElementById("alerts-toolbar");
  const btn = document.getElementById("alerts-restore-dismissed");
  const meta = document.getElementById("alerts-dismiss-meta");
  if (!bar || !btn) return;
  const n = readDismissedAlertIds().length;
  const show = n > 0;
  bar.hidden = !show;
  btn.disabled = !show;
  if (meta) {
    meta.textContent = show
      ? `${n} hidden until restored`
      : "";
  }
}

/**
 * Drop stale integration override keys when the payload no longer includes that id.
 * @param {Array<{ id: string }>} integrations
 */
function pruneIntegrationOverrides(integrations) {
  const valid = new Set(integrations.map((i) => i.id));
  const o = readIntegrationOverrides();
  const next = {};
  let changed = false;
  for (const [k, v] of Object.entries(o)) {
    if (valid.has(k)) next[k] = v;
    else changed = true;
  }
  if (changed) writeIntegrationOverrides(next);
}

/** @returns {Record<string, { state?: string, meta?: string, detail?: string }>} */
function readIntegrationOverrides() {
  try {
    const raw = localStorage.getItem(INTEGRATION_DEMO_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, unknown>} o */
function writeIntegrationOverrides(o) {
  try {
    localStorage.setItem(INTEGRATION_DEMO_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

/** @param {string} unsafe */
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * @param {number} amount
 * @param {string} [currency='USD']
 * @param {Intl.NumberFormatOptions} [opts]
 */
function formatCurrency(amount, currency = "USD", opts = {}) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    ...opts,
  }).format(amount);
}

/**
 * @param {number} amount
 * @param {string} [currency='USD']
 */
function formatCurrency2(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * @param {number} amount
 * @param {string} [currency='USD']
 */
function formatSignedProfit(amount, currency = "USD") {
  const nf = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  if (amount >= 0) return "+" + nf.format(amount);
  return "−" + nf.format(Math.abs(amount));
}

/**
 * @param {number} ratio
 * @param {number} [digits=2]
 */
function formatRatio(ratio, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

/**
 * @param {number} ratio 0–1
 */
function formatPercent(ratio) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratio);
}

/** @param {'healthy'|'warn'|'risk'} tone */
function statusToneToPillClass(tone) {
  const map = {
    healthy: "status-pill status-pill--healthy",
    warn: "status-pill status-pill--warn",
    risk: "status-pill status-pill--risk",
  };
  return map[tone] || map.healthy;
}

/** @param {'critical'|'warning'|'info'} severity */
function alertSeverityToCardClass(severity) {
  const map = {
    critical: "alert-card alert-card--critical",
    warning: "alert-card alert-card--warning",
    info: "alert-card alert-card--info",
  };
  return map[severity] || map.warning;
}

/** @param {'connected'|'syncing'|'disconnected'} state */
function integrationStateToClass(state) {
  const map = {
    connected: "connection-status connection-status--connected",
    syncing: "connection-status connection-status--syncing",
    disconnected: "connection-status connection-status--disconnected",
  };
  return map[state] || map.disconnected;
}

/** @param {'connected'|'syncing'|'disconnected'} state */
function integrationStateLabel(state) {
  const map = {
    connected: "Connected",
    syncing: "Syncing",
    disconnected: "Not connected",
  };
  return map[state] || map.disconnected;
}

/**
 * @param {object} pm
 * @param {object} period
 */
function renderMetrics(pm, period) {
  const grid = document.querySelector("#metrics-grid") || document.querySelector(".metrics-grid");
  if (!grid) return;
  if (!pm || !period) {
    console.warn("[AdProfit] Missing portfolio metrics or reporting period.");
    return;
  }

  grid.classList.remove("metrics-grid--skeleton");
  grid.removeAttribute("aria-busy");

  const currency = pm.currency || "USD";
  const periodDesc = `${period.label} · ${period.sourceLabel}`;

  const cards = [
    {
      label: "Total spend",
      value: formatCurrency(pm.totalSpend, currency),
      hint: `${period.label} · Meta Ads`,
    },
    {
      label: "Revenue",
      value: formatCurrency(pm.revenue, currency),
      hint: "Attributed orders · Woo + Shopify",
    },
    {
      label: "ROAS",
      value: formatRatio(pm.roas, 2),
      hint: "Blended · revenue ÷ spend",
    },
    {
      label: "CPA",
      value: formatCurrency2(pm.cpa, currency),
      hint: "Cost per purchase",
    },
    {
      labelHtml: 'Profit <span class="metric-card__tag">est.</span>',
      value: formatCurrency(pm.estimatedProfit, currency),
      hint: "After estimated COGS & fees",
    },
    {
      label: "Margin",
      value: formatPercent(pm.margin),
      hint: "Profit ÷ revenue",
    },
  ];

  grid.innerHTML = cards
    .map((c) => {
      const labelInner =
        "labelHtml" in c && c.labelHtml
          ? c.labelHtml
          : escapeHtml(/** @type {{ label: string }} */ (c).label);
      return `
        <article class="metric-card">
          <h3 class="metric-card__label">${labelInner}</h3>
          <p class="metric-card__value">${escapeHtml(c.value)}</p>
          <p class="metric-card__hint">${escapeHtml(c.hint)}</p>
        </article>`;
    })
    .join("");

  const desc =
    document.querySelector("#metrics-period-desc") ||
    document.querySelector("section.metrics .dashboard-section__description");
  if (desc) desc.textContent = periodDesc;
}

/**
 * @param {object} snap
 * @param {string} currency
 */
function renderPerformanceSummary(snap, currency) {
  if (!snap) return;

  const title = document.querySelector(".performance-summary__title");
  if (title) title.textContent = snap.label;

  const cur = currency || "USD";
  const rev = "+" + formatCurrency(snap.revenue, cur);
  const spend = "−" + formatCurrency(snap.spend, cur);
  const roasCell =
    snap.roas != null && Number.isFinite(snap.roas)
      ? escapeHtml(formatRatio(snap.roas, 2))
      : "—";
  const profitCell =
    snap.estimatedProfit != null
      ? escapeHtml(formatSignedProfit(snap.estimatedProfit, cur))
      : "—";
  const profitValClass =
    snap.estimatedProfit != null && snap.estimatedProfit < 0
      ? "performance-summary__value performance-summary__value--negative"
      : "performance-summary__value performance-summary__value--positive";

  const list = document.querySelector(".performance-summary__list");
  if (list) {
    list.innerHTML = `
      <li class="performance-summary__row">
        <span class="performance-summary__metric">Revenue</span>
        <span class="performance-summary__value">${escapeHtml(rev)}</span>
      </li>
      <li class="performance-summary__row">
        <span class="performance-summary__metric">Spend</span>
        <span class="performance-summary__value">${escapeHtml(spend)}</span>
      </li>
      <li class="performance-summary__row">
        <span class="performance-summary__metric">ROAS</span>
        <span class="performance-summary__value">${roasCell}</span>
      </li>
      <li class="performance-summary__row">
        <span class="performance-summary__metric">Est. profit</span>
        <span class="${profitValClass}">${profitCell}</span>
      </li>`;
  }

  const foot = document.querySelector(".performance-summary__footnote");
  if (foot) {
    foot.textContent = `${snap.compareToLabel} · synced ${snap.lastSyncedRelative}`;
  }
}

/**
 * @param {object} c
 */
function campaignSearchBlob(c) {
  const tags = Array.isArray(c.tags) ? c.tags.join(" ") : "";
  return `${c.name} ${c.statusLabel} ${tags}`.trim().toLowerCase();
}

/**
 * @param {object[]} rows
 * @param {string} currency
 */
function renderCampaignTable(rows, currency) {
  const tbody =
    document.querySelector("#campaign-table-body") ||
    document.querySelector(".data-table tbody");
  if (!tbody) return;
  if (!Array.isArray(rows)) return;

  const cur = currency || "USD";

  tbody.innerHTML = rows
    .map((c) => {
      const derived = deriveCampaignMetrics(c);
      const roas = derived.roas ?? c.roas;
      const cpa = derived.cpa ?? c.cpa;
      const profit = derived.profit ?? c.estimatedProfit;
      const profitClass =
        profit != null && profit >= 0
          ? "data-table__positive"
          : "data-table__negative";
      const pillClass = statusToneToPillClass(c.statusTone);
      const roasCell =
        roas != null ? escapeHtml(formatRatio(roas, 2)) : "—";
      const cpaCell =
        cpa != null ? escapeHtml(formatCurrency2(cpa, cur)) : "—";
      const profitCell =
        profit != null ? escapeHtml(formatSignedProfit(profit, cur)) : "—";
      const blob = escapeHtml(campaignSearchBlob(c));
      return `
      <tr data-campaign-id="${escapeHtml(c.id)}" data-search-blob="${blob}">
        <td class="data-table__primary">${escapeHtml(c.name)}</td>
        <td>${escapeHtml(formatCurrency(c.spend, cur))}</td>
        <td>${escapeHtml(String(c.purchases))}</td>
        <td>${escapeHtml(formatCurrency(c.revenue, cur))}</td>
        <td>${roasCell}</td>
        <td>${cpaCell}</td>
        <td class="${profitClass}">${profitCell}</td>
        <td><span class="${pillClass}">${escapeHtml(c.statusLabel)}</span></td>
      </tr>`;
    })
    .join("");
}

/** @type {object[]} */
let currentCampaignRows = [];

/**
 * @param {object[]} rows
 * @returns {object[]}
 */
function getCampaignRowsAfterControls(rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const filterSel = document.getElementById("campaign-filter-select");
  const sortSel = document.getElementById("campaign-sort-select");
  const filter = filterSel instanceof HTMLSelectElement ? filterSel.value : "all";
  const sort = sortSel instanceof HTMLSelectElement ? sortSel.value : "spend_desc";

  const filtered = list.filter((c) => {
    const purchases = Number(c?.purchases) || 0;
    const roas = Number(c?.roas) || 0;
    const profit = Number(c?.estimatedProfit) || 0;
    if (filter === "profitable") return profit > 0 || roas >= 1.5;
    if (filter === "losing") return profit < 0 || roas < 1;
    if (filter === "no_purchases") return purchases <= 0;
    return true;
  });

  const sorters = {
    spend_desc: (a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0),
    revenue_desc: (a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0),
    purchases_desc: (a, b) => (Number(b.purchases) || 0) - (Number(a.purchases) || 0),
    roas_desc: (a, b) => (Number(b.roas) || 0) - (Number(a.roas) || 0),
  };
  const sorter = sorters[sort] || sorters.spend_desc;
  filtered.sort(sorter);
  return filtered;
}

function renderCampaignRowsWithControls() {
  const currency =
    latestRenderedPayload?.portfolioMetrics?.currency ||
    latestRenderedPayload?.workspace?.currency ||
    "USD";
  renderCampaignTable(getCampaignRowsAfterControls(currentCampaignRows), currency);
  const input = document.querySelector("#dashboard-search-input");
  if (input instanceof HTMLInputElement) applyCampaignSearch(input.value);
}

/** @type {object[]} */
let dashboardAlerts = [];

/** @param {object[]} items */
function renderAlerts(items) {
  const grid =
    document.querySelector("#alert-grid") || document.querySelector(".alert-grid");
  if (!grid) return;
  if (!Array.isArray(items)) return;

  const dismissed = readDismissedAlertIds();
  const visible = items.filter((a) => a?.id && !dismissed.includes(a.id));

  if (visible.length === 0) {
    const withIds = items.filter((a) => a?.id);
    let msg =
      "No alerts from the rules engine for this workspace right now.";
    if (withIds.length > 0 && dismissed.length > 0) {
      msg =
        "Every alert is dismissed. Restore them with the control above the grid — stored in this browser only.";
    } else if (items.length > 0 && withIds.length === 0) {
      msg =
        "Alerts are missing stable IDs in the payload, so cards cannot be shown.";
    }
    grid.innerHTML = `
      <li class="alert-grid__empty">
        <p class="dashboard-empty">${escapeHtml(msg)}</p>
      </li>`;
    updateAlertsToolbar();
    return;
  }

  grid.innerHTML = visible
    .map((a) => {
      const cardClass = alertSeverityToCardClass(a.severity);
      const meta = a.campaignName ? escapeHtml(a.campaignName) : "";
      return `
      <li>
        <article class="${cardClass}" data-alert-id="${escapeHtml(a.id)}">
          <div class="alert-card__head">
            <h3 class="alert-card__title">${escapeHtml(a.title)}</h3>
            <button type="button" class="alert-card__dismiss" aria-label="Dismiss alert (stored in this browser)"><span aria-hidden="true">×</span></button>
          </div>
          <p class="alert-card__meta">${meta}</p>
          <p class="alert-card__text">${escapeHtml(a.body)}</p>
        </article>
      </li>`;
    })
    .join("");

  grid.querySelectorAll(".alert-card__dismiss").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-alert-id]");
      const id = card?.getAttribute("data-alert-id");
      if (!id) return;
      writeDismissedAlertIds([...readDismissedAlertIds(), id]);
      renderAlerts(dashboardAlerts);
      const active = filterActiveAlerts(dashboardAlerts);
      renderNotifyPanel(active);
      notifyUi?.setBadgeCount?.(active.length);
      showDemoToast("Alert dismissed — stays hidden on reload in this browser.");
    });
  });

  updateAlertsToolbar();
}

/** @param {object[]} items */
function renderInsights(items) {
  const grid =
    document.querySelector("#insight-grid") || document.querySelector(".insight-grid");
  if (!grid) return;
  if (!Array.isArray(items)) return;

  if (items.length === 0) {
    grid.innerHTML = `
      <li class="insight-grid__empty-wrap">
        <div class="insight-empty" role="status">
          <p class="insight-empty__title">No recommendations yet</p>
          <p class="insight-empty__text">When the rules engine finds patterns in your spend, revenue, and margin, prioritized suggestions will appear here. Connect more data or check back after the next sync.</p>
        </div>
      </li>`;
    return;
  }

  grid.innerHTML = items
    .map(
      (i) => `
    <li>
      <article class="insight-card">
        <h3 class="insight-card__title">${escapeHtml(i.title)}</h3>
        <p class="insight-card__text">${escapeHtml(i.body)}</p>
      </article>
    </li>`
    )
    .join("");
}

/**
 * @param {object} i
 */
function integrationCardActions(i) {
  const id = escapeHtml(i.id);
  if (i.state === "disconnected") {
    return `<div class="integration-card__actions">
      <button type="button" class="integration-card__btn integration-card__btn--primary" data-int-action="connect" data-int-id="${id}">Connect</button>
      <button type="button" class="integration-card__btn" data-int-action="details" data-int-id="${id}">Details</button>
    </div>`;
  }
  if (i.state === "syncing") {
    return `<div class="integration-card__actions">
      <button type="button" class="integration-card__btn" data-int-action="retry" data-int-id="${id}">Retry sync</button>
      <button type="button" class="integration-card__btn" data-int-action="details" data-int-id="${id}">Details</button>
    </div>`;
  }
  return `<div class="integration-card__actions">
    <button type="button" class="integration-card__btn" data-int-action="sync" data-int-id="${id}">Sync now</button>
    <button type="button" class="integration-card__btn" data-int-action="details" data-int-id="${id}">Details</button>
  </div>`;
}

/** @param {object[]} items */
function renderIntegrations(items) {
  const grid =
    document.querySelector("#integration-grid") ||
    document.querySelector(".integration-grid");
  if (!grid) return;
  if (!Array.isArray(items)) return;

  pruneIntegrationOverrides(items);

  const ov = readIntegrationOverrides();
  const merged = items.map((i) => ({ ...i, ...(ov[i.id] || {}) }));

  grid.innerHTML = merged
    .map((i) => {
      const spanClass = integrationStateToClass(i.state);
      const label = integrationStateLabel(i.state);
      return `
      <li>
        <article class="integration-card" data-integration-id="${escapeHtml(i.id)}">
          <h3 class="integration-card__name">${escapeHtml(i.displayName)}</h3>
          <p class="integration-card__detail">${escapeHtml(i.detail)}</p>
          <p class="integration-card__status">
            <span class="${spanClass}">${escapeHtml(label)}</span>
          </p>
          <p class="integration-card__meta">${escapeHtml(i.meta)}</p>
          ${integrationCardActions(i)}
        </article>
      </li>`;
    })
    .join("");

  grid.querySelectorAll("[data-int-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-int-action");
      const iid = btn.getAttribute("data-int-id");
      if (!action || !iid) return;
      const base = readIntegrationOverrides();
      if (action === "connect") {
        base[iid] = {
          state: "syncing",
          detail: "OAuth flow (demo)",
          meta: "Connecting…",
        };
        writeIntegrationOverrides(base);
        showDemoToast("Starting demo connect — integration set to syncing.");
        renderIntegrations(items);
        window.setTimeout(() => {
          const b = readIntegrationOverrides();
          if (b[iid]?.state === "syncing") {
            b[iid] = {
              state: "connected",
              detail: items.find((x) => x.id === iid)?.detail || "Connected",
              meta: "Last sync · just now (demo)",
            };
            writeIntegrationOverrides(b);
            renderIntegrations(items);
            showDemoToast("Demo: marked as connected.");
          }
        }, 1600);
        return;
      }
      if (action === "retry") {
        base[iid] = {
          state: "syncing",
          meta: "Retry requested · demo",
        };
        writeIntegrationOverrides(base);
        showDemoToast("Retry queued (demo).");
        renderIntegrations(items);
        return;
      }
      if (action === "sync") {
        base[iid] = {
          ...(base[iid] || {}),
          meta: "Last sync · just now (demo)",
        };
        writeIntegrationOverrides(base);
        showDemoToast("Sync recorded locally (demo) — would enqueue a job in production.");
        renderIntegrations(items);
        return;
      }
      if (action === "details") {
        showDemoToast("Integration details drawer — not implemented in this demo.");
      }
    });
  });
}

/** @param {object} po */
function renderProfitability(po) {
  const root =
    document.querySelector("#profit-snapshot") ||
    document.querySelector(".profit-snapshot");
  if (!root) return;
  if (!po || typeof po !== "object") return;

  const blocks = [
    { key: "highestProfit", data: po.highestProfit, valueClass: "profit-snapshot__value profit-snapshot__value--positive" },
    { key: "worst", data: po.worst, valueClass: "profit-snapshot__value profit-snapshot__value--negative" },
    { key: "strongestRoas", data: po.strongestRoas, valueClass: "profit-snapshot__value" },
    { key: "biggestWaste", data: po.biggestWaste, valueClass: "profit-snapshot__value profit-snapshot__value--negative" },
  ];

  root.innerHTML = blocks
    .filter((b) => b.data?.label)
    .map(({ data, valueClass }) => {
      return `
      <article class="profit-snapshot__card">
        <h3 class="profit-snapshot__label">${escapeHtml(data.label)}</h3>
        <p class="profit-snapshot__name">${escapeHtml(data.campaignName)}</p>
        <p class="${valueClass}">${escapeHtml(data.valueLabel)}</p>
      </article>`;
    })
    .join("");
}

/** @param {object | undefined} pe */
function renderProfitExplainer(pe) {
  const mount = document.getElementById("profit-explainer-mount");
  if (!mount) return;
  if (!pe || typeof pe !== "object") {
    mount.innerHTML = "";
    return;
  }
  const bullets = Array.isArray(pe.bullets)
    ? pe.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")
    : "";
  mount.innerHTML = `
    <div class="profit-explainer__inner">
      <h2 class="profit-explainer__title">${escapeHtml(pe.title || "")}</h2>
      <p class="profit-explainer__lead">${escapeHtml(pe.lead || "")}</p>
      <ul class="profit-explainer__list">${bullets}</ul>
    </div>`;
}

let demoToastTimer = 0;

/** @param {string} message */
function showDemoToast(message) {
  let el = document.getElementById("demo-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "demo-toast";
    el.className = "demo-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(demoToastTimer);
  demoToastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 3400);
}

/** @param {string} rawQuery */
function applyCampaignSearch(rawQuery) {
  const tbody =
    document.querySelector("#campaign-table-body") ||
    document.querySelector(".data-table tbody");
  const statusEl = document.getElementById("campaign-search-status");
  if (!tbody) return;

  const q = String(rawQuery || "")
    .trim()
    .toLowerCase();
  const rows = tbody.querySelectorAll("tr[data-search-blob]");
  let visible = 0;

  rows.forEach((tr) => {
    const blob = tr.getAttribute("data-search-blob") || "";
    const match = !q || blob.includes(q);
    tr.classList.toggle("data-table__row--muted", Boolean(q) && !match);
    if (match) visible += 1;
  });

  let empty = tbody.querySelector("tr[data-search-empty]");
  if (q && visible === 0) {
    if (!empty) {
      empty = document.createElement("tr");
      empty.setAttribute("data-search-empty", "1");
      empty.innerHTML =
        '<td colspan="8" class="data-table__empty">No campaigns match this search.</td>';
      tbody.appendChild(empty);
    }
    empty.hidden = false;
  } else if (empty) {
    empty.hidden = true;
  }

  if (statusEl) {
    if (!q) {
      statusEl.textContent = "";
    } else {
      statusEl.textContent = `Showing ${visible} campaign${visible === 1 ? "" : "s"} matching “${rawQuery.trim()}”.`;
    }
  }
}

function setupCampaignSearch() {
  const input = document.querySelector("#dashboard-search-input");
  if (!(input instanceof HTMLInputElement)) return;

  let t = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => applyCampaignSearch(input.value), 120);
  });
}

function setupCampaignControls() {
  const filterSel = document.getElementById("campaign-filter-select");
  const sortSel = document.getElementById("campaign-sort-select");
  const refreshBtn = document.getElementById("campaign-refresh-btn");
  if (filterSel instanceof HTMLSelectElement) {
    filterSel.addEventListener("change", () => renderCampaignRowsWithControls());
  }
  if (sortSel instanceof HTMLSelectElement) {
    sortSel.addEventListener("change", () => renderCampaignRowsWithControls());
  }
  if (refreshBtn instanceof HTMLButtonElement) {
    refreshBtn.addEventListener("click", () => window.location.reload());
  }
}

/**
 * @param {object[]} alerts
 */
function renderNotifyPanel(alerts) {
  const panel = document.getElementById("notify-panel");
  if (!panel) return;
  const slice = (Array.isArray(alerts) ? alerts : []).slice(0, 6);
  if (slice.length === 0) {
    panel.innerHTML =
      '<p class="notify-panel__empty">No active alerts (dismissed items are hidden here too).</p><a class="notify-panel__link" href="#alerts">Go to alerts</a>';
    return;
  }
  panel.innerHTML = `
    <div class="notify-panel__head">
      <span class="notify-panel__title">Recent alerts</span>
      <a class="notify-panel__link" href="#alerts">View all</a>
    </div>
    <ul class="notify-panel__list" role="list">
      ${slice
        .map((a) => {
          const meta = a.campaignName
            ? `<span class="notify-panel__meta">${escapeHtml(a.campaignName)}</span>`
            : "";
          return `<li class="notify-panel__item">
            <p class="notify-panel__item-title">${escapeHtml(a.title)}</p>
            ${meta}
          </li>`;
        })
        .join("")}
    </ul>`;
}

function setupNotifications() {
  const btn = document.getElementById("dashboard-notify-btn");
  const panel = document.getElementById("notify-panel");
  const badge = document.getElementById("dashboard-notify-badge");
  if (!(btn instanceof HTMLButtonElement) || !panel) return;

  function close() {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function open() {
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) open();
    else close();
  });

  document.addEventListener("click", (e) => {
    if (!panel.hidden && e.target instanceof Node) {
      const wrap = btn.closest(".dashboard-notify-wrap");
      if (wrap && !wrap.contains(e.target)) close();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return {
    open,
    close,
    setBadgeCount(count) {
      if (!badge) return;
      const n = Math.min(99, Math.max(0, count));
      if (n > 0) {
        badge.hidden = false;
        badge.textContent = String(n);
        badge.classList.add("dashboard-notify__badge--count");
        badge.classList.remove("dashboard-notify__badge--dot");
      } else {
        badge.textContent = "";
        badge.classList.remove("dashboard-notify__badge--count");
        badge.classList.remove("dashboard-notify__badge--dot");
        badge.hidden = true;
      }
    },
  };
}

/** @param {object} shell */
function renderShell(shell, sessionUserName) {
  if (!shell) return;

  const title = document.querySelector(".dashboard-topbar__title");
  if (title) title.textContent = shell.pageTitle ?? "";

  const sub = document.querySelector(".dashboard-topbar__subtitle");
  if (sub) sub.textContent = shell.pageSubtitle ?? "";

  const input = document.querySelector("#dashboard-search-input");
  if (input) input.setAttribute("placeholder", shell.searchPlaceholder ?? "");

  const user = document.querySelector(".dashboard-user__name");
  if (user) {
    user.textContent = sessionUserName || shell.user?.displayName || "";
  }
}

/** @param {object} m */
function renderMeta(m) {
  if (!m) return;
  document.documentElement.dataset.adprofitSchema = m.schemaVersion ?? "";
  document.documentElement.dataset.adprofitEnv = m.environment ?? "";
}

/**
 * @param {{ mode: "loading" | "live" | "demo", message?: string, accountId?: string, currency?: string }} state
 */
function renderCampaignDataState(state) {
  const desc = document.querySelector("#campaigns .dashboard-section__description");
  if (!desc) return;
  if (state.mode === "loading") {
    desc.textContent = "Loading live Meta data…";
    return;
  }
  if (state.mode === "live") {
    const bits = ["Live Meta data"];
    if (state.accountId) bits.push(state.accountId);
    if (state.currency) bits.push(state.currency);
    desc.textContent = bits.join(" · ");
    return;
  }
  desc.textContent =
    state.message ||
    "Using demo data. Live Meta data is currently unavailable.";
}

/**
 * @param {number} roas
 * @returns {{ statusLabel: string, statusTone: "healthy" | "warn" | "risk" }}
 */
function campaignStatusFromRoas(roas) {
  if (roas >= 3) return { statusLabel: "Scaling", statusTone: "healthy" };
  if (roas >= 1.5) return { statusLabel: "Active", statusTone: "warn" };
  return { statusLabel: "Review", statusTone: "risk" };
}

/**
 * @param {unknown[]} campaigns
 */
function normalizeLiveCampaignRows(campaigns) {
  return (Array.isArray(campaigns) ? campaigns : [])
    .map((c, idx) => {
      const name =
        typeof c?.campaignName === "string" && c.campaignName.trim()
          ? c.campaignName.trim()
          : `Campaign ${idx + 1}`;
      const id =
        typeof c?.campaignId === "string" && c.campaignId.trim()
          ? c.campaignId.trim()
          : `live_${idx + 1}`;
      const spend = Number(c?.spend) || 0;
      const purchases = Number(c?.purchases) || 0;
      const revenue = Number(c?.purchaseValue) || 0;
      const currency =
        typeof c?.currency === "string" && c.currency.trim()
          ? c.currency.trim()
          : null;
      const roas =
        Number.isFinite(Number(c?.roas)) && Number(c?.roas) > 0
          ? Number(c.roas)
          : spend > 0
            ? revenue / spend
            : 0;
      const cpa =
        purchases > 0
          ? spend / purchases
          : Number.isFinite(Number(c?.cpc))
            ? Number(c.cpc)
            : null;
      // Placeholder profitability rule for prototype dashboard mapping.
      const estimatedProfit = revenue * 0.35 - spend;
      const status = campaignStatusFromRoas(roas);
      return {
        id,
        externalId: id,
        name,
        spend,
        purchases,
        revenue,
        costs: { product: 0, shipping: 0, fees: 0 },
        estimatedProfit,
        roas,
        cpa,
        currency,
        statusLabel: status.statusLabel,
        statusTone: status.statusTone,
        tags: ["live-meta"],
      };
    })
    .filter((c) => c.id);
}

/**
 * @param {ReturnType<typeof getDashboardPayload> & { alerts?: unknown[], insights?: unknown[] }} payload
 * @param {ReturnType<typeof normalizeLiveCampaignRows>} campaigns
 * @param {{ accountId?: string, currency?: string }} info
 */
function applyLiveCampaignData(payload, campaigns, info) {
  if (!Array.isArray(campaigns) || campaigns.length === 0) return payload;
  const currency =
    info.currency ||
    campaigns.find((c) => typeof c?.currency === "string")?.currency ||
    payload.portfolioMetrics?.currency ||
    payload.workspace?.currency ||
    "USD";
  const totals = campaigns.reduce(
    (acc, c) => {
      acc.spend += c.spend || 0;
      acc.revenue += c.revenue || 0;
      acc.purchases += c.purchases || 0;
      acc.estimatedProfit += c.estimatedProfit || 0;
      return acc;
    },
    { spend: 0, revenue: 0, purchases: 0, estimatedProfit: 0 }
  );
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const cpa = totals.purchases > 0 ? totals.spend / totals.purchases : 0;
  const margin = totals.revenue > 0 ? totals.estimatedProfit / totals.revenue : 0;
  return {
    ...payload,
    campaigns,
    portfolioMetrics: {
      ...(payload.portfolioMetrics || {}),
      currency,
      totalSpend: totals.spend,
      revenue: totals.revenue,
      purchases: totals.purchases,
      roas,
      cpa,
      estimatedProfit: totals.estimatedProfit,
      margin,
    },
    _campaignDataState: {
      mode: "live",
      accountId: info.accountId || "",
      currency,
    },
  };
}

/**
 * @param {string} base
 */
async function fetchLiveMetaCampaigns(base) {
  const url = `${base}/v1/integrations/meta/campaigns`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "omit",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error("meta_campaigns_unavailable");
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * @param {string} key
 * @param {string} fallback
 */
function safeStorageRead(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} value
 */
function safeStorageWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} base
 */
async function fetchMetaAccounts(base) {
  const res = await fetch(`${base}/v1/integrations/meta/accounts`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "omit",
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * @param {string} base
 */
async function fetchMetaConnection(base) {
  const res = await fetch(`${base}/v1/integrations/meta/connection`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "omit",
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * @param {string} base
 * @param {{ accountId: string, accountName?: string | null, currency?: string | null, timezoneName?: string | null }} body
 */
async function connectMetaAccount(base, body) {
  const res = await fetch(`${base}/v1/integrations/meta/connect`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    credentials: "omit",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * @param {string} message
 */
function renderMetaPanelInfo(message) {
  const panel = document.getElementById("meta-connection-panel");
  if (!panel) return;
  panel.innerHTML = `<p class="dashboard-empty">${escapeHtml(message)}</p>`;
}

/**
 * @param {string} base
 * @param {{ accountId: string, accountName?: string | null, currency?: string | null, timezoneName?: string | null, connectedAt?: string }} connection
 */
function renderConnectedMetaPanel(base, connection) {
  const panel = document.getElementById("meta-connection-panel");
  if (!panel) return;
  const connectedAt = connection?.connectedAt
    ? new Date(connection.connectedAt).toLocaleString()
    : "Unknown";
  const lastSync =
    typeof connection?.lastSyncAt === "string" && connection.lastSyncAt
      ? new Date(connection.lastSyncAt).toLocaleString()
      : safeStorageRead(LIVE_META_STATE_KEY, "Not synced yet");
  panel.innerHTML = `
    <article class="integration-card integration-card--meta-live">
      <h3 class="integration-card__name">Meta Ads connected</h3>
      <p class="integration-card__detail">${escapeHtml(connection.accountName || "Selected ad account")}</p>
      <p class="integration-card__meta">Account: ${escapeHtml(connection.accountId || "—")} · Currency: ${escapeHtml(connection.currency || "—")} · Timezone: ${escapeHtml(connection.timezoneName || "—")}</p>
      <p class="integration-card__meta">Last synced: ${escapeHtml(lastSync)} · Connected: ${escapeHtml(connectedAt)}</p>
      <div class="integration-card__actions">
        <button type="button" class="integration-card__btn" id="meta-change-account-btn">Change account</button>
        <button type="button" class="integration-card__btn integration-card__btn--primary" id="meta-refresh-btn">Refresh data</button>
      </div>
    </article>`;

  const changeBtn = document.getElementById("meta-change-account-btn");
  if (changeBtn instanceof HTMLButtonElement) {
    changeBtn.addEventListener("click", () => hydrateMetaIntegrationUx(base, true));
  }

  const refreshBtn = document.getElementById("meta-refresh-btn");
  if (refreshBtn instanceof HTMLButtonElement) {
    refreshBtn.addEventListener("click", () => {
      window.location.reload();
    });
  }
}

/**
 * @param {string} base
 * @param {Array<any>} accounts
 */
function renderMetaAccountChooser(base, accounts) {
  const panel = document.getElementById("meta-connection-panel");
  if (!panel) return;
  panel.innerHTML = `
    <article class="integration-card integration-card--meta-live">
      <h3 class="integration-card__name">Select Meta ad account</h3>
      <p class="integration-card__detail">Choose which account to connect for live campaign analytics.</p>
      <ul class="meta-account-list">
        ${accounts
          .map(
            (a) => `
          <li class="meta-account-list__item">
            <div class="meta-account-list__body">
              <p class="meta-account-list__title">${escapeHtml(a.name || a.account_id || a.id || "Ad account")}</p>
              <p class="meta-account-list__meta">${escapeHtml(a.id || "—")} · ${escapeHtml(a.currency || "—")} · ${escapeHtml(a.timezone_name || "—")}</p>
            </div>
            <button type="button" class="integration-card__btn integration-card__btn--primary" data-meta-connect="${escapeHtml(a.id || "")}">Connect</button>
          </li>`
          )
          .join("")}
      </ul>
    </article>`;

  panel.querySelectorAll("[data-meta-connect]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-meta-connect");
      const account = accounts.find((a) => a.id === id);
      if (!account || !id) return;
      btn.setAttribute("disabled", "true");
      const { res } = await connectMetaAccount(base, {
        accountId: id,
        accountName: account.name || "",
        currency: account.currency || "",
        timezoneName: account.timezone_name || "",
      });
      if (!res.ok) {
        showDemoToast("Could not connect selected account right now.");
        btn.removeAttribute("disabled");
        return;
      }
      showDemoToast("Meta account connected.");
      window.location.reload();
    });
  });
}

/**
 * @param {string} base
 * @param {boolean} [forceChooser=false]
 */
async function hydrateMetaIntegrationUx(base, forceChooser = false) {
  if (!base) {
    renderMetaPanelInfo("Set API base to connect Meta Ads.");
    return;
  }
  renderMetaPanelInfo("Checking Meta connection…");

  if (!forceChooser) {
    const conn = await fetchMetaConnection(base);
    if (conn.res.ok && conn.data?.connection) {
      renderConnectedMetaPanel(base, conn.data.connection);
      return;
    }
  }

  const accountsRes = await fetchMetaAccounts(base);
  if (accountsRes.res.status === 401) {
    const panel = document.getElementById("meta-connection-panel");
    if (!panel) return;
    const err = accountsRes.data?.error;
    const isToken =
      err === "meta_token_invalid" ||
      err === "meta_token_missing" ||
      err === "meta_no_token";
    const title = isToken ? "Reconnect Meta Ads" : "Connect Meta Ads";
    const detail = isToken
      ? "Your Meta session expired or is missing. Re-authorize to continue loading live data."
      : "Authorize Meta to discover ad accounts and pull campaign insights.";
    panel.innerHTML = `
      <article class="integration-card integration-card--meta-live">
        <h3 class="integration-card__name">${escapeHtml(title)}</h3>
        <p class="integration-card__detail">${escapeHtml(detail)}</p>
        <div class="integration-card__actions">
          <a class="integration-card__btn integration-card__btn--primary" href="${escapeHtml(`${base}/v1/integrations/meta/start`)}">${escapeHtml(isToken ? "Reconnect Meta Ads" : "Connect Meta Ads")}</a>
        </div>
      </article>`;
    return;
  }

  if (!accountsRes.res.ok) {
    renderMetaPanelInfo(
      typeof accountsRes.data?.message === "string"
        ? accountsRes.data.message
        : "Could not load Meta ad accounts right now."
    );
    return;
  }

  if (accountsRes.res.ok && Array.isArray(accountsRes.data?.accounts) && accountsRes.data.accounts.length > 0) {
    renderMetaAccountChooser(base, accountsRes.data.accounts);
    return;
  }

  const panel = document.getElementById("meta-connection-panel");
  if (!panel) return;
  panel.innerHTML = `
    <article class="integration-card integration-card--meta-live">
      <h3 class="integration-card__name">Connect Meta Ads</h3>
      <p class="integration-card__detail">Authorize Meta to discover ad accounts and pull campaign insights.</p>
      <div class="integration-card__actions">
        <a class="integration-card__btn integration-card__btn--primary" href="${escapeHtml(`${base}/v1/integrations/meta/start`)}">Connect Meta Ads</a>
      </div>
    </article>`;
}

/** @type {{ setBadgeCount?: (n: number) => void } | null} */
let notifyUi = null;
/** @type {any | null} */
let latestRenderedPayload = null;

/**
 * Hydrate dashboard from payload (allows future API injection).
 * @param {ReturnType<typeof getDashboardPayload>} payload
 */
export function renderDashboard(payload, sessionDisplayName) {
  latestRenderedPayload = payload;
  const currency =
    payload.portfolioMetrics?.currency ||
    payload.workspace?.currency ||
    "USD";

  renderMeta(payload.meta);
  renderShell(payload.dashboardShell, sessionDisplayName);
  renderProfitExplainer(payload.profitExplainer);
  renderMetrics(payload.portfolioMetrics, payload.reportingPeriod);

  const perfDesc = document.getElementById("performance-section-desc");
  const series = payload.performanceSeries;
  if (perfDesc && series?.points?.length) {
    perfDesc.textContent = `Daily spend vs revenue · ${series.points.length} ${series.granularity || "day"} points`;
  }

  renderPerformanceSummary(payload.performanceLastSevenDays, currency);

  const chartMount = document.getElementById("performance-chart-mount");
  if (chartMount) {
    chartMount.removeAttribute("aria-busy");
    renderSpendRevenueChart(chartMount, series || { points: [] });
  }

  currentCampaignRows = Array.isArray(payload.campaigns) ? payload.campaigns : [];
  renderCampaignTable(getCampaignRowsAfterControls(currentCampaignRows), currency);

  dashboardAlerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  renderAlerts(dashboardAlerts);
  const activeAlertList = filterActiveAlerts(dashboardAlerts);
  renderNotifyPanel(activeAlertList);
  notifyUi?.setBadgeCount?.(activeAlertList.length);

  renderInsights(Array.isArray(payload.insights) ? payload.insights : []);
  renderIntegrations(
    Array.isArray(payload.integrations) ? payload.integrations : []
  );
  renderProfitability(payload.profitabilityOverview);

  document.body.classList.remove("dashboard--loading");
}

/**
 * Load dashboard JSON from API when configured, else mock + rule engine.
 * @returns {Promise<ReturnType<typeof getDashboardPayload> & { alerts: unknown[], insights: unknown[] }>}
 */
async function loadDashboardPayload() {
  const session = getSession();
  const base = getApiBase();

  if (base) {
    try {
      const wid = getWorkspaceIdForApi(session);
      const url = `${base}/v1/workspaces/${encodeURIComponent(wid)}/dashboard`;
      /** @type {Record<string, string>} */
      const headers = { Accept: "application/json" };
      if (session?.accessToken) {
        headers.Authorization = `Bearer ${session.accessToken}`;
      }
      const res = await fetch(url, {
        headers,
        credentials: "omit",
        cache: "no-store",
      });
      if (res.status === 401) {
        // Non-blocking fallback: keep dashboard usable with demo/live Meta campaigns
        // even when auth token is missing/expired.
        throw new Error("dashboard_api_unauthorized");
      }
      if (res.ok) {
        const data = await res.json();
        const okShape =
          data &&
          Array.isArray(data.campaigns) &&
          data.workspace &&
          data.portfolioMetrics &&
          Array.isArray(data.alerts) &&
          Array.isArray(data.insights);
        if (okShape) {
          data.meta = {
            ...(data.meta || {}),
            environment: "api",
          };
          data._campaignDataState = { mode: "demo" };
          try {
            const live = await fetchLiveMetaCampaigns(base);
            const mapped = normalizeLiveCampaignRows(live?.campaigns);
            if (mapped.length > 0) {
              safeStorageWrite(LIVE_META_STATE_KEY, new Date().toLocaleString());
              return applyLiveCampaignData(data, mapped, {
                accountId:
                  typeof live?.accountId === "string" ? live.accountId : "",
                currency:
                  typeof mapped[0]?.currency === "string"
                    ? mapped[0].currency
                    : data.portfolioMetrics?.currency || "USD",
              });
            }
          } catch (liveErr) {
            console.warn(
              "[AdProfit] Live Meta campaigns unavailable — using dashboard payload campaigns.",
              liveErr
            );
            data._campaignDataState = {
              mode: "demo",
              message: "Using demo data. Live Meta data is unavailable right now.",
            };
          }
          return data;
        }
      }
    } catch (err) {
      console.warn("[AdProfit] Dashboard API unreachable — using embedded mock data.", err);
    }
  }

  const payload = getDashboardPayload();
  const { alerts, insights } = runInsightsEngine(payload, {
    signals: DEMO_SIGNALS,
  });
  if (base) {
    try {
      const live = await fetchLiveMetaCampaigns(base);
      const mapped = normalizeLiveCampaignRows(live?.campaigns);
      if (mapped.length > 0) {
        safeStorageWrite(LIVE_META_STATE_KEY, new Date().toLocaleString());
        return applyLiveCampaignData({ ...payload, alerts, insights }, mapped, {
          accountId: typeof live?.accountId === "string" ? live.accountId : "",
          currency:
            typeof mapped[0]?.currency === "string" ? mapped[0].currency : "USD",
        });
      }
    } catch (liveErr) {
      console.warn("[AdProfit] Live Meta campaigns unavailable — using embedded demo data.", liveErr);
      return {
        ...payload,
        alerts,
        insights,
        _campaignDataState: {
          mode: "demo",
          message: "Using demo data. Live Meta data is unavailable right now.",
        },
      };
    }
  }
  return { ...payload, alerts, insights, _campaignDataState: { mode: "demo" } };
}

/**
 * @param {Awaited<ReturnType<typeof loadDashboardPayload>>} payload
 * @returns {payload is NonNullable<typeof payload>}
 */
function isDashboardPayload(payload) {
  return payload != null;
}

async function init() {
  assertAuthenticatedAppShell();

  const session = getSession();
  const sessionDisplayName = session?.displayName;

  notifyUi = setupNotifications();
  renderCampaignDataState({ mode: "loading" });

  const payload = await loadDashboardPayload();
  if (!isDashboardPayload(payload)) return;

  renderDashboard(payload, sessionDisplayName);
  renderCampaignDataState(
    payload._campaignDataState || { mode: "demo", message: "Using demo data." }
  );

  setupCampaignControls();
  setupCampaignSearch();
  applyCampaignSearch("");
  const base = getApiBase();
  const metaOAuth = consumeMetaOAuthQueryParams();
  if (metaOAuth === "connected") {
    showDemoToast("Meta connected. Loading your ad accounts…");
  } else if (metaOAuth === "select-account") {
    showDemoToast("Choose the Meta ad account to use for this workspace.");
  } else if (metaOAuth === "denied") {
    showDemoToast("Meta login was cancelled.");
  } else if (metaOAuth === "oauth_error") {
    showDemoToast("Meta sign-in did not complete. Try again.");
  }
  hydrateMetaIntegrationUx(base, metaOAuth === "select-account").catch((e) => {
    console.warn("[AdProfit] Meta integration panel failed to load.", e);
    renderMetaPanelInfo("Could not load Meta connection status.");
  });

  const restoreAlerts = document.getElementById("alerts-restore-dismissed");
  if (restoreAlerts instanceof HTMLButtonElement) {
    restoreAlerts.addEventListener("click", () => {
      writeDismissedAlertIds([]);
      renderAlerts(dashboardAlerts);
      const active = filterActiveAlerts(dashboardAlerts);
      renderNotifyPanel(active);
      notifyUi?.setBadgeCount?.(active.length);
      showDemoToast("Dismissed alerts restored.");
    });
  }
  updateAlertsToolbar();

  const signOut = document.getElementById("dashboard-sign-out");
  if (signOut instanceof HTMLButtonElement) {
    signOut.addEventListener("click", () => signOutToLogin());
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => console.error("[AdProfit] Dashboard init failed", err));
  });
} else {
  init().catch((err) => console.error("[AdProfit] Dashboard init failed", err));
}
