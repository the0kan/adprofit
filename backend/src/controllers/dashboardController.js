/**
 * Workspace dashboard handler.
 */
import { getDashboardForMember } from "../services/dashboardService.js";

/**
 * GET /v1/workspaces/:workspaceId/dashboard
 */
export async function getWorkspaceDashboard(req, res) {
  const workspaceId = String(req.params.workspaceId ?? "").trim();
  if (!workspaceId) {
    return res.status(400).json({
      error: "invalid_workspace",
      message: "Workspace id is required.",
    });
  }

  try {
    const payload = await getDashboardForMember(workspaceId, req.user.id);
    return res.json(payload);
  } catch (e) {
    if (e && e.code === "forbidden") {
      return res.status(403).json({
        error: "forbidden",
        message: "You do not have access to this workspace.",
      });
    }
    console.error("[dashboard]", e);
    return res.status(500).json({
      error: "server_error",
      message: "Could not load dashboard.",
    });
  }
}
