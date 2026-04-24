/**
 * JWT Bearer authentication.
 */
import { verifyAccessToken } from "../lib/jwt.js";

/**
 * Sets req.user = { id, email } when valid Bearer token present.
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid Authorization header. Use: Bearer <token>",
    });
  }
  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Empty bearer token.",
    });
  }
  try {
    const { sub, email } = verifyAccessToken(token);
    req.user = { id: sub, email };
    next();
  } catch {
    return res.status(401).json({
      error: "invalid_token",
      message: "Token is invalid or expired.",
    });
  }
}
