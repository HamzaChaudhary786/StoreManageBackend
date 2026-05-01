"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCronJobs = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const server_1 = require("../server");
const whatsappService_1 = require("../services/whatsappService");
const setupCronJobs = () => {
    // Run on the 1st day of every month at 10:00 AM
    node_cron_1.default.schedule('0 10 1 * *', async () => {
        console.log('Running monthly Udhar reminder cron job...');
        try {
            const customersWithBalance = await server_1.prisma.customer.findMany({
                where: { currentBalance: { gt: 0 } },
                select: { name: true, phone: true, currentBalance: true, id: true }
            });
            for (const customer of customersWithBalance) {
                await whatsappService_1.WhatsAppService.sendUdharReminder(customer.phone, customer.name, customer.currentBalance);
            }
            console.log(`Monthly Udhar reminders sent to ${customersWithBalance.length} customers.`);
        }
        catch (error) {
            console.error('Error in monthly Udhar reminder cron job:', error);
        }
    });
};
exports.setupCronJobs = setupCronJobs;
//# sourceMappingURL=cronJobs.js.map