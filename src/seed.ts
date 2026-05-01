import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma: any = new PrismaClient({ adapter });

async function main() {
  const email = 'admin@gmail.com';
  const password = 'qwe123';
  const name = 'System Admin';

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.admin.create({
    data: {
      email,
      name,
      password: hashedPassword
    }
  });

  console.log('Admin user created successfully!');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
