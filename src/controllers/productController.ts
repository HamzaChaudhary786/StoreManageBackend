import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { catchAsync } from '../utils/catchAsync';
import csv from 'csv-parser';
import fs from 'fs';


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

  if (stockStatus === 'out') {
    where.stock = 0;
  }

  const products = await prisma.product.findMany({
    where,
    include: { category: true },
    orderBy: { updatedAt: 'desc' }
  });

  // Filter for low stock in memory since it depends on a per-product minStockLevel column comparison
  let filteredProducts = products;
  if (stockStatus === 'low') {
    filteredProducts = products.filter(p => p.stock > 0 && p.stock <= (p.minStockLevel || 5));
  }

  // Correct profit: accounts for piecesPerUnit in bulk-to-retail items
  const productsWithProfit = filteredProducts.map((p: any) => {
    const costPerRetailUnit = p.piecesPerUnit > 1 ? p.buyPrice / p.piecesPerUnit : p.buyPrice;
    const profit = p.salePrice - costPerRetailUnit;
    const profitMargin = costPerRetailUnit > 0 ? (profit / costPerRetailUnit) * 100 : 0;
    return { ...p, profit, profitMargin, costPerRetailUnit };
  });

  res.json(productsWithProfit);
});

export const getProductById = catchAsync(async (req: Request, res: Response) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id as string },
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
    where: { id: req.params.id as string },
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
  const productId = req.params.id as string;

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
  await prisma.product.delete({ where: { id: req.params.id as string } });
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
    where: { id: req.params.id as string },
    data: { categoryId }
  });
  res.json(product);
});

export const bulkCSVUpload = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a CSV file');
  }

  const results: any[] = [];
  const filePath = req.file.path;

  // Stream and parse CSV
  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(400);
    throw new Error('Failed to parse CSV file');
  }

  // Clean up uploaded file
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  if (results.length === 0) {
    res.status(400);
    throw new Error('CSV file is empty');
  }

  console.log(`[Bulk Import] Starting processing of ${results.length} rows...`);

  const createdCount = await prisma.$transaction(async (tx: any) => {
    // Fetch categories inside transaction to ensure we have the latest
    const allCategories = await tx.category.findMany();
    const catMap = new Map(allCategories.map((c: any) => [c.name.toLowerCase(), c.id]));

    let count = 0;
    for (const row of results) {
      // Basic validation and mapping
      const name = row.Name || row.name || row['Product Name'];
      const sku = row.SKU || row.sku;
      const buyPrice = parseFloat(row.BuyPrice || row.buy_price || row['Buy Price'] || 0);
      const salePrice = parseFloat(row.SalePrice || row.sale_price || row['Sale Price'] || 0);
      const stock = parseFloat(row.Stock || row.stock || 0);
      const categoryName = row.Category || row.category;
      const unit = row.Unit || row.unit || 'pcs';
      const rawPieces = row.PiecesPerUnit || row.pieces_per_unit || row['Pieces Per Unit'];
      const piecesPerUnit = parseInt(rawPieces) || 1;

      if (!name) continue;

      let categoryId = categoryName ? catMap.get(categoryName.toLowerCase()) : null;

      // Auto-create category if it doesn't exist
      if (categoryName && !categoryId) {
        const newCat = await tx.category.create({ data: { name: categoryName } });
        categoryId = newCat.id;
        catMap.set(categoryName.toLowerCase(), categoryId);
      }

      const productData = {
        name,
        sku: sku || null,
        description: row.Description || row.description || '',
        buyPrice,
        salePrice,
        stock,
        categoryId: categoryId || '',
        unit,
        piecesPerUnit,
        minStockLevel: parseFloat(row.MinStock || row.min_stock) || 5,
      };

      let product;
      let existingProduct = null;

      if (sku) {
        existingProduct = await tx.product.findUnique({ where: { sku } });
      }

      if (existingProduct) {
        // Update existing product
        product = await tx.product.update({
          where: { id: existingProduct.id },
          data: productData
        });

        // Log stock change if any
        const stockChange = stock - existingProduct.stock;
        if (stockChange !== 0) {
          await tx.stockLog.create({
            data: {
              productId: product.id,
              change: stockChange,
              previous: existingProduct.stock,
              current: product.stock,
              reason: 'BULK_IMPORT_UPDATE'
            }
          });
        }
      } else {
        // Create new product
        product = await tx.product.create({
          data: productData
        });

        if (product.stock > 0) {
          await tx.stockLog.create({
            data: {
              productId: product.id,
              change: product.stock,
              previous: 0,
              current: product.stock,
              reason: 'BULK_IMPORT'
            }
          });
        }
      }
      count++;
    }
    return count;
  }, {
    timeout: 60000 // 60 seconds for bulk operations
  });

  console.log(`[Bulk Import] Successfully imported ${createdCount} products.`);

  res.status(201).json({
    message: `Successfully imported ${createdCount} products`,
    count: createdCount
  });
});
