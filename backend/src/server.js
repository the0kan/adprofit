/**
 * AdProfit API — HTTP server entry
 * Load env first so DATABASE_URL, JWT_SECRET, Meta keys, etc. are available to all imports.
 */
import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`AdProfit API listening on http://${HOST}:${PORT}`);
  console.log(`  GET  /v1/health`);
  console.log(`  POST /v1/auth/signup`);
  console.log(`  POST /v1/auth/login`);
  console.log(`  GET  /v1/auth/me`);
  console.log(`  GET  /v1/workspaces/:workspaceId/dashboard (Bearer JWT)`);
  console.log(`  GET  /v1/integrations/meta/start`);
  console.log(`  GET  /v1/integrations/meta/callback`);
  console.log(`  GET  /v1/integrations/meta/accounts`);
  console.log(`  POST /v1/integrations/meta/connect`);
  console.log(`  GET  /v1/integrations/meta/connection`);
  console.log(`  GET  /v1/integrations/meta/campaigns`);
  console.log(`  POST /v1/billing/create-checkout-session`);
  console.log(`  POST /v1/billing/webhook`);
  console.log(`  GET  /v1/admin/summary`);
  console.log(`  GET  /v1/admin/users`);
  console.log(`  GET  /v1/admin/workspaces`);
  console.log(`  GET  /v1/admin/integrations`);
  console.log(`  GET  /v1/admin/system`);
});
