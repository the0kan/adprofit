/**
 * Meta (Facebook) Marketing API — OAuth configuration from environment only.
 * Never log or expose META_APP_SECRET.
 */

/**
 * @returns {boolean}
 */
export function isMetaOAuthConfigured() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const redirectUri = process.env.META_REDIRECT_URI?.trim();
  return Boolean(appId && appSecret && redirectUri);
}

/**
 * Returns validated Meta OAuth / API settings. Call only when Meta routes need them.
 * @returns {{
 *   appId: string,
 *   appSecret: string,
 *   redirectUri: string,
 *   apiVersion: string,
 *   scopes: string,
 * }}
 * @throws {Error} If any required variable is missing or blank (message lists names only).
 */
export function getMetaConfig() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const redirectUri = process.env.META_REDIRECT_URI?.trim();
  const apiVersion = (process.env.META_API_VERSION || "v20.0").trim() || "v20.0";
  const scopes =
    (process.env.META_SCOPES || "ads_read").trim() || "ads_read";

  /** @type {string[]} */
  const missing = [];
  if (!appId) missing.push("META_APP_ID");
  if (!appSecret) missing.push("META_APP_SECRET");
  if (!redirectUri) missing.push("META_REDIRECT_URI");

  if (missing.length > 0) {
    throw new Error(
      `Meta OAuth is not configured. Set these environment variables (see backend/.env.example): ${missing.join(", ")}`
    );
  }

  return Object.freeze({
    appId,
    appSecret,
    redirectUri,
    apiVersion,
    scopes,
  });
}
