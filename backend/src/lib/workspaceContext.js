/**
 * Resolves the workspace used for Meta OAuth in the transitional MVP.
 * Prefer explicit env; otherwise seed slug; otherwise first workspace; otherwise create default.
 *
 * `getCurrentWorkspaceOrDemo(req)` is structured for future JWT/workspace middleware.
 */
import { prisma } from "./prisma.js";

/**
 * @param {import("express").Request} [_req]
 * @returns {Promise<{ id: string, slug: string, name: string }>}
 */
export async function getCurrentWorkspaceOrDemo(_req) {
  return getWorkspaceForMetaOAuth();
}

/**
 * @returns {Promise<{ id: string, slug: string, name: string }>}
 */
export async function getWorkspaceForMetaOAuth() {
  const byId = process.env.DEFAULT_META_WORKSPACE_ID?.trim();
  if (byId) {
    const ws = await prisma.workspace.findUnique({ where: { id: byId } });
    if (ws) return ws;
  }

  const slug =
    process.env.DEFAULT_META_WORKSPACE_SLUG?.trim() || "adprofit-demo";
  let ws = await prisma.workspace.findUnique({ where: { slug } });
  if (ws) return ws;

  ws = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (ws) return ws;

  return prisma.workspace.create({
    data: {
      name: "Default workspace",
      slug: `default-meta-${Date.now()}`,
      defaultCurrency: "USD",
      timezone: "America/Los_Angeles",
    },
  });
}
