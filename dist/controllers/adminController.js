"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInventoryValue = exports.getNotifications = exports.exportSalesReport = exports.getSalesReportData = exports.getDashboardStats = void 0;
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
const exceljs_1 = __importDefault(require("exceljs"));
const calcSaleProfit = (items) => items.reduce((sum, i) => {
    const cost = i.product.piecesPerUnit > 1 ? i.product.buyPrice / i.product.piecesPerUnit : i.product.buyPrice;
    return sum + (i.priceAtTime - cost) * i.quantity;
}, 0);
exports.getDashboardStats = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [totalProducts, outOfStock, lowStock, totalUdhar, products, todayCashOrders, todayUdharSales, recentUdharTx, recentCashOrders] = await Promise.all([
        server_1.prisma.product.count(),
        server_1.prisma.product.count({ where: { stock: 0 } }),
        server_1.prisma.product.count({ where: { stock: { gt: 0 } } }), // will filter below
        server_1.prisma.customer.aggregate({ _sum: { currentBalance: true } }),
        server_1.prisma.product.findMany({ select: { buyPrice: true, salePrice: true, stock: true, piecesPerUnit: true } }),
        server_1.prisma.order.findMany({ where: { createdAt: { gte: todayStart } }, select: { totalAmount: true, items: { include: { product: { select: { buyPrice: true, piecesPerUnit: true } } } } } }),
        server_1.prisma.udharTransaction.findMany({ where: { createdAt: { gte: todayStart } }, select: { totalAmount: true, items: { include: { product: { select: { buyPrice: true, piecesPerUnit: true } } } } } }),
        server_1.prisma.udharTransaction.findMany({ include: { customer: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
        server_1.prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    ]);
    // ✅ Correct stock value: cost per retail unit × stock
    const totalStockValue = products.reduce((acc, p) => {
        const costPerUnit = p.piecesPerUnit > 1 ? p.buyPrice / p.piecesPerUnit : p.buyPrice;
        return acc + costPerUnit * p.stock;
    }, 0);
    // ✅ Today's Revenue: cash + udhar
    const todayRevenue = todayCashOrders.reduce((s, o) => s + o.totalAmount, 0) +
        todayUdharSales.reduce((s, t) => s + t.totalAmount, 0);
    // ✅ Today's Profit: revenue - cost of goods sold
    const calcProfit = (orders) => orders.reduce((sum, o) => sum + o.items.reduce((s, i) => {
        const cost = i.product.piecesPerUnit > 1 ? i.product.buyPrice / i.product.piecesPerUnit : i.product.buyPrice;
        return s + (i.priceAtTime - cost) * i.quantity;
    }, 0), 0);
    const todayProfit = calcProfit(todayCashOrders) + calcProfit(todayUdharSales);
    // ✅ Low stock (runtime filter using minStockLevel per product)
    const lowStockCount = (await server_1.prisma.product.findMany({ select: { stock: true, minStockLevel: true } }))
        .filter((p) => p.stock > 0 && p.stock <= (p.minStockLevel || 5)).length;
    // ✅ Combined recent activity
    const recentActivity = [
        ...recentUdharTx.map((t) => ({ id: t.id, name: t.customer?.name || 'Unknown', amount: t.totalAmount, type: 'UDHAR', createdAt: t.createdAt })),
        ...recentCashOrders.map((o) => ({ id: o.id, name: 'Walk-in Customer', amount: o.totalAmount, type: 'CASH', createdAt: o.createdAt }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);
    res.json({
        totalProducts,
        outOfStock,
        lowStock: lowStockCount,
        totalUdhar: totalUdhar._sum.currentBalance || 0,
        totalStockValue,
        todayRevenue,
        todayProfit,
        recentActivity
    });
});
exports.getSalesReportData = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();
    if (!startDate)
        start.setHours(0, 0, 0, 0);
    else
        start.setHours(0, 0, 0, 0);
    if (!endDate)
        end.setHours(23, 59, 59, 999);
    else
        end.setHours(23, 59, 59, 999);
    const [cashSales, udharSales] = await Promise.all([
        server_1.prisma.order.findMany({
            where: { createdAt: { gte: start, lte: end } },
            include: { items: { include: { product: true } } },
            orderBy: { createdAt: 'desc' }
        }),
        server_1.prisma.udharTransaction.findMany({
            where: { createdAt: { gte: start, lte: end } },
            include: { customer: true, items: { include: { product: true } } },
            orderBy: { createdAt: 'desc' }
        })
    ]);
    const allSales = [
        ...cashSales.map((s) => ({
            id: s.id,
            date: s.createdAt,
            type: 'CASH',
            customer: 'Walk-in',
            total: s.totalAmount,
            profit: calcSaleProfit(s.items),
            items: s.items.map((i) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(', ')
        })),
        ...udharSales.map((s) => ({
            id: s.id,
            date: s.createdAt,
            type: 'UDHAR',
            customer: s.customer.name,
            total: s.totalAmount,
            profit: calcSaleProfit(s.items),
            items: s.items.map((i) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(', ')
        }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(allSales);
});
exports.exportSalesReport = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { period, startDate, endDate, format = 'xlsx' } = req.query;
    let start = new Date();
    let end = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
    }
    else if (period === 'week') {
        start.setDate(start.getDate() - 7);
    }
    else if (period === 'month') {
        start.setMonth(start.getMonth() - 1);
    }
    if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
    }
    const [cashSales, udharSales] = await Promise.all([
        server_1.prisma.order.findMany({
            where: { createdAt: { gte: start, lte: end } },
            include: { items: { include: { product: true } } }
        }),
        server_1.prisma.udharTransaction.findMany({
            where: { createdAt: { gte: start, lte: end } },
            include: { customer: true, items: { include: { product: true } } }
        })
    ]);
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet('Sales Report');
    sheet.columns = [
        { header: 'Date', key: 'date', width: 25 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Customer', key: 'customer', width: 25 },
        { header: 'Items', key: 'items', width: 50 },
        { header: 'Total (PKR)', key: 'total', width: 15 },
        { header: 'Profit (PKR)', key: 'profit', width: 15 },
    ];
    // Cash Sales
    cashSales.forEach((order) => {
        sheet.addRow({
            date: order.createdAt.toLocaleString(),
            type: 'CASH',
            customer: 'Walk-in',
            items: order.items.map((i) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(', '),
            total: order.totalAmount,
            profit: calcSaleProfit(order.items)
        });
    });
    // Udhar Sales
    udharSales.forEach((tx) => {
        sheet.addRow({
            date: tx.createdAt.toLocaleString(),
            type: 'UDHAR',
            customer: tx.customer.name,
            items: tx.items.map((i) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(', '),
            total: tx.totalAmount,
            profit: calcSaleProfit(tx.items)
        });
    });
    // Styling
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    const fileName = `Sales_Report_${period || 'custom'}_${new Date().toISOString().split('T')[0]}.${format}`;
    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        await workbook.csv.write(res);
    }
    else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        await workbook.xlsx.write(res);
    }
    res.end();
});
exports.getNotifications = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const notifications = await server_1.prisma.adminNotification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20
    });
    res.json(notifications);
});
exports.getInventoryValue = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const products = await server_1.prisma.product.findMany({
        include: { category: true },
        orderBy: { name: 'asc' }
    });
    const detailedValue = products.map((p) => {
        const costPerUnit = p.piecesPerUnit > 1 ? p.buyPrice / p.piecesPerUnit : p.buyPrice;
        const value = costPerUnit * p.stock;
        return {
            id: p.id,
            name: p.name,
            category: p.category?.name || 'General',
            sku: p.sku,
            unit: p.unit,
            costPerUnit,
            stock: p.stock,
            value
        };
    });
    const grandTotal = detailedValue.reduce((sum, item) => sum + item.value, 0);
    res.json({
        products: detailedValue,
        grandTotal
    });
});
//# sourceMappingURL=adminController.js.map