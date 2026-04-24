/**
 * Signup / login / me — bcrypt + JWT.
 */
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../lib/jwt.js";
import { slugify } from "../lib/slug.js";

const BCRYPT_ROUNDS = 12;

/**
 * @param {string} base
 */
async function uniqueWorkspaceSlug(base) {
  let slug = slugify(base);
  for (let i = 0; i < 10; i++) {
    const exists = await prisma.workspace.findUnique({ where: { slug } });
    if (!exists) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return `${slugify(base)}-${Date.now()}`;
}

function formatUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
  };
}

function formatWorkspace(w, role) {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    defaultCurrency: w.defaultCurrency,
    timezone: w.timezone,
    role,
  };
}

function authPayload(user, workspace, role) {
  const { token, expiresInSeconds } = signAccessToken({
    sub: user.id,
    email: user.email,
  });
  return {
    user: formatUser(user),
    workspace: formatWorkspace(workspace, role),
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: expiresInSeconds,
  };
}

/**
 * @param {{ email: string, password: string, name?: string }} input
 */
export async function signupUser(input) {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error("email_in_use");
    err.code = "email_in_use";
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const label = input.name?.trim() || email.split("@")[0] || "Workspace";
  const slug = await uniqueWorkspaceSlug(label);

  const { user, workspace } = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: input.name?.trim() || null,
      },
    });
    const ws = await tx.workspace.create({
      data: {
        name: `${label}'s workspace`,
        slug,
        defaultCurrency: "USD",
        timezone: "America/Los_Angeles",
      },
    });
    await tx.workspaceMember.create({
      data: {
        userId: u.id,
        workspaceId: ws.id,
        role: "OWNER",
      },
    });
    return { user: u, workspace: ws };
  });

  return authPayload(user, workspace, "OWNER");
}

/**
 * @param {{ email: string, password: string }} input
 */
export async function loginUser(input) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) {
    const err = new Error("invalid_credentials");
    err.code = "invalid_credentials";
    throw err;
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    const err = new Error("invalid_credentials");
    err.code = "invalid_credentials";
    throw err;
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    const err = new Error("no_workspace");
    err.code = "no_workspace";
    throw err;
  }

  return authPayload(user, membership.workspace, membership.role);
}

/**
 * @param {string} userId
 */
export async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { workspace: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) return null;
  return {
    user: formatUser(user),
    workspaces: user.memberships.map((m) =>
      formatWorkspace(m.workspace, m.role)
    ),
  };
}
