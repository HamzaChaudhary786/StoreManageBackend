import app from './app';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { setupCronJobs } from './jobs/cronJobs';

dotenv.config();

const PORT = process.env.PORT || 5000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma: any = new PrismaClient({ adapter });

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
    
    // Initialize scheduled tasks
    setupCronJobs();
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

// Prevent server from starting locally if running in Vercel
if (process.env.VERCEL !== '1') {
  startServer();
}
