/**
 * /v1/workspaces/*
 */
import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { getWorkspaceDashboard } from "../controllers/dashboardController.js";

const router = Router();

router.get(
  "/:workspaceId/dashboard",
  authenticate,
  getWorkspaceDashboard
);

export default router;
