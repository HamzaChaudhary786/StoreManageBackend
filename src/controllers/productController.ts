import { Request, Response } from 'express';
import { prisma } from '../server';
import { catchAsync } from '../utils/catchAsync';

export const getProducts = catchAsync(async (req: Request, res: Response) => {
  const keyword = req.query.keyword as string;
  const categoryId = req.query.category as string;
  const stockStatus = req.query.stockStatus as string;
  
  const where: any = {};

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

  if (categoryId) where.categoryId = categoryId;
  if (stockStatus === 'out') where.stock = 0;

  const products = await prisma.product.findMany({
    where,
    include: { category: true },
    orderBy: { updatedAt: 'desc' }
  });

  // Correct profit: accounts for piecesPerUnit in bulk-to-retail items
  const productsWithProfit = products.map((p: { piecesPerUnit: number; buyPrice: number; salePrice: number; }) => {
    const costPerRetailUnit = p.piecesPerUnit > 1 ? p.buyPrice / p.piecesPerUnit : p.buyPrice;
    const profit = p.salePrice - costPerRetailUnit;
    const profitMargin = costPerRetailUnit > 0 ? (profit / costPerRetailUnit) * 100 : 0;
    return { ...p, profit, profitMargin, costPerRetailUnit };
  });

  res.json(productsWithProfit);
});

export const getProductById = catchAsync(async (req: Request, res: Response) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { category: true, stockLogs: { take: 10, orderBy: { createdAt: 'desc' } } }
  });

  if (!product) { res.status(404); throw new Error('Product not found'); }

  const costPerRetailUnit = product.piecesPerUnit > 1 ? product.buyPrice / product.piecesPerUnit : product.buyPrice;
  const profit = product.salePrice - costPerRetailUnit;
  const profitMargin = costPerRetailUnit > 0 ? (profit / costPerRetailUnit) * 100 : 0;

  res.json({ ...product, profit, profitMargin, costPerRetailUnit });
});

export const createProduct = catchAsync(async (req: Request, res: Response) => {
  const { name, description, sku, buyPrice, salePrice, stock, minStockLevel, categoryId, images, unit, piecesPerUnit } = req.body;
  
  const product = await prisma.product.create({
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
    await prisma.stockLog.create({
      data: { productId: product.id, change: product.stock, previous: 0, current: product.stock, reason: 'INITIAL_STOCK' }
    });
  }

  res.status(201).json(product);
});

export const updateProduct = catchAsync(async (req: Request, res: Response) => {
  const { name, description, sku, buyPrice, salePrice, minStockLevel, categoryId, images, unit, piecesPerUnit } = req.body;
  
  const product = await prisma.product.update({
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

export const updateStock = catchAsync(async (req: Request, res: Response) => {
  const { change, reason } = req.body;
  const productId = req.params.id;

  const currentProduct = await prisma.product.findUnique({ where: { id: productId } });
  if (!currentProduct) { res.status(404); throw new Error('Product not found'); }

  // ✅ Guard: prevent negative stock on manual adjustments
  const newStock = currentProduct.stock + parseFloat(change);
  if (newStock < 0) {
    res.status(400);
    throw new Error(`Insufficient stock. Available: ${currentProduct.stock}`);
  }

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: { stock: { increment: parseFloat(change) } }
  });

  await prisma.stockLog.create({
    data: { productId, change: parseFloat(change), previous: currentProduct.stock, current: updatedProduct.stock, reason: reason || 'MANUAL_UPDATE' }
  });

  res.json(updatedProduct);
});

export const deleteProduct = catchAsync(async (req: Request, res: Response) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ message: 'Product removed' });
});

export const bulkImportProducts = catchAsync(async (req: Request, res: Response) => {
  const { products } = req.body;
  if (!Array.isArray(products)) { res.status(400); throw new Error('Products must be an array'); }

  const createdProducts = await prisma.$transaction(
    products.map((p: any) => prisma.product.create({
      data: {
        name: p.name, sku: p.sku, description: p.description,
        buyPrice: parseFloat(p.buyPrice), salePrice: parseFloat(p.salePrice),
        stock: parseFloat(p.stock) || 0, categoryId: p.categoryId,
        unit: p.unit || 'pcs', piecesPerUnit: parseInt(p.piecesPerUnit) || 1,
      }
    }))
  );

  res.status(201).json({ message: `${createdProducts.length} products imported`, count: createdProducts.length });
});

export const switchCategory = catchAsync(async (req: Request, res: Response) => {
  const { categoryId } = req.body;
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: { categoryId }
  });
  res.json(product);
});
