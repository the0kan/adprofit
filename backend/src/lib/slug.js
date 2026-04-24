/**
 * URL-safe workspace slug generation.
 */

/**
 * @param {string} raw
 */
export function slugify(raw) {
  return String(raw || "workspace")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}
