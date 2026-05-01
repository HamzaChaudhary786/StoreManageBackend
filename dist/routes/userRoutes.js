"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
const router = (0, express_1.Router)();
router.get('/me/orders', authMiddleware_1.protect, (0, catchAsync_1.catchAsync)(async (req, res) => {
    const orders = await server_1.prisma.order.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
}));
exports.default = router;
//# sourceMappingURL=userRoutes.js.map