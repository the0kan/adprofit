/**
 * AES-256-GCM encryption for Meta user access tokens at rest.
 * Never log plaintext or ciphertext; never expose to API responses.
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

function resolveKeyMaterial() {
  const secret = process.env.TOKEN_ENCRYPTION_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      const err = new Error("token_encryption_required");
      err.code = "token_encryption_required";
      throw err;
    }
    console.warn(
      "[token] TOKEN_ENCRYPTION_SECRET is not set — using a dev-only derived key (not for production)."
    );
    return crypto
      .createHash("sha256")
      .update("dev-only-insecure-meta-token-key")
      .digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * @param {string} plaintext
 * @returns {Buffer}
 */
export function encryptMetaAccessToken(plaintext) {
  const key = resolveKeyMaterial();
  if (key.length !== KEY_LEN) {
    throw new Error("invalid_encryption_key_length");
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

/**
 * @param {Buffer} payload
 * @returns {string}
 */
export function decryptMetaAccessToken(payload) {
  if (!Buffer.isBuffer(payload) || payload.length < IV_LEN + TAG_LEN + 1) {
    const err = new Error("invalid_encrypted_token");
    err.code = "invalid_encrypted_token";
    throw err;
  }
  const key = resolveKeyMaterial();
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
  if (!plain) {
    const err = new Error("invalid_encrypted_token");
    err.code = "invalid_encrypted_token";
    throw err;
  }
  return plain;
}
