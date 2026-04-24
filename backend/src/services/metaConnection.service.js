/**
 * Persistent Meta Ads connection (Prisma `Connection` row, META_ADS).
 * Tokens are stored encrypted in `secretEncrypted` only.
 */
import { prisma } from "../lib/prisma.js";
import {
  encryptMetaAccessToken,
  decryptMetaAccessToken,
} from "../lib/tokenCrypto.js";
import { ConnectionStatus, ConnectionProvider } from "@prisma/client";

/**
 * @param {string} workspaceId
 */
export async function getMetaConnectionForWorkspace(workspaceId) {
  return prisma.connection.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: ConnectionProvider.META_ADS,
      },
    },
  });
}

/**
 * After OAuth: store user access token; account may not be selected yet.
 * @param {string} workspaceId
 * @param {{ accessToken: string, tokenType?: string, expiresIn?: number }} token
 */
export async function saveMetaOAuthToken(workspaceId, token) {
  const encrypted = encryptMetaAccessToken(token.accessToken);
  const expiresAt =
    typeof token.expiresIn === "number" && Number.isFinite(token.expiresIn)
      ? new Date(Date.now() + token.expiresIn * 1000)
      : null;

  return prisma.connection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: ConnectionProvider.META_ADS,
      },
    },
    create: {
      workspaceId,
      provider: ConnectionProvider.META_ADS,
      status: ConnectionStatus.CONNECTING,
      secretEncrypted: encrypted,
      tokenType: token.tokenType || "bearer",
      tokenExpiresAt: expiresAt,
    },
    update: {
      secretEncrypted: encrypted,
      tokenType: token.tokenType || "bearer",
      tokenExpiresAt: expiresAt,
      status: ConnectionStatus.CONNECTING,
      lastError: null,
      externalRef: null,
      displayLabel: null,
      currency: null,
      timezoneName: null,
      connectedAt: null,
    },
  });
}

/**
 * @param {string} workspaceId
 * @returns {Promise<string | null>}
 */
export async function getDecryptedMetaAccessToken(workspaceId) {
  const row = await getMetaConnectionForWorkspace(workspaceId);
  if (!row?.secretEncrypted) return null;
  try {
    return decryptMetaAccessToken(Buffer.from(row.secretEncrypted));
  } catch {
    return null;
  }
}

/**
 * @param {string} workspaceId
 * @param {{ accountId: string, accountName?: string | null, currency?: string | null, timezoneName?: string | null }} input
 */
export async function connectMetaAdAccount(workspaceId, input) {
  const row = await getMetaConnectionForWorkspace(workspaceId);
  if (!row?.secretEncrypted) {
    return { ok: false, reason: "meta_token_missing" };
  }

  const accountId = String(input?.accountId || "").trim();
  if (!accountId) {
    return { ok: false, reason: "invalid_account_id" };
  }

  const updated = await prisma.connection.update({
    where: { id: row.id },
    data: {
      externalRef: accountId,
      displayLabel:
        typeof input.accountName === "string" ? input.accountName : null,
      currency: typeof input.currency === "string" ? input.currency : null,
      timezoneName:
        typeof input.timezoneName === "string" ? input.timezoneName : null,
      status: ConnectionStatus.CONNECTED,
      connectedAt: new Date(),
      lastError: null,
    },
  });

  return {
    ok: true,
    connection: {
      accountId: updated.externalRef || "",
      accountName: updated.displayLabel,
      currency: updated.currency,
      timezoneName: updated.timezoneName,
      connectedAt: updated.connectedAt?.toISOString() || null,
      status: updated.status,
    },
  };
}

/**
 * @param {string} workspaceId
 */
export async function getPublicMetaConnection(workspaceId) {
  const row = await getMetaConnectionForWorkspace(workspaceId);
  if (!row) {
    return { ok: false, reason: "meta_no_connection" };
  }
  if (row.status !== ConnectionStatus.CONNECTED || !row.externalRef) {
    return { ok: false, reason: "meta_no_connection" };
  }
  return {
    ok: true,
    connection: {
      accountId: row.externalRef,
      accountName: row.displayLabel,
      currency: row.currency,
      timezoneName: row.timezoneName,
      connectedAt: row.connectedAt?.toISOString() || null,
      status: row.status,
      lastSyncAt: row.lastSuccessSyncAt?.toISOString() || null,
    },
  };
}

/**
 * @param {string} workspaceId
 * @param {{ status: string, errorMessage?: string | null }} input
 */
export async function appendMetaSyncLog(workspaceId, input) {
  const row = await getMetaConnectionForWorkspace(workspaceId);
  if (!row) return;
  const now = new Date();
  await prisma.metaSyncLog.create({
    data: {
      workspaceId,
      metaConnectionId: row.id,
      type: "CAMPAIGN_INSIGHTS",
      status: input.status,
      startedAt: now,
      finishedAt: now,
      errorMessage: input.errorMessage ?? null,
    },
  });
}

/**
 * @param {string} workspaceId
 */
export async function touchMetaLastSuccessSync(workspaceId) {
  const row = await getMetaConnectionForWorkspace(workspaceId);
  if (!row) return;
  await prisma.connection.update({
    where: { id: row.id },
    data: { lastSuccessSyncAt: new Date(), lastError: null },
  });
}

/**
 * @param {string} workspaceId
 * @param {string} message
 */
export async function setMetaConnectionError(workspaceId, message) {
  const row = await getMetaConnectionForWorkspace(workspaceId);
  if (!row) return;
  await prisma.connection.update({
    where: { id: row.id },
    data: { lastError: message },
  });
}
