/**
 * Workspace dashboard JSON — demo metrics from shared mock + insights engine;
 * workspace metadata from PostgreSQL.
 */
import { getDashboardPayload } from "../../../data.js";
import { runInsightsEngine, DEMO_SIGNALS } from "../../../insights-engine.js";
import { prisma } from "../lib/prisma.js";

/**
 * @param {string} workspaceId
 * @param {string} userId
 */
export async function getDashboardForMember(workspaceId, userId) {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: { workspace: true },
  });

  if (!member) {
    const err = new Error("forbidden");
    err.code = "forbidden";
    throw err;
  }

  const ws = member.workspace;
  const payload = getDashboardPayload();
  const { alerts, insights } = runInsightsEngine(payload, {
    signals: DEMO_SIGNALS,
  });

  const currency = ws.defaultCurrency || "USD";

  const merged = {
    ...payload,
    workspace: {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      currency,
      timezone: ws.timezone,
    },
    portfolioMetrics: {
      ...payload.portfolioMetrics,
      currency,
    },
    reportingPeriod: {
      ...payload.reportingPeriod,
    },
    meta: {
      ...(payload.meta || {}),
      environment: "api",
    },
    alerts,
    insights,
  };

  return merged;
}
