/**
 * Express application (no listen — used by server.js and tests).
 * Ensures env is loaded if this module is imported without server.js (e.g. tests).
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import workspacesRoutes from "./routes/workspaces.js";
import healthRoutes from "./routes/health.js";
import metaRoutes from "./integrations/meta/meta.routes.js";
import stripeRoutes from "./integrations/stripe/stripe.routes.js";
import adminRoutes from "./routes/admin.js";

const app = express();
app.disable("x-powered-by");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const corsRaw = process.env.CORS_ORIGIN?.trim();
let corsOption = true;
if (corsRaw && corsRaw !== "*") {
  const list = corsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) corsOption = list;
}

app.use(
  cors({
    origin: corsOption,
  })
);
app.use(express.json({ limit: "1mb" }));

app.use("/v1/health", healthRoutes);
app.use("/v1/auth", authRoutes);
app.use("/v1/workspaces", workspacesRoutes);
app.use("/v1/integrations/meta", metaRoutes);
app.use("/v1/billing", stripeRoutes);
app.use("/v1/admin", adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

export default app;
