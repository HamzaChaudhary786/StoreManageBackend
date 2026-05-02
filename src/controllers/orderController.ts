import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { catchAsync } from '../utils/catchAsync';

/**
 * Historical Order Controller (Refactored for Udhar Transactions)
 * This controller now manages Udhar sales for customers.
 */

export const createSale = catchAsync(async (req: Request, res: Response) => {
  const { customerId, items, description, isUdhar } = req.body; // isUdhar: boolean
  
  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('No items in sale');
  }

  let totalAmount = 0;
  for (const item of items) {
    totalAmount += item.quantity * item.priceAtTime;
  }

  const transaction = await prisma.$transaction(async (tx: any) => {
    let sale;

    if (isUdhar) {
      if (!customerId) throw new Error('Customer ID is required for Udhar sale');
      sale = await tx.udharTransaction.create({
        data: {
          customerId,
          totalAmount,
          description: description || 'POS Udhar Sale',
          items: {
            create: items.map((i: any) => ({
              productId: i.productId,
              quantity: i.quantity,
              priceAtTime: i.priceAtTime
            }))
          }
        }
      });

      // Update Customer Balance
      await tx.customer.update({
        where: { id: customerId },
        data: { currentBalance: { increment: totalAmount } }
      });
    } else {
      // Cash Sale
      sale = await tx.order.create({
        data: {
          totalAmount,
          items: {
            create: items.map((i: any) => ({
              productId: i.productId,
              quantity: i.quantity,
              priceAtTime: i.priceAtTime
            }))
          }
        }
      });
    }

    // 3. Validate & Update Product Stocks + Log
    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      // ✅ Negative stock guard
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock.toFixed(2)} ${product.unit}, Requested: ${item.quantity}`);
      }

      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } }
      });

      await tx.stockLog.create({
        data: {
          productId: item.productId,
          change: -item.quantity,
          previous: product.stock,
          current: product.stock - item.quantity,
          reason: isUdhar ? `UDHAR_SALE_${sale.id}` : `CASH_SALE_${sale.id}`
        }
      });

      // Low stock notification
      if (product.stock - item.quantity <= product.minStockLevel) {
        await tx.adminNotification.create({
          data: {
            title: 'Low Stock Alert',
            message: `"${product.name}" is running low. Only ${(product.stock - item.quantity).toFixed(2)} ${product.unit} left.`,
            type: 'LOW_STOCK'
          }
        });
      }
    }

    return sale;
  });

  res.status(201).json(transaction);
});

export const getSalesHistory = catchAsync(async (req: Request, res: Response) => {
  const transactions = await prisma.udharTransaction.findMany({
    include: {
      customer: { select: { name: true, phone: true } },
      items: { include: { product: { select: { name: true } } } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(transactions);
});
