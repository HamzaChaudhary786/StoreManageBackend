import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { catchAsync } from '../utils/catchAsync';

export const getCustomers = catchAsync(async (req: Request, res: Response) => {
  const keyword = req.query.keyword as string;
  const where: any = {};

  if (keyword) {
    where.OR = [
      { name: { contains: keyword, mode: 'insensitive' } },
      { phone: { contains: keyword, mode: 'insensitive' } }
    ];
  }

  const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' } });
  res.json(customers);
});

export const getCustomerById = catchAsync(async (req: Request, res: Response) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id as string },
    include: {
      udharTransactions: {
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' }
      },
      paymentLogs: { orderBy: { createdAt: 'desc' } }   // ✅ full payment history
    }
  });

  if (!customer) { res.status(404); throw new Error('Customer not found'); }
  res.json(customer);
});

export const createCustomer = catchAsync(async (req: Request, res: Response) => {
  const { name, phone, address } = req.body;

  const existing = await prisma.customer.findUnique({ where: { phone } });
  if (existing) { res.status(400); throw new Error('Customer with this phone number already exists'); }

  const customer = await prisma.customer.create({ data: { name, phone, address } });
  res.status(201).json(customer);
});

export const addUdharTransaction = catchAsync(async (req: Request, res: Response) => {
  const { customerId, items, description, paidAmount = 0 } = req.body;
  
  let totalAmount = 0;
  for (const item of items) {
    totalAmount += item.quantity * item.priceAtTime;
  }

  const remainingAmount = totalAmount - paidAmount;

  const transaction = await prisma.$transaction(async (tx: any) => {
    // 1. Create Transaction
    const t = await tx.udharTransaction.create({
      data: {
        customerId,
        totalAmount,
        description,
        items: {
          create: items.map((i: any) => ({
            productId: i.productId,
            quantity: i.quantity,
            priceAtTime: i.priceAtTime
          }))
        }
      }
    });

    // 2. Update Customer Balance (only by the remaining amount)
    await tx.customer.update({ 
      where: { id: customerId }, 
      data: { currentBalance: { increment: remainingAmount } } 
    });

    // 3. Log initial payment if any
    if (paidAmount > 0) {
      await tx.paymentLog.create({
        data: {
          customerId,
          amount: paidAmount,
          note: `Initial payment for purchase: ${description || 'Udhar Sale'}`
        }
      });
    }

    // 4. Validate Stock & Deduct
    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock.toFixed(2)} ${product.unit}`);
      }

      await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });

      // Check for low stock and notify
      const updatedProduct = await tx.product.findUnique({ where: { id: item.productId } });
      if (updatedProduct && updatedProduct.stock <= (updatedProduct.minStockLevel || 5)) {
        // Check if a notification was already sent recently (to avoid spam)
        const recentNotify = await tx.adminNotification.findFirst({
          where: { 
            type: 'LOW_STOCK', 
            message: { contains: updatedProduct.name },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24 hours
          }
        });

        if (!recentNotify) {
          await tx.adminNotification.create({
            data: {
              title: 'Low Stock Alert ⚠️',
              message: `${updatedProduct.name} is running low (${updatedProduct.stock.toFixed(2)} ${updatedProduct.unit} left)`,
              type: 'LOW_STOCK'
            }
          });
        }
      }

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

export const payUdhar = catchAsync(async (req: Request, res: Response) => {
  const { customerId, amount, note } = req.body;

  await prisma.$transaction(async (tx: any) => {
    // Decrement balance
    await tx.customer.update({ where: { id: customerId }, data: { currentBalance: { decrement: parseFloat(amount) } } });

    // ✅ Log the payment with amount, date, and optional note
    await tx.paymentLog.create({
      data: { customerId, amount: parseFloat(amount), note: note || '' }
    });
  });

  res.json({ message: 'Payment recorded successfully' });
});

export const paySpecificTransaction = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const transaction = await prisma.udharTransaction.findUnique({
    where: { id: id as string },
    include: { items: { include: { product: true } } }
  });

  if (!transaction) { res.status(404); throw new Error('Transaction not found'); }
  if (transaction.isPaid) { res.status(400); throw new Error('Transaction is already marked as paid'); }

  await prisma.$transaction(async (tx: any) => {
    // 1. Mark transaction as paid
    await tx.udharTransaction.update({
      where: { id: id as string },
      data: { isPaid: true }
    });

    // 2. Decrement customer balance
    await tx.customer.update({
      where: { id: transaction.customerId },
      data: { currentBalance: { decrement: transaction.totalAmount } }
    });

    // 3. Log payment
    const itemSummary = transaction.items.map((i: any) => i.product.name).join(', ');
    await tx.paymentLog.create({
      data: { 
        customerId: transaction.customerId, 
        amount: transaction.totalAmount, 
        note: `Paid for transaction: ${itemSummary || transaction.description || 'Udhar Purchase'}`
      }
    });
  });

  res.json({ message: 'Transaction marked as paid successfully' });
});

export const revertTransaction = catchAsync(async (req: Request, res: Response) => {
  const { transactionId } = req.params;

  const transaction = await prisma.udharTransaction.findUnique({
    where: { id: transactionId as string },
    include: { items: true }
  });

  if (!transaction) { res.status(404); throw new Error('Transaction not found'); }

  await prisma.$transaction(async (tx: any) => {
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
    await tx.udharItem.deleteMany({ where: { udharTransactionId: transactionId as string } });
    await tx.udharTransaction.delete({ where: { id: transactionId as string } });
  });

  res.json({ message: 'Transaction reverted and stock restored' });
});
export const deleteCustomer = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const customer = await prisma.customer.findUnique({
    where: { id: id as string },
    include: { _count: { select: { udharTransactions: true } } }
  });

  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // Optional: Prevent deletion if they have unpaid transactions?
  // User didn't specify, but usually it's safer.
  // For now, I'll allow it but delete everything related.

  await prisma.$transaction(async (tx: any) => {
    // Delete related data
    await tx.udharItem.deleteMany({ where: { udharTransaction: { customerId: id as string } } });
    await tx.udharTransaction.deleteMany({ where: { customerId: id as string } });
    await tx.paymentLog.deleteMany({ where: { customerId: id as string } });
    await tx.customer.delete({ where: { id: id as string } });
  });

  res.status(204).json({ status: 'success' });
});
export const updateCustomer = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;

  const customer = await prisma.customer.findUnique({ where: { id: id as string } });
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // If phone is being changed, check if new phone already exists
  if (phone && phone !== customer.phone) {
    const existing = await prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      res.status(400);
      throw new Error('Another customer already has this phone number');
    }
  }

  const updated = await prisma.customer.update({
    where: { id: id as string },
    data: { name, phone, address }
  });

  res.json(updated);
});
