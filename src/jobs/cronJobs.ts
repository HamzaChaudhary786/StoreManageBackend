import cron from 'node-cron';
import { prisma } from '../server';
import { WhatsAppService } from '../services/whatsappService';

export const setupCronJobs = () => {
  // Run on the 1st day of every month at 10:00 AM
  cron.schedule('0 10 1 * *', async () => {
    console.log('Running monthly Udhar reminder cron job...');
    
    try {
      const customersWithBalance = await prisma.customer.findMany({
        where: { currentBalance: { gt: 0 } },
        select: { name: true, phone: true, currentBalance: true, id: true } 
      });

      for (const customer of customersWithBalance) {
        await WhatsAppService.sendUdharReminder(customer.phone, customer.name, customer.currentBalance);
      }
      
      console.log(`Monthly Udhar reminders sent to ${customersWithBalance.length} customers.`);
    } catch (error) {
      console.error('Error in monthly Udhar reminder cron job:', error);
    }
  });
};
