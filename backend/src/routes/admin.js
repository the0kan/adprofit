import { Router } from "express";
import { requireAdminToken } from "../middleware/adminAuth.js";
import {
  getAdminSummary,
  getAdminUsers,
  getAdminWorkspaces,
  getAdminIntegrations,
  getAdminSystem,
} from "../controllers/adminController.js";

const router = Router();

router.use(requireAdminToken);
router.get("/summary", getAdminSummary);
router.get("/users", getAdminUsers);
router.get("/workspaces", getAdminWorkspaces);
router.get("/integrations", getAdminIntegrations);
router.get("/system", getAdminSystem);

export default router;
