import {
  createCheckoutSessionPlaceholder,
  handleStripeWebhookPlaceholder,
} from "./stripe.service.js";

/**
 * POST /v1/billing/create-checkout-session
 */
export function postCreateCheckoutSession(_req, res) {
  const result = createCheckoutSessionPlaceholder();
  if (!result.ok && result.code === "stripe_not_configured") {
    return res.status(503).json({
      success: false,
      error: result.code,
      message: result.message,
    });
  }
  return res.status(501).json({
    success: false,
    error: result.code,
    message: result.message,
  });
}

/**
 * POST /v1/billing/webhook
 */
export function postStripeWebhook(_req, res) {
  const result = handleStripeWebhookPlaceholder();
  if (!result.ok && result.code === "stripe_not_configured") {
    return res.status(503).json({
      success: false,
      error: result.code,
      message: result.message,
    });
  }
  return res.status(501).json({
    success: false,
    error: result.code,
    message: result.message,
  });
}
