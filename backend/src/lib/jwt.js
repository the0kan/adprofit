/**
 * JWT helpers — access tokens only for Phase 1.
 */
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const EXPIRES =
  process.env.JWT_EXPIRES_IN?.trim() || "7d";

/**
 * @param {{ sub: string, email: string }} payload
 * @returns {{ token: string, expiresInSeconds: number }}
 */
export function signAccessToken(payload) {
  if (!SECRET || SECRET.length < 16) {
    throw new Error("JWT_SECRET must be set and at least 16 characters.");
  }
  const token = jwt.sign(
    { sub: payload.sub, email: payload.email },
    SECRET,
    { expiresIn: EXPIRES }
  );
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded === "object" && "exp" in decoded ? decoded.exp : null;
  const expiresInSeconds =
    exp != null ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 604800;
  return { token, expiresInSeconds };
}

/**
 * @param {string} token
 * @returns {{ sub: string, email: string }}
 */
export function verifyAccessToken(token) {
  if (!SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
  const decoded = jwt.verify(token, SECRET);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string"
  ) {
    throw new Error("Invalid token payload");
  }
  return { sub: decoded.sub, email: decoded.email };
}
