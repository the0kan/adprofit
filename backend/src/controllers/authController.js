/**
 * Auth HTTP handlers.
 */
import {
  signupUser,
  loginUser,
  getMe,
} from "../services/authService.js";

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * POST /v1/auth/signup
 */
export async function postSignup(req, res) {
  const body = req.body || {};
  const email = body.email;
  const password = body.password;
  const name = body.name;

  if (!isNonEmptyString(email)) {
    return res.status(400).json({
      error: "validation_error",
      message: "email is required",
    });
  }
  if (!isNonEmptyString(password) || password.length < 8) {
    return res.status(400).json({
      error: "validation_error",
      message: "password must be at least 8 characters",
    });
  }

  try {
    const result = await signupUser({
      email: String(email).trim(),
      password: String(password),
      name: isNonEmptyString(name) ? String(name).trim() : undefined,
    });
    return res.status(201).json(result);
  } catch (e) {
    if (e && e.code === "email_in_use") {
      return res.status(409).json({
        error: "email_in_use",
        message: "An account with this email already exists.",
      });
    }
    console.error("[auth] signup", e);
    return res.status(500).json({
      error: "server_error",
      message: "Could not create account.",
    });
  }
}

/**
 * POST /v1/auth/login
 */
export async function postLogin(req, res) {
  const body = req.body || {};
  const email = body.email;
  const password = body.password;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({
      error: "validation_error",
      message: "email and password are required",
    });
  }

  try {
    const result = await loginUser({
      email: String(email).trim(),
      password: String(password),
    });
    return res.json(result);
  } catch (e) {
    if (e && e.code === "invalid_credentials") {
      return res.status(401).json({
        error: "invalid_credentials",
        message: "Invalid email or password.",
      });
    }
    if (e && e.code === "no_workspace") {
      return res.status(403).json({
        error: "no_workspace",
        message: "User has no workspace membership.",
      });
    }
    console.error("[auth] login", e);
    return res.status(500).json({
      error: "server_error",
      message: "Could not sign in.",
    });
  }
}

/**
 * GET /v1/auth/me
 */
export async function getAuthMe(req, res) {
  try {
    const data = await getMe(req.user.id);
    if (!data) {
      return res.status(404).json({
        error: "not_found",
        message: "User not found.",
      });
    }
    return res.json(data);
  } catch (e) {
    console.error("[auth] me", e);
    return res.status(500).json({
      error: "server_error",
      message: "Could not load profile.",
    });
  }
}
