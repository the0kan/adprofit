/**
 * Development seed — demo user + workspace + membership.
 * Run: `npm run db:seed` from backend/
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL || "demo@adprofit.local";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo12345!";
const DEMO_SLUG = process.env.SEED_DEMO_WORKSPACE_SLUG || "adprofit-demo";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, name: "Demo User" },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "Demo User",
    },
  });

  let workspace = await prisma.workspace.findUnique({
    where: { slug: DEMO_SLUG },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Northwind Commerce (demo)",
        slug: DEMO_SLUG,
        defaultCurrency: "USD",
        timezone: "America/Los_Angeles",
      },
    });
  }

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: { role: "OWNER" },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  console.log("Seed complete.");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD} (change via SEED_DEMO_PASSWORD)`);
  console.log(`  Workspace id: ${workspace.id}`);
  console.log(`  Workspace slug: ${workspace.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
