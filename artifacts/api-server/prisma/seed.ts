import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default super admin
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: 'admin@capto.app' },
  });

  if (!existingAdmin) {
    const password = await bcrypt.hash('Admin@1234', 10);
    await prisma.adminUser.create({
      data: {
        email: 'admin@capto.app',
        name: 'Super Admin',
        password,
        role: 'super_admin',
        isActive: true,
      },
    });
    console.log('Created default admin: admin@capto.app / Admin@1234');
  } else {
    console.log('Default admin already exists');
  }

  // Create default OTP settings
  const existingSettings = await prisma.otpSetting.findFirst();
  if (!existingSettings) {
    await prisma.otpSetting.create({
      data: {
        otpLength: 6,
        otpExpirySeconds: 300,
        maxAttempts: 3,
        cooldownSeconds: 60,
        isTestMode: true,
        testOtp: '123456',
      },
    });
    console.log('Created default OTP settings (test mode ON, OTP: 123456)');
  }

  console.log('Seeding complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
