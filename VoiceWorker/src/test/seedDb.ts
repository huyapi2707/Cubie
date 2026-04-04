import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('Seeding database for Cubie VoiceWorker...');

  // ─── Plans ──────────────────────────────────────────────────────────
  const standardPlan = await prisma.plan.upsert({
    where: { name: 'Standard' },
    update: { maxQuota: 500, description: 'Basic translation quota' },
    create: {
      name: 'Standard',
      description: 'Basic translation quota',
      maxQuota: 500,
    },
  });
  console.log('✅ Standard plan ready:', standardPlan.name);

  const premiumPlan = await prisma.plan.upsert({
    where: { name: 'Premium' },
    update: { maxQuota: 2000, description: 'High-volume translation quota' },
    create: {
      name: 'Premium',
      description: 'High-volume translation quota',
      maxQuota: 2000,
    },
  });
  console.log('✅ Premium plan ready:', premiumPlan.name);

  // ─── Users ──────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@cubie.com' },
    update: {
      role: 'ADMIN',
      name: 'Admin User',
      password: adminPassword,
    },
    create: {
      email: 'admin@cubie.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
  });
  console.log('✅ Admin user ready:', adminUser.email);

  const customerPassword = await bcrypt.hash('customer1234', 10);

  const customerUser = await prisma.user.upsert({
    where: { email: 'customer@cubie.com' },
    update: {
      role: 'CUSTOMER',
      name: 'Customer User',
      password: customerPassword,
    },
    create: {
      email: 'customer@cubie.com',
      password: customerPassword,
      name: 'Customer User',
      role: 'CUSTOMER',
    },
  });
  console.log('✅ Customer user ready:', customerUser.email);

  // ─── Assign Plans (30 days from now) ────────────────────────────────
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Admin → Premium
  await prisma.userPlan.create({
    data: {
      userId: adminUser.id,
      planId: premiumPlan.id,
      expiresAt,
    },
  });
  console.log('✅ Premium plan assigned to', adminUser.email);

  // Customer → Standard
  await prisma.userPlan.create({
    data: {
      userId: customerUser.id,
      planId: standardPlan.id,
      expiresAt,
    },
  });
  console.log('✅ Standard plan assigned to', customerUser.email);

  console.log('🎉 Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
