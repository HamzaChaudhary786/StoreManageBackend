"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCategory = exports.getCategories = void 0;
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
exports.getCategories = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const categories = await server_1.prisma.category.findMany({
        include: {
            _count: {
                select: { products: true }
            }
        },
        orderBy: { name: 'asc' }
    });
    res.json(categories);
});
exports.createCategory = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { name, description } = req.body;
    const category = await server_1.prisma.category.create({
        data: { name, description }
    });
    res.status(201).json(category);
});
//# sourceMappingURL=categoryController.js.map