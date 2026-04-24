/**
 * Meta OAuth controller.
 */
import { isMetaOAuthConfigured } from "../../config/meta.config.js";
import {
  connectMetaAccountForRequest,
  createMetaOAuthStart,
  getMetaConnectionForRequest,
  handleMetaOAuthCallback,
  listMetaAdAccountsForRequest,
  listMetaCampaignInsightsForRequest,
  recordMetaCampaignFailure,
} from "./meta.service.js";

function frontendBaseUrl() {
  return (
    process.env.FRONTEND_URL?.trim() || "https://okan-ozkan.eu"
  ).replace(/\/$/, "");
}

function wantsJsonDebug(req) {
  return String(req.query.format || "").toLowerCase() === "json";
}

function redirectToDashboard(res, query) {
  const base = frontendBaseUrl();
  const url = new URL(`${base}/dashboard.html`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return res.redirect(302, url.toString());
}

/**
 * GET /v1/integrations/meta/start
 */
export async function getMetaStart(_req, res) {
  try {
    if (!isMetaOAuthConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Meta OAuth is not configured on this server.",
      });
    }
    const { oauthUrl } = await createMetaOAuthStart();
    console.info("[meta-oauth] start redirect created");
    return res.redirect(302, oauthUrl);
  } catch (e) {
    if (e?.code === "token_encryption_required") {
      return res.status(500).json({
        success: false,
        message:
          "Server misconfiguration: TOKEN_ENCRYPTION_SECRET is required in production.",
      });
    }
    console.warn("[meta-oauth] start failed");
    return res.status(500).json({
      success: false,
      message: "Could not start Meta OAuth flow.",
    });
  }
}

/**
 * GET /v1/integrations/meta/callback
 */
export async function getMetaCallback(req, res) {
  const denied = req.query.error;
  if (denied) {
    if (wantsJsonDebug(req)) {
      return res.status(400).json({
        success: false,
        message: "Meta login was denied or cancelled.",
        tokenReceived: false,
      });
    }
    return redirectToDashboard(res, { meta: "denied" });
  }

  const state = String(req.query.state || "").trim();
  const code = String(req.query.code || "").trim();

  if (!state) {
    if (wantsJsonDebug(req)) {
      return res.status(400).json({
        success: false,
        message: "Missing OAuth state.",
        tokenReceived: false,
      });
    }
    return redirectToDashboard(res, { meta: "oauth_error" });
  }
  if (!code) {
    if (wantsJsonDebug(req)) {
      return res.status(400).json({
        success: false,
        message: "Missing authorization code.",
        tokenReceived: false,
      });
    }
    return redirectToDashboard(res, { meta: "oauth_error" });
  }

  try {
    const result = await handleMetaOAuthCallback(state, code);
    console.info("[meta-oauth] callback token exchange success");

    if (wantsJsonDebug(req)) {
      return res.json({
        success: true,
        message: "Meta OAuth callback handled successfully.",
        tokenReceived: true,
        accountsCount: result.accountsCount,
        accountsFetchFailed: Boolean(result.accountsFetchFailed),
      });
    }

    if (result.accountsFetchFailed) {
      return redirectToDashboard(res, { meta: "select-account" });
    }
    if (result.accountsCount > 1) {
      return redirectToDashboard(res, { meta: "select-account" });
    }
    return redirectToDashboard(res, { meta: "connected" });
  } catch (e) {
    if (e?.code === "invalid_state" || e?.code === "state_expired") {
      if (wantsJsonDebug(req)) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OAuth state.",
          tokenReceived: false,
        });
      }
      return redirectToDashboard(res, { meta: "oauth_error" });
    }

    if (e?.code === "meta_token_exchange_failed") {
      console.warn(
        "[meta-oauth] callback token exchange failed",
        JSON.stringify({ status: e.metaStatus ?? null })
      );
      if (wantsJsonDebug(req)) {
        return res.status(502).json({
          success: false,
          message: "Meta token exchange failed.",
          tokenReceived: false,
        });
      }
      return redirectToDashboard(res, { meta: "oauth_error" });
    }

    console.warn("[meta-oauth] callback unexpected failure");
    if (wantsJsonDebug(req)) {
      return res.status(500).json({
        success: false,
        message: "Meta callback could not be processed.",
        tokenReceived: false,
      });
    }
    return redirectToDashboard(res, { meta: "oauth_error" });
  }
}

/**
 * POST /v1/integrations/meta/connect
 */
export async function postMetaConnect(req, res) {
  try {
    const accountId = String(req.body?.accountId || "").trim();
    const accountName =
      typeof req.body?.accountName === "string" ? req.body.accountName : null;
    const currency =
      typeof req.body?.currency === "string" ? req.body.currency : null;
    const timezoneName =
      typeof req.body?.timezoneName === "string"
        ? req.body.timezoneName
        : null;

    const result = await connectMetaAccountForRequest(req, {
      accountId,
      accountName,
      currency,
      timezoneName,
    });

    if (!result.ok && result.reason === "meta_token_missing") {
      return res.status(401).json({
        success: false,
        error: "meta_token_missing",
        message: "Meta access token is missing. Complete OAuth again.",
      });
    }

    if (!result.ok && result.reason === "invalid_account_id") {
      return res.status(400).json({
        success: false,
        error: "meta_invalid_account_id",
        message: "accountId is required.",
      });
    }

    return res.json({
      success: true,
      message: "Meta ad account connected.",
      connection: result.connection,
    });
  } catch (e) {
    if (e?.code === "token_encryption_required") {
      return res.status(500).json({
        success: false,
        error: "server_misconfigured",
        message:
          "TOKEN_ENCRYPTION_SECRET is required in production to persist Meta tokens.",
      });
    }
    console.warn("[meta-connect] unexpected failure");
    return res.status(500).json({
      success: false,
      error: "meta_connect_failed",
      message: "Could not save Meta account selection.",
    });
  }
}

/**
 * GET /v1/integrations/meta/connection
 */
export async function getMetaConnection(req, res) {
  try {
    const result = await getMetaConnectionForRequest(req);
    if (!result.ok) {
      return res.status(404).json({
        success: false,
        error: "meta_no_connection",
        message: "No Meta account is currently selected.",
      });
    }

    return res.json({
      success: true,
      connection: result.connection,
    });
  } catch (e) {
    if (e?.code === "token_encryption_required") {
      return res.status(500).json({
        success: false,
        error: "server_misconfigured",
        message: "TOKEN_ENCRYPTION_SECRET is required in production.",
      });
    }
    return res.status(500).json({
      success: false,
      error: "meta_connection_read_failed",
      message: "Could not read Meta connection.",
    });
  }
}

/**
 * GET /v1/integrations/meta/campaigns
 */
export async function getMetaCampaigns(req, res) {
  try {
    const result = await listMetaCampaignInsightsForRequest(req);

    if (!result.ok && result.reason === "meta_token_missing") {
      return res.status(401).json({
        success: false,
        error: "meta_token_missing",
        message: "Meta access token is missing. Complete OAuth again.",
      });
    }

    if (!result.ok && result.reason === "meta_token_invalid") {
      return res.status(401).json({
        success: false,
        error: "meta_token_invalid",
        message: "Meta rejected the stored token. Reconnect Meta Ads.",
      });
    }

    if (!result.ok && result.reason === "meta_no_connection") {
      return res.status(400).json({
        success: false,
        error: "meta_no_connection",
        message: "Select a Meta ad account via OAuth and POST /connect.",
      });
    }

    return res.json({
      success: true,
      accountId: result.connection.accountId,
      campaigns: result.campaigns,
      campaignCount: result.campaigns.length,
    });
  } catch (e) {
    await recordMetaCampaignFailure(req, e);

    if (e?.code === "meta_campaign_insights_fetch_failed") {
      if (e.metaStatus === 401 || e.metaCode === 190) {
        return res.status(401).json({
          success: false,
          error: "meta_token_invalid",
          message: "Meta rejected the stored token. Reconnect Meta Ads.",
        });
      }
      return res.status(502).json({
        success: false,
        error: "meta_campaign_insights_fetch_failed",
        message: "Could not fetch Meta campaign insights.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "meta_campaigns_error",
      message: "Could not load Meta campaign insights.",
    });
  }
}

/**
 * GET /v1/integrations/meta/accounts
 */
export async function getMetaAccounts(req, res) {
  try {
    if (!isMetaOAuthConfigured()) {
      return res.status(503).json({
        success: false,
        error: "meta_not_configured",
        message: "Meta OAuth is not configured on this server.",
      });
    }

    const result = await listMetaAdAccountsForRequest(req);
    if (!result.ok && result.reason === "meta_token_missing") {
      return res.status(401).json({
        success: false,
        error: "meta_token_missing",
        message: "Meta access token is missing. Complete OAuth first.",
      });
    }
    if (!result.ok && result.reason === "meta_token_invalid") {
      return res.status(401).json({
        success: false,
        error: "meta_token_invalid",
        message: "Meta rejected the stored token. Reconnect Meta Ads.",
      });
    }

    return res.json({
      success: true,
      accounts: result.accounts,
      accountCount: result.accounts.length,
    });
  } catch (e) {
    if (e?.code === "meta_adaccounts_fetch_failed") {
      console.warn(
        "[meta-accounts] list failed",
        JSON.stringify({ status: e.metaStatus ?? null })
      );
      if (e.metaStatus === 401 || e.metaCode === 190) {
        return res.status(401).json({
          success: false,
          error: "meta_token_invalid",
          message: "Meta rejected the stored token. Reconnect Meta Ads.",
        });
      }
      return res.status(502).json({
        success: false,
        error: "meta_adaccounts_fetch_failed",
        message: "Could not fetch Meta ad accounts.",
      });
    }
    console.warn("[meta-accounts] unexpected failure");
    return res.status(500).json({
      success: false,
      error: "meta_accounts_error",
      message: "Could not list Meta ad accounts.",
    });
  }
}
