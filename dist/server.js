"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const app_1 = __importDefault(require("./app"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const cronJobs_1 = require("./jobs/cronJobs");
dotenv_1.default.config();
const PORT = process.env.PORT || 5000;
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new adapter_pg_1.PrismaPg(pool);
exports.prisma = new client_1.PrismaClient({ adapter });
const startServer = async () => {
    try {
        await exports.prisma.$connect();
        console.log('Database connected successfully');
        // Initialize scheduled tasks
        (0, cronJobs_1.setupCronJobs)();
        app_1.default.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        await exports.prisma.$disconnect();
        process.exit(1);
    }
};
// Prevent server from starting locally if running in Vercel
if (process.env.VERCEL !== '1') {
    startServer();
}
//# sourceMappingURL=server.js.map