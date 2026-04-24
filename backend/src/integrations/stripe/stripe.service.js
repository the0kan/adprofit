/**
 * Stripe billing placeholder service.
 * Real checkout/webhook logic should be implemented after Stripe keys are added.
 */

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function createCheckoutSessionPlaceholder() {
  if (!stripeConfigured()) {
    return {
      ok: false,
      code: "stripe_not_configured",
      message: "Stripe checkout is not configured yet.",
    };
  }

  return {
    ok: false,
    code: "stripe_checkout_not_implemented",
    message: "Stripe checkout integration is not implemented yet.",
  };
}

export function handleStripeWebhookPlaceholder() {
  if (!stripeConfigured()) {
    return {
      ok: false,
      code: "stripe_not_configured",
      message: "Stripe webhook is not configured yet.",
    };
  }

  return {
    ok: false,
    code: "stripe_webhook_not_implemented",
    message: "Stripe webhook handling is not implemented yet.",
  };
}
