/**
 * Health check
 */
import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "adprofit-api",
    version: "0.2.0",
    time: new Date().toISOString(),
  });
});

export default router;
