/**
 * Meta OAuth HTTP helpers.
 */
import { getMetaConfig } from "../../config/meta.config.js";

/**
 * @param {string} state
 * @returns {string}
 */
export function buildMetaOAuthUrl(state) {
  const cfg = getMetaConfig();
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", cfg.appId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Exchange auth code for a user access token.
 * Never log or return the access token from route handlers.
 * @param {string} code
 * @returns {Promise<{ accessToken: string, tokenType?: string, expiresIn?: number }>}
 */
export async function exchangeCodeForToken(code) {
  const cfg = getMetaConfig();
  const url = new URL(
    `https://graph.facebook.com/${cfg.apiVersion}/oauth/access_token`
  );
  url.searchParams.set("client_id", cfg.appId);
  url.searchParams.set("client_secret", cfg.appSecret);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    const err = new Error("meta_token_exchange_failed");
    err.code = "meta_token_exchange_failed";
    err.status = 502;
    err.metaStatus = res.status;
    err.metaError =
      typeof data?.error?.message === "string" ? data.error.message : null;
    throw err;
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresIn:
      typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

const AD_ACCOUNT_FIELDS =
  "id,account_id,name,currency,timezone_name";
const CAMPAIGN_INSIGHTS_FIELDS =
  "campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,cpm,cpc,ctr,actions,action_values";

/**
 * Normalize a single Graph `AdAccount` node for API responses (no secrets).
 * @param {Record<string, unknown>} raw
 * @returns {{
 *   id: string,
 *   account_id: string,
 *   name: string | null,
 *   currency: string | null,
 *   timezone_name: string | null,
 *   business_name: string | null,
 * }}
 */
export function normalizeAdAccount(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      id: "",
      account_id: "",
      name: null,
      currency: null,
      timezone_name: null,
      business_name: null,
    };
  }

  return {
    id: typeof raw.id === "string" ? raw.id : "",
    account_id: typeof raw.account_id === "string" ? raw.account_id : "",
    name: typeof raw.name === "string" ? raw.name : null,
    currency: typeof raw.currency === "string" ? raw.currency : null,
    timezone_name:
      typeof raw.timezone_name === "string" ? raw.timezone_name : null,
    business_name: null,
  };
}

/**
 * List ad accounts the granted user can access (Marketing API / Graph).
 * GET /{api-version}/me/adaccounts
 *
 * @param {string} userAccessToken
 * @returns {Promise<{ accounts: ReturnType<typeof normalizeAdAccount>[] }>}
 */
export async function fetchAccessibleAdAccounts(userAccessToken) {
  const cfg = getMetaConfig();
  const token = String(userAccessToken || "").trim();
  if (!token) {
    const err = new Error("missing_access_token");
    err.code = "missing_access_token";
    err.status = 400;
    throw err;
  }

  /** @type {ReturnType<typeof normalizeAdAccount>[]} */
  const accounts = [];
  let nextUrl = new URL(
    `https://graph.facebook.com/${cfg.apiVersion}/me/adaccounts`
  );
  nextUrl.searchParams.set("fields", AD_ACCOUNT_FIELDS);
  nextUrl.searchParams.set("access_token", token);
  nextUrl.searchParams.set("limit", "100");

  while (nextUrl) {
    const res = await fetch(nextUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.error) {
      const metaMessage =
        typeof data?.error?.message === "string" ? data.error.message : null;
      const metaCode =
        typeof data?.error?.code === "number" ? data.error.code : null;
      const metaType =
        typeof data?.error?.type === "string" ? data.error.type : null;
      console.warn(
        "[meta-adaccounts] graph fetch failed",
        JSON.stringify({
          status: res.status,
          metaCode,
          metaType,
          metaMessage,
        })
      );
      const err = new Error("meta_adaccounts_fetch_failed");
      err.code = "meta_adaccounts_fetch_failed";
      err.status = 502;
      err.metaStatus = res.status;
      err.metaMessage = metaMessage;
      err.metaCode = metaCode;
      err.metaType = metaType;
      throw err;
    }

    const batch = Array.isArray(data?.data) ? data.data : [];
    for (const row of batch) {
      const normalized = normalizeAdAccount(row);
      if (normalized.id) accounts.push(normalized);
    }

    const next = data?.paging?.next;
    nextUrl =
      typeof next === "string" && next.length > 0 ? new URL(next) : null;
  }

  return { accounts };
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
function parseMetricNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * @param {unknown} list
 * @returns {number}
 */
function extractPurchaseMetric(list) {
  if (!Array.isArray(list)) return 0;
  let total = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const actionType =
      typeof item.action_type === "string" ? item.action_type : "";
    if (actionType !== "purchase" && actionType !== "omni_purchase") continue;
    total += parseMetricNumber(item.value);
  }
  return total;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ currency?: string | null }} [opts]
 * @returns {{
 *   campaignId: string,
 *   campaignName: string | null,
 *   spend: number,
 *   impressions: number,
 *   clicks: number,
 *   reach: number,
 *   frequency: number,
 *   cpm: number,
 *   cpc: number,
 *   ctr: number,
 *   purchases: number,
 *   purchaseValue: number,
 *   roas: number,
 *   currency: string | null,
 * }}
 */
export function normalizeCampaignInsight(raw, opts = {}) {
  if (!raw || typeof raw !== "object") {
    return {
      campaignId: "",
      campaignName: null,
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      frequency: 0,
      cpm: 0,
      cpc: 0,
      ctr: 0,
      purchases: 0,
      purchaseValue: 0,
      roas: 0,
      currency: typeof opts.currency === "string" ? opts.currency : null,
    };
  }

  const spend = parseMetricNumber(raw.spend);
  const purchaseValue = extractPurchaseMetric(raw.action_values);

  return {
    campaignId: typeof raw.campaign_id === "string" ? raw.campaign_id : "",
    campaignName: typeof raw.campaign_name === "string" ? raw.campaign_name : null,
    spend,
    impressions: parseMetricNumber(raw.impressions),
    clicks: parseMetricNumber(raw.clicks),
    reach: parseMetricNumber(raw.reach),
    frequency: parseMetricNumber(raw.frequency),
    cpm: parseMetricNumber(raw.cpm),
    cpc: parseMetricNumber(raw.cpc),
    ctr: parseMetricNumber(raw.ctr),
    purchases: extractPurchaseMetric(raw.actions),
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
    currency: typeof opts.currency === "string" ? opts.currency : null,
  };
}

/**
 * Fetch campaign-level insights for one ad account.
 * GET /{adAccountId}/insights
 *
 * @param {{ accessToken: string, adAccountId: string, datePreset?: string, currency?: string | null }} input
 * @returns {Promise<{ campaigns: ReturnType<typeof normalizeCampaignInsight>[] }>}
 */
export async function fetchCampaignInsightsForAccount(input) {
  const cfg = getMetaConfig();
  const token = String(input?.accessToken || "").trim();
  const adAccountId = String(input?.adAccountId || "").trim();
  const datePreset = String(input?.datePreset || "last_30d").trim() || "last_30d";

  if (!token) {
    const err = new Error("missing_access_token");
    err.code = "missing_access_token";
    err.status = 400;
    throw err;
  }
  if (!adAccountId) {
    const err = new Error("missing_ad_account_id");
    err.code = "missing_ad_account_id";
    err.status = 400;
    throw err;
  }

  const campaigns = [];
  let nextUrl = new URL(
    `https://graph.facebook.com/${cfg.apiVersion}/${adAccountId}/insights`
  );
  nextUrl.searchParams.set("access_token", token);
  nextUrl.searchParams.set("level", "campaign");
  nextUrl.searchParams.set("date_preset", datePreset);
  nextUrl.searchParams.set("fields", CAMPAIGN_INSIGHTS_FIELDS);
  nextUrl.searchParams.set("limit", "100");

  while (nextUrl) {
    const res = await fetch(nextUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.error) {
      const metaMessage =
        typeof data?.error?.message === "string" ? data.error.message : null;
      const metaCode =
        typeof data?.error?.code === "number" ? data.error.code : null;
      const metaType =
        typeof data?.error?.type === "string" ? data.error.type : null;
      console.warn(
        "[meta-campaigns] graph insights fetch failed",
        JSON.stringify({ status: res.status, metaCode, metaType, metaMessage })
      );

      const err = new Error("meta_campaign_insights_fetch_failed");
      err.code = "meta_campaign_insights_fetch_failed";
      err.status = 502;
      err.metaStatus = res.status;
      err.metaMessage = metaMessage;
      err.metaCode = metaCode;
      err.metaType = metaType;
      throw err;
    }

    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const row of rows) {
      const normalized = normalizeCampaignInsight(row, {
        currency: typeof input?.currency === "string" ? input.currency : null,
      });
      if (normalized.campaignId) campaigns.push(normalized);
    }

    const next = data?.paging?.next;
    nextUrl = typeof next === "string" && next.length > 0 ? new URL(next) : null;
  }

  return { campaigns };
}
