"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProduct = exports.getProductById = exports.getProducts = void 0;
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
exports.getProducts = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const keyword = req.query.keyword;
    const categoryId = req.query.category;
    const query = {
        where: {}
    };
    if (keyword) {
        query.where.name = { contains: keyword, mode: 'insensitive' };
    }
    if (categoryId) {
        query.where.categoryId = categoryId;
    }
    const products = await server_1.prisma.product.findMany({
        ...query,
        include: { category: true }
    });
    res.json(products);
});
exports.getProductById = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const product = await server_1.prisma.product.findUnique({
        where: { id: req.params.id },
        include: { category: true, reviews: { include: { user: { select: { name: true } } } } }
    });
    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }
    res.json(product);
});
exports.createProduct = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { name, description, price, stock, images, categoryId } = req.body;
    const product = await server_1.prisma.product.create({
        data: { name, description, price, stock, images, categoryId }
    });
    res.status(201).json(product);
});
//# sourceMappingURL=productController.js.map