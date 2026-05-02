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
    where: { id: req.params.id },
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
  const { customerId, items, description } = req.body;
  
  let totalAmount = 0;
  for (const item of items) {
    totalAmount += item.quantity * item.priceAtTime;
  }

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

    // 2. Update Customer Balance
    await tx.customer.update({ where: { id: customerId }, data: { currentBalance: { increment: totalAmount } } });

    // 3. Validate Stock & Deduct
    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error(`Product not found: ${item.productId}`);

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
    where: { id },
    include: { items: { include: { product: true } } }
  });

  if (!transaction) { res.status(404); throw new Error('Transaction not found'); }
  if (transaction.isPaid) { res.status(400); throw new Error('Transaction is already marked as paid'); }

  await prisma.$transaction(async (tx: any) => {
    // 1. Mark transaction as paid
    await tx.udharTransaction.update({
      where: { id },
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
    where: { id: transactionId },
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
    await tx.udharItem.deleteMany({ where: { udharTransactionId: transactionId } });
    await tx.udharTransaction.delete({ where: { id: transactionId } });
  });

  res.json({ message: 'Transaction reverted and stock restored' });
});
