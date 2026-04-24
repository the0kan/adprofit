/**
 * Meta OAuth + persistent workspace connection (PostgreSQL / Prisma).
 * OAuth state is in-memory per process; tokens live encrypted in DB only.
 */
import crypto from "node:crypto";
import { getCurrentWorkspaceOrDemo } from "../../lib/workspaceContext.js";
import {
  buildMetaOAuthUrl,
  exchangeCodeForToken,
  fetchAccessibleAdAccounts,
  fetchCampaignInsightsForAccount,
} from "./meta.client.js";
import {
  appendMetaSyncLog,
  connectMetaAdAccount,
  getDecryptedMetaAccessToken,
  getMetaConnectionForWorkspace,
  getPublicMetaConnection,
  saveMetaOAuthToken,
  setMetaConnectionError,
  touchMetaLastSuccessSync,
} from "../../services/metaConnection.service.js";
import { ConnectionStatus } from "@prisma/client";

const STATE_TTL_MS = 10 * 60 * 1000;
/** @type {Map<string, { createdAt: number, consumed: boolean, workspaceId: string }>} */
const oauthStateStore = new Map();

function pruneExpiredStates() {
  const now = Date.now();
  for (const [state, record] of oauthStateStore.entries()) {
    if (record.consumed || now - record.createdAt > STATE_TTL_MS) {
      oauthStateStore.delete(state);
    }
  }
}

/**
 * @returns {Promise<{ state: string, oauthUrl: string, workspaceId: string }>}
 */
export async function createMetaOAuthStart() {
  const workspace = await getCurrentWorkspaceOrDemo();
  pruneExpiredStates();
  const state = crypto.randomBytes(24).toString("hex");
  oauthStateStore.set(state, {
    createdAt: Date.now(),
    consumed: false,
    workspaceId: workspace.id,
  });
  const oauthUrl = buildMetaOAuthUrl(state);
  return { state, oauthUrl, workspaceId: workspace.id };
}

/**
 * @param {string} state
 * @param {string} code
 */
export async function handleMetaOAuthCallback(state, code) {
  pruneExpiredStates();
  const rec = oauthStateStore.get(state);
  if (!rec || rec.consumed) {
    const err = new Error("invalid_state");
    err.code = "invalid_state";
    err.status = 400;
    throw err;
  }
  if (Date.now() - rec.createdAt > STATE_TTL_MS) {
    oauthStateStore.delete(state);
    const err = new Error("state_expired");
    err.code = "state_expired";
    err.status = 400;
    throw err;
  }

  rec.consumed = true;
  oauthStateStore.set(state, rec);
  const workspaceId = rec.workspaceId;

  try {
    const tokenPayload = await exchangeCodeForToken(code);
    await saveMetaOAuthToken(workspaceId, tokenPayload);

    let accounts = [];
    let accountsFetchFailed = false;
    try {
      const r = await fetchAccessibleAdAccounts(tokenPayload.accessToken);
      accounts = r.accounts;
    } catch {
      accountsFetchFailed = true;
    }

    if (!accountsFetchFailed && accounts.length === 1) {
      const a = accounts[0];
      await connectMetaAdAccount(workspaceId, {
        accountId: a.id,
        accountName: a.name,
        currency: a.currency,
        timezoneName: a.timezone_name,
      });
    }

    return {
      tokenReceived: true,
      workspaceId,
      accountsCount: accounts.length,
      accountsFetchFailed,
      singleAccountAutoConnected:
        !accountsFetchFailed && accounts.length === 1,
    };
  } finally {
    oauthStateStore.delete(state);
  }
}

/**
 * @param {import("express").Request} req
 */
export async function listMetaAdAccountsForRequest(req) {
  const workspace = await getCurrentWorkspaceOrDemo(req);
  const token = await getDecryptedMetaAccessToken(workspace.id);
  if (!token) {
    const row = await getMetaConnectionForWorkspace(workspace.id);
    if (!row?.secretEncrypted) {
      return { ok: false, reason: "meta_token_missing", accounts: [] };
    }
    return { ok: false, reason: "meta_token_invalid", accounts: [] };
  }
  try {
    const { accounts } = await fetchAccessibleAdAccounts(token);
    return { ok: true, accounts };
  } catch (e) {
    if (e?.metaStatus === 401 || e?.metaCode === 190) {
      return { ok: false, reason: "meta_token_invalid", accounts: [] };
    }
    throw e;
  }
}

/**
 * @param {import("express").Request} req
 * @param {{ accountId: string, accountName?: string | null, currency?: string | null, timezoneName?: string | null }} input
 */
export async function connectMetaAccountForRequest(req, input) {
  const workspace = await getCurrentWorkspaceOrDemo(req);
  return connectMetaAdAccount(workspace.id, input);
}

/**
 * @param {import("express").Request} req
 */
export async function getMetaConnectionForRequest(req) {
  const workspace = await getCurrentWorkspaceOrDemo(req);
  return getPublicMetaConnection(workspace.id);
}

/**
 * @param {import("express").Request} req
 */
export async function listMetaCampaignInsightsForRequest(req) {
  const workspace = await getCurrentWorkspaceOrDemo(req);
  const row = await getMetaConnectionForWorkspace(workspace.id);

  if (!row) {
    return { ok: false, reason: "meta_no_connection", campaigns: [] };
  }

  if (row.status !== ConnectionStatus.CONNECTED || !row.externalRef) {
    return { ok: false, reason: "meta_no_connection", campaigns: [] };
  }

  const token = await getDecryptedMetaAccessToken(workspace.id);
  if (!token) {
    if (!row.secretEncrypted) {
      return { ok: false, reason: "meta_token_missing", campaigns: [] };
    }
    return { ok: false, reason: "meta_token_invalid", campaigns: [] };
  }

  const { campaigns } = await fetchCampaignInsightsForAccount({
    accessToken: token,
    adAccountId: row.externalRef,
    datePreset: "last_30d",
    currency: row.currency,
  });

  await appendMetaSyncLog(workspace.id, { status: "SUCCESS" });
  await touchMetaLastSuccessSync(workspace.id);

  return {
    ok: true,
    campaigns,
    connection: {
      accountId: row.externalRef,
      accountName: row.displayLabel,
      currency: row.currency,
    },
  };
}

/**
 * When Graph returns 401 on insights, mark connection error (no token in message).
 * @param {import("express").Request} req
 * @param {Error} err
 */
export async function recordMetaCampaignFailure(req, err) {
  try {
    const workspace = await getCurrentWorkspaceOrDemo(req);
    const msg =
      typeof err?.metaMessage === "string"
        ? err.metaMessage
        : "meta_campaign_insights_fetch_failed";
    await appendMetaSyncLog(workspace.id, {
      status: "FAILED",
      errorMessage: msg,
    });
    await setMetaConnectionError(workspace.id, msg);
  } catch {
    /* ignore */
  }
}
