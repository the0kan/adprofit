/**
 * /v1/auth/*
 */
import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  postSignup,
  postLogin,
  getAuthMe,
} from "../controllers/authController.js";

const router = Router();

router.post("/signup", postSignup);
router.post("/login", postLogin);
router.get("/me", authenticate, getAuthMe);

export default router;
