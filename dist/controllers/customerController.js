"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revertTransaction = exports.payUdhar = exports.addUdharTransaction = exports.createCustomer = exports.getCustomerById = exports.getCustomers = void 0;
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
exports.getCustomers = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const keyword = req.query.keyword;
    const where = {};
    if (keyword) {
        where.OR = [
            { name: { contains: keyword, mode: 'insensitive' } },
            { phone: { contains: keyword, mode: 'insensitive' } }
        ];
    }
    const customers = await server_1.prisma.customer.findMany({ where, orderBy: { name: 'asc' } });
    res.json(customers);
});
exports.getCustomerById = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const customer = await server_1.prisma.customer.findUnique({
        where: { id: req.params.id },
        include: {
            udharTransactions: {
                include: { items: { include: { product: true } } },
                orderBy: { createdAt: 'desc' }
            },
            paymentLogs: { orderBy: { createdAt: 'desc' } } // ✅ full payment history
        }
    });
    if (!customer) {
        res.status(404);
        throw new Error('Customer not found');
    }
    res.json(customer);
});
exports.createCustomer = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { name, phone, address } = req.body;
    const existing = await server_1.prisma.customer.findUnique({ where: { phone } });
    if (existing) {
        res.status(400);
        throw new Error('Customer with this phone number already exists');
    }
    const customer = await server_1.prisma.customer.create({ data: { name, phone, address } });
    res.status(201).json(customer);
});
exports.addUdharTransaction = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { customerId, items, description } = req.body;
    let totalAmount = 0;
    for (const item of items) {
        totalAmount += item.quantity * item.priceAtTime;
    }
    const transaction = await server_1.prisma.$transaction(async (tx) => {
        // 1. Create Transaction
        const t = await tx.udharTransaction.create({
            data: {
                customerId,
                totalAmount,
                description,
                items: {
                    create: items.map((i) => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        priceAtTime: i.priceAtTime
                    }))
                }
            }
        });
        // 2. Update Customer Balance
        await tx.customer.update({ where: { id: customerId }, data: { currentBalance: { increment: totalAmount } } });
        // 3. Validate Stock & Deduct
        for (const item of items) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!product)
                throw new Error(`Product not found: ${item.productId}`);
            // ✅ Negative stock guard
            if (product.stock < item.quantity) {
                throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock.toFixed(2)} ${product.unit}`);
            }
            await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
            await tx.stockLog.create({
                data: {
                    productId: item.productId,
                    change: -item.quantity,
                    previous: product.stock,
                    current: product.stock - item.quantity,
                    reason: `UDHAR_SALE_${t.id}`
                }
            });
        }
        return t;
    });
    res.status(201).json(transaction);
});
exports.payUdhar = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { customerId, amount, note } = req.body;
    await server_1.prisma.$transaction(async (tx) => {
        // Decrement balance
        await tx.customer.update({ where: { id: customerId }, data: { currentBalance: { decrement: parseFloat(amount) } } });
        // ✅ Log the payment with amount, date, and optional note
        await tx.paymentLog.create({
            data: { customerId, amount: parseFloat(amount), note: note || '' }
        });
    });
    res.json({ message: 'Payment recorded successfully' });
});
exports.revertTransaction = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { transactionId } = req.params;
    const transaction = await server_1.prisma.udharTransaction.findUnique({
        where: { id: transactionId },
        include: { items: true }
    });
    if (!transaction) {
        res.status(404);
        throw new Error('Transaction not found');
    }
    await server_1.prisma.$transaction(async (tx) => {
        // 1. Restore Stock
        for (const item of transaction.items) {
            await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            await tx.stockLog.create({
                data: {
                    productId: item.productId,
                    change: item.quantity,
                    previous: (product?.stock || 0) - item.quantity,
                    current: product?.stock || 0,
                    reason: `REVERT_${transaction.id}`
                }
            });
        }
        // 2. Revert Customer Balance
        await tx.customer.update({ where: { id: transaction.customerId }, data: { currentBalance: { decrement: transaction.totalAmount } } });
        // 3. Delete Transaction
        await tx.udharItem.deleteMany({ where: { udharTransactionId: transactionId } });
        await tx.udharTransaction.delete({ where: { id: transactionId } });
    });
    res.json({ message: 'Transaction reverted and stock restored' });
});
//# sourceMappingURL=customerController.js.map