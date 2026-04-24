/**
 * ⚠️ PROTOTYPE ONLY — IN-MEMORY META USER ACCESS TOKEN.
 *
 * This is prototype-only. Production must encrypt and persist tokens
 * in the database. Production must also persist selected connections in DB.
 */

/** @type {string | null} */
let prototypeMetaUserAccessToken = null;
/** @type {{ accountId: string, accountName: string | null, currency: string | null, timezoneName: string | null, connectedAt: string } | null} */
let prototypeMetaConnection = null;

/**
 * @param {string} accessToken
 */
export function setPrototypeMetaUserAccessToken(accessToken) {
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    prototypeMetaUserAccessToken = null;
    return;
  }
  prototypeMetaUserAccessToken = accessToken.trim();
}

/**
 * @returns {string | null}
 */
export function getPrototypeMetaUserAccessToken() {
  return prototypeMetaUserAccessToken;
}

export function clearPrototypeMetaUserAccessToken() {
  prototypeMetaUserAccessToken = null;
}

/**
 * ⚠️ PROTOTYPE ONLY — in-memory selected Meta account.
 * Production must persist connection rows in DB and keep tokens encrypted.
 *
 * @param {{ accountId: string, accountName?: string | null, currency?: string | null, timezoneName?: string | null }} input
 */
export function setPrototypeMetaConnection(input) {
  const accountId = String(input?.accountId || "").trim();
  if (!accountId) {
    prototypeMetaConnection = null;
    return;
  }

  prototypeMetaConnection = {
    accountId,
    accountName:
      typeof input.accountName === "string" ? input.accountName.trim() : null,
    currency:
      typeof input.currency === "string" ? input.currency.trim() : null,
    timezoneName:
      typeof input.timezoneName === "string" ? input.timezoneName.trim() : null,
    connectedAt: new Date().toISOString(),
  };
}

/**
 * @returns {{ accountId: string, accountName: string | null, currency: string | null, timezoneName: string | null, connectedAt: string } | null}
 */
export function getPrototypeMetaConnection() {
  return prototypeMetaConnection;
}

export function clearPrototypeMetaConnection() {
  prototypeMetaConnection = null;
}
