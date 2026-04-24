import { Router } from "express";
import {
  postCreateCheckoutSession,
  postStripeWebhook,
} from "./stripe.controller.js";

const router = Router();

router.post("/create-checkout-session", postCreateCheckoutSession);
router.post("/webhook", postStripeWebhook);

export default router;
