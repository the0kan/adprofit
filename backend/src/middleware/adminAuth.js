/**
 * Simple admin token guard for internal admin endpoints.
 * Uses ADMIN_TOKEN from environment and Authorization: Bearer <token>.
 */
export function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_TOKEN?.trim();
  const header = req.headers.authorization;
  const provided =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7).trim()
      : "";

  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({
      success: false,
      error: "admin_unauthorized",
      message: "Admin token is required.",
    });
  }

  next();
}
