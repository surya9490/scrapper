import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@scrapper.dev' }
  });

  if (existingAdmin) {
    console.log('✅ Admin user already exists');
    return;
  }

  // Hash the default password
  const hashedPassword = await bcrypt.hash('admin123', 10);

  // Create default admin user
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@scrapper.dev',
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      // Default rate limits for admin
      dashboardRateLimit: 1000,
      scrapingRateLimit: 200,
      uploadRateLimit: 50
    }
  });

  console.log('✅ Created admin user:', {
    id: adminUser.id,
    email: adminUser.email,
    username: adminUser.username,
    role: adminUser.role
  });

  console.log('🎉 Database seeding completed!');
  console.log('📧 Admin credentials:');
  console.log('   Email: admin@scrapper.dev');
  console.log('   Password: admin123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });