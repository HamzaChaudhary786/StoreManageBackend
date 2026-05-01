"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = void 0;
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
exports.createOrder = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { items, paymentMethod } = req.body;
    const userId = req.user.id;
    if (!items || items.length === 0) {
        res.status(400);
        throw new Error('No order items');
    }
    // Calculate total amount
    let totalAmount = 0;
    for (const item of items) {
        const product = await server_1.prisma.product.findUnique({ where: { id: item.productId } });
        if (!product)
            throw new Error(`Product not found: ${item.productId}`);
        totalAmount += product.price * item.quantity;
    }
    // Handle Udhar Logic
    if (paymentMethod === 'UDHAR') {
        const user = await server_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new Error('User not found');
        if (user.currentBalance + totalAmount > user.creditLimit) {
            res.status(400);
            throw new Error(`Credit limit exceeded. Your available credit is $${user.creditLimit - user.currentBalance}`);
        }
        // Update user balance
        await server_1.prisma.user.update({
            where: { id: userId },
            data: { currentBalance: user.currentBalance + totalAmount }
        });
    }
    // Create Order
    const order = await server_1.prisma.order.create({
        data: {
            userId,
            totalAmount,
            paymentMethod,
            items: {
                create: items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    price: item.price
                }))
            }
        }
    });
    // Record Udhar Transaction
    if (paymentMethod === 'UDHAR') {
        await server_1.prisma.udharTransaction.create({
            data: {
                userId,
                amount: totalAmount,
                type: 'CREDIT',
                description: 'Purchase on credit',
                orderId: order.id
            }
        });
    }
    // Update Product Stock and check for Low Stock
    for (const item of items) {
        const updatedProduct = await server_1.prisma.product.update({
            where: { id: item.productId },
            data: {
                stock: {
                    decrement: item.quantity
                }
            }
        });
        if (updatedProduct.stock < 10) {
            await server_1.prisma.adminNotification.create({
                data: {
                    title: 'Low Stock Alert',
                    message: `Product "${updatedProduct.name}" is running low on stock. Only ${updatedProduct.stock} left.`,
                    type: 'LOW_STOCK'
                }
            });
        }
    }
    res.status(201).json(order);
});
//# sourceMappingURL=orderController.js.map