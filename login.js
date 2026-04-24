/**
 * AdProfit — sign-in (localStorage demo, or real API when `adprofit.apiBase` / meta is set)
 */

import {
  setSession,
  createSessionFromEmail,
  createSessionFromAuthResponse,
  sanitizeNextPageFilename,
  validateDemoEmail,
  validateDemoPassword,
} from "./auth.js";
import { getApiBase } from "./config.js";

const form = document.getElementById("login-form");
const err = document.getElementById("login-error");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");

const signupLink = document.querySelector('a[href="signup.html"]');
const nextParam = new URLSearchParams(window.location.search).get("next");
if (signupLink instanceof HTMLAnchorElement && nextParam) {
  signupLink.href = `signup.html?next=${encodeURIComponent(nextParam)}`;
}

function clearErrors() {
  if (err) err.textContent = "";
  emailInput?.removeAttribute("aria-invalid");
  passwordInput?.removeAttribute("aria-invalid");
}

/**
 * @param {HTMLElement | null} el
 * @param {boolean} invalid
 */
function setInvalid(el, invalid) {
  if (el) el.setAttribute("aria-invalid", invalid ? "true" : "false");
}

/**
 * @param {string} email
 */
function useDemoSessionFallback(email) {
  const session = createSessionFromEmail(email);
  setSession(session);
  if (err) err.textContent = "Demo session started.";
}

if (form instanceof HTMLFormElement) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    const emailRes = validateDemoEmail(email);
    if (!emailRes.ok) {
      if (err) err.textContent = emailRes.message;
      setInvalid(
        emailInput instanceof HTMLElement ? emailInput : null,
        true
      );
      if (emailInput instanceof HTMLElement) emailInput.focus();
      return;
    }

    const passRes = validateDemoPassword(password, "login");
    if (!passRes.ok) {
      if (err) err.textContent = passRes.message;
      setInvalid(
        passwordInput instanceof HTMLElement ? passwordInput : null,
        true
      );
      if (passwordInput instanceof HTMLElement) passwordInput.focus();
      return;
    }

    const base = getApiBase();
    if (base) {
      try {
        const res = await fetch(`${base}/v1/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status >= 500) {
            useDemoSessionFallback(email);
            const next = new URLSearchParams(window.location.search).get("next");
            window.location.href = sanitizeNextPageFilename(next);
            return;
          }
          if (err) {
            err.textContent =
              data.message ||
              (res.status === 401
                ? "Invalid email or password."
                : `Sign in failed (${res.status}).`);
          }
          return;
        }
        if (!data.accessToken || !data.user || !data.workspace) {
          useDemoSessionFallback(email);
          const next = new URLSearchParams(window.location.search).get("next");
          window.location.href = sanitizeNextPageFilename(next);
          return;
        }
        setSession(createSessionFromAuthResponse(data));
      } catch {
        useDemoSessionFallback(email);
      }
    } else {
      const session = createSessionFromEmail(email);
      setSession(session);
    }

    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = sanitizeNextPageFilename(next);
  });
}
