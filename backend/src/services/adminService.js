import { prisma } from "../lib/prisma.js";
import { ConnectionProvider } from "@prisma/client";
import { getPrototypeMetaConnection } from "../integrations/meta/meta.prototype-token-store.js";

function isConfigured(name) {
  return Boolean(process.env[name]?.trim());
}

async function safeCount(model, where) {
  try {
    return await model.count(where ? { where } : undefined);
  } catch {
    return 0;
  }
}

async function safeFindMany(model, args) {
  try {
    return await model.findMany(args);
  } catch {
    return [];
  }
}

function baseSystem() {
  return {
    demoMode: true,
    environment: process.env.NODE_ENV || "development",
    frontendUrl: "https://okan-ozkan.eu",
    backendUrl: "https://adprofit.onrender.com",
    corsOrigin: process.env.CORS_ORIGIN || "",
    metaRedirectUri: process.env.META_REDIRECT_URI || "",
    hasMetaAppId: isConfigured("META_APP_ID"),
    hasMetaSecret: isConfigured("META_APP_SECRET"),
    hasStripeKey: isConfigured("STRIPE_SECRET_KEY"),
    hasDatabaseUrl: isConfigured("DATABASE_URL"),
    hasJwtSecret: isConfigured("JWT_SECRET"),
  };
}

export async function getAdminSummaryData() {
  const usersCount = await safeCount(prisma.user);
  const workspacesCount = await safeCount(prisma.workspace);
  let hasPersistedMetaToken = false;
  try {
    hasPersistedMetaToken = Boolean(
      await prisma.connection.findFirst({
        where: {
          provider: ConnectionProvider.META_ADS,
          NOT: { secretEncrypted: null },
        },
        select: { id: true },
      })
    );
  } catch {
    hasPersistedMetaToken = false;
  }
  const metaConnectedCount = await safeCount(prisma.connection, {
    provider: ConnectionProvider.META_ADS,
    status: "CONNECTED",
    externalRef: { not: null },
  });
  const protoMeta = getPrototypeMetaConnection();

  return {
    success: true,
    demoMode: true,
    summary: {
      totalUsers: usersCount || 1,
      totalWorkspaces: workspacesCount || 1,
      connectedMetaAccounts:
        metaConnectedCount +
        (!hasPersistedMetaToken && protoMeta?.accountId ? 1 : 0),
      activeDemoSessions: 1,
      backendStatus: "online",
      stripeConfigured: isConfigured("STRIPE_SECRET_KEY"),
      metaConfigured:
        isConfigured("META_APP_ID") &&
        isConfigured("META_APP_SECRET") &&
        isConfigured("META_REDIRECT_URI"),
      databaseConfigured: isConfigured("DATABASE_URL"),
    },
  };
}

export async function getAdminUsersData() {
  const users = await safeFindMany(prisma.user, {
    orderBy: { createdAt: "desc" },
    include: {
      memberships: {
        include: { workspace: true },
      },
    },
    take: 100,
  });

  if (users.length === 0) {
    return {
      success: true,
      demoMode: true,
      users: [
        {
          id: "usr_demo",
          email: "demo@adprofit.local",
          name: "Demo User",
          workspace: "adprofit-demo",
          role: "OWNER",
          createdAt: new Date().toISOString(),
          lastLogin: "Demo session",
          status: "active",
        },
      ],
    };
  }

  return {
    success: true,
    demoMode: true,
    users: users.map((u) => {
      const primary = u.memberships[0];
      return {
        id: u.id,
        email: u.email,
        name: u.name || "",
        workspace: primary?.workspace?.name || "",
        role: primary?.role || "MEMBER",
        createdAt: u.createdAt,
        lastLogin: "N/A",
        status: "active",
      };
    }),
  };
}

export async function getAdminWorkspacesData() {
  const workspaces = await safeFindMany(prisma.workspace, {
    orderBy: { createdAt: "desc" },
    include: {
      members: {
        include: { user: true },
        where: { role: "OWNER" },
        take: 1,
      },
      connections: true,
    },
    take: 100,
  });

  if (workspaces.length === 0) {
    return {
      success: true,
      demoMode: true,
      workspaces: [
        {
          id: "ws_demo",
          name: "AdProfit Demo Workspace",
          ownerEmail: "demo@adprofit.local",
          plan: "starter",
          createdAt: new Date().toISOString(),
          connectedIntegrations: 1,
        },
      ],
    };
  }

  return {
    success: true,
    demoMode: true,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      ownerEmail: w.members[0]?.user?.email || "",
      plan: "starter",
      createdAt: w.createdAt,
      connectedIntegrations: w.connections.length,
    })),
  };
}

export async function getAdminIntegrationsData() {
  let hasPersistedMetaToken = false;
  try {
    const tok = await prisma.connection.findFirst({
      where: {
        provider: ConnectionProvider.META_ADS,
        NOT: { secretEncrypted: null },
      },
      select: { id: true },
    });
    hasPersistedMetaToken = Boolean(tok);
  } catch {
    hasPersistedMetaToken = false;
  }

  const dbConnections = await safeFindMany(prisma.connection, {
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      provider: true,
      status: true,
      displayLabel: true,
      externalRef: true,
      currency: true,
      connectedAt: true,
      createdAt: true,
      lastSuccessSyncAt: true,
      workspace: { select: { name: true, slug: true } },
    },
  });

  const metaRows = dbConnections.filter(
    (c) => c.provider === ConnectionProvider.META_ADS
  );

  const protoMeta = getPrototypeMetaConnection();
  const protoRows =
    !hasPersistedMetaToken && protoMeta?.accountId
      ? [
          {
            provider: "META_ADS",
            accountName: protoMeta.accountName || "Prototype Meta account",
            accountId: protoMeta.accountId,
            currency: protoMeta.currency || "",
            workspaceName: "Prototype (in-memory)",
            workspaceSlug: "",
            status: "CONNECTED",
            connectedAt: protoMeta.connectedAt || "",
            lastSync: "Prototype",
            source: "prototype",
          },
        ]
      : [];

  const dbMetaIntegrations = metaRows.map((c) => ({
    provider: c.provider,
    accountName: c.displayLabel || "",
    accountId: c.externalRef || "",
    currency: c.currency || "",
    workspaceName: c.workspace?.name || "",
    workspaceSlug: c.workspace?.slug || "",
    status: c.status,
    connectedAt: (c.connectedAt || c.createdAt).toISOString(),
    lastSync: c.lastSuccessSyncAt?.toISOString() || "",
    source: "database",
  }));

  const rows = [...dbMetaIntegrations, ...protoRows];

  return {
    success: true,
    demoMode: !hasPersistedMetaToken,
    integrations: rows,
  };
}

export async function getAdminSystemData() {
  return {
    success: true,
    ...baseSystem(),
  };
}
