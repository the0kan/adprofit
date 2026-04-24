/**
 * Meta OAuth routes.
 */
import { Router } from "express";
import {
  getMetaConnection,
  getMetaStart,
  getMetaCallback,
  getMetaAccounts,
  getMetaCampaigns,
  postMetaConnect,
} from "./meta.controller.js";

const router = Router();

router.get("/start", getMetaStart);
router.get("/callback", getMetaCallback);
router.get("/accounts", getMetaAccounts);
router.get("/campaigns", getMetaCampaigns);
router.post("/connect", postMetaConnect);
router.get("/connection", getMetaConnection);

export default router;
