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

  const adminPassword = await bcrypt.hash('admin123', 10);

  // Create Admin User
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
      maxQuota: 1000,
    },
  });
  
  console.log('✅ Admin user ready:', adminUser.email);

  const customerPassword = await bcrypt.hash('customer123', 10);

  // Create Customer User
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
      maxQuota: 100,
    },
  });

  console.log('✅ Customer user ready:', customerUser.email);

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
