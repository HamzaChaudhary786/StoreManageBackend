"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotifications = exports.downloadUdharCSV = exports.getUdharReport = void 0;
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
const json2csv_1 = require("json2csv");
exports.getUdharReport = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const udharUsers = await server_1.prisma.user.findMany({
        where: { currentBalance: { gt: 0 } },
        select: {
            id: true,
            name: true,
            email: true,
            currentBalance: true,
            creditLimit: true,
            udharTransactions: {
                orderBy: { createdAt: 'desc' },
                take: 5
            }
        }
    });
    res.json(udharUsers);
});
exports.downloadUdharCSV = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const udharUsers = await server_1.prisma.user.findMany({
        where: { currentBalance: { gt: 0 } },
        select: {
            name: true,
            email: true,
            currentBalance: true,
            creditLimit: true,
        }
    });
    if (udharUsers.length === 0) {
        res.status(404);
        throw new Error('No users with Udhar balance found');
    }
    const fields = ['name', 'email', 'currentBalance', 'creditLimit'];
    const opts = { fields };
    const parser = new json2csv_1.Parser(opts);
    const csv = parser.parse(udharUsers);
    res.header('Content-Type', 'text/csv');
    res.attachment('udhar_report.csv');
    return res.send(csv);
});
exports.getNotifications = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const notifications = await server_1.prisma.adminNotification.findMany({
        orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
});
//# sourceMappingURL=adminController.js.map