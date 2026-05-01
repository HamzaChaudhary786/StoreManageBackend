"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.switchCategory = exports.bulkImportProducts = exports.deleteProduct = exports.updateStock = exports.updateProduct = exports.createProduct = exports.getProductById = exports.getProducts = void 0;
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
exports.getProducts = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const keyword = req.query.keyword;
    const categoryId = req.query.category;
    const stockStatus = req.query.stockStatus;
    const where = {};
    if (keyword) {
        const words = keyword.split(' ').filter(w => w.length > 0);
        where.AND = words.map(word => ({
            OR: [
                { name: { contains: word, mode: 'insensitive' } },
                { sku: { contains: word, mode: 'insensitive' } },
                { description: { contains: word, mode: 'insensitive' } }
            ]
        }));
    }
    if (categoryId)
        where.categoryId = categoryId;
    if (stockStatus === 'out')
        where.stock = 0;
    const products = await server_1.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { updatedAt: 'desc' }
    });
    // Correct profit: accounts for piecesPerUnit in bulk-to-retail items
    const productsWithProfit = products.map((p) => {
        const costPerRetailUnit = p.piecesPerUnit > 1 ? p.buyPrice / p.piecesPerUnit : p.buyPrice;
        const profit = p.salePrice - costPerRetailUnit;
        const profitMargin = costPerRetailUnit > 0 ? (profit / costPerRetailUnit) * 100 : 0;
        return { ...p, profit, profitMargin, costPerRetailUnit };
    });
    res.json(productsWithProfit);
});
exports.getProductById = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const product = await server_1.prisma.product.findUnique({
        where: { id: req.params.id },
        include: { category: true, stockLogs: { take: 10, orderBy: { createdAt: 'desc' } } }
    });
    if (!product) {
        res.status(404);
        throw new Error('Product not found');
    }
    const costPerRetailUnit = product.piecesPerUnit > 1 ? product.buyPrice / product.piecesPerUnit : product.buyPrice;
    const profit = product.salePrice - costPerRetailUnit;
    const profitMargin = costPerRetailUnit > 0 ? (profit / costPerRetailUnit) * 100 : 0;
    res.json({ ...product, profit, profitMargin, costPerRetailUnit });
});
exports.createProduct = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { name, description, sku, buyPrice, salePrice, stock, minStockLevel, categoryId, images, unit, piecesPerUnit } = req.body;
    const product = await server_1.prisma.product.create({
        data: {
            name, description, sku,
            buyPrice: parseFloat(buyPrice),
            salePrice: parseFloat(salePrice),
            stock: parseFloat(stock) || 0,
            minStockLevel: parseFloat(minStockLevel) || 5,
            categoryId,
            images: images || [],
            unit: unit || 'pcs',
            piecesPerUnit: parseInt(piecesPerUnit) || 1
        }
    });
    if (product.stock > 0) {
        await server_1.prisma.stockLog.create({
            data: { productId: product.id, change: product.stock, previous: 0, current: product.stock, reason: 'INITIAL_STOCK' }
        });
    }
    res.status(201).json(product);
});
exports.updateProduct = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { name, description, sku, buyPrice, salePrice, minStockLevel, categoryId, images, unit, piecesPerUnit } = req.body;
    const product = await server_1.prisma.product.update({
        where: { id: req.params.id },
        data: {
            name, description, sku,
            buyPrice: parseFloat(buyPrice),
            salePrice: parseFloat(salePrice),
            minStockLevel: parseFloat(minStockLevel) || 5,
            categoryId, images,
            unit: unit || 'pcs',
            piecesPerUnit: parseInt(piecesPerUnit) || 1
        }
    });
    res.json(product);
});
exports.updateStock = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { change, reason } = req.body;
    const productId = req.params.id;
    const currentProduct = await server_1.prisma.product.findUnique({ where: { id: productId } });
    if (!currentProduct) {
        res.status(404);
        throw new Error('Product not found');
    }
    // ✅ Guard: prevent negative stock on manual adjustments
    const newStock = currentProduct.stock + parseFloat(change);
    if (newStock < 0) {
        res.status(400);
        throw new Error(`Insufficient stock. Available: ${currentProduct.stock}`);
    }
    const updatedProduct = await server_1.prisma.product.update({
        where: { id: productId },
        data: { stock: { increment: parseFloat(change) } }
    });
    await server_1.prisma.stockLog.create({
        data: { productId, change: parseFloat(change), previous: currentProduct.stock, current: updatedProduct.stock, reason: reason || 'MANUAL_UPDATE' }
    });
    res.json(updatedProduct);
});
exports.deleteProduct = (0, catchAsync_1.catchAsync)(async (req, res) => {
    await server_1.prisma.product.delete({ where: { id: req.params.id } });
    res.json({ message: 'Product removed' });
});
exports.bulkImportProducts = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { products } = req.body;
    if (!Array.isArray(products)) {
        res.status(400);
        throw new Error('Products must be an array');
    }
    const createdProducts = await server_1.prisma.$transaction(products.map((p) => server_1.prisma.product.create({
        data: {
            name: p.name, sku: p.sku, description: p.description,
            buyPrice: parseFloat(p.buyPrice), salePrice: parseFloat(p.salePrice),
            stock: parseFloat(p.stock) || 0, categoryId: p.categoryId,
            unit: p.unit || 'pcs', piecesPerUnit: parseInt(p.piecesPerUnit) || 1,
        }
    })));
    res.status(201).json({ message: `${createdProducts.length} products imported`, count: createdProducts.length });
});
exports.switchCategory = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const { categoryId } = req.body;
    const product = await server_1.prisma.product.update({
        where: { id: req.params.id },
        data: { categoryId }
    });
    res.json(product);
});
//# sourceMappingURL=productController.js.map