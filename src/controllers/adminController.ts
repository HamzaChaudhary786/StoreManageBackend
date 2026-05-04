import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { catchAsync } from '../utils/catchAsync';
import ExcelJS from 'exceljs';

interface OrderItem {
  priceAtTime: number;
  quantity: number;
  product: {
    buyPrice: number;
    piecesPerUnit: number;
    name: string;
    unit: string;
  };
}

const calcSaleProfit = (items: OrderItem[]) => 
  items.reduce((sum: number, i: OrderItem) => {
    const cost = i.product.piecesPerUnit > 1 ? i.product.buyPrice / i.product.piecesPerUnit : i.product.buyPrice;
    return sum + (i.priceAtTime - cost) * i.quantity;
  }, 0);

export const getDashboardStats = catchAsync(async (req: Request, res: Response) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalProducts,
    outOfStock,
    lowStock,
    totalUdhar,
    products,
    todayCashOrders,
    todayUdharSales,
    recentUdharTx,
    recentCashOrders
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { stock: 0 } }),
    prisma.product.count({ where: { stock: { gt: 0 } } }), // will filter below
    prisma.customer.aggregate({ _sum: { currentBalance: true } }),
    prisma.product.findMany({ select: { buyPrice: true, salePrice: true, stock: true, piecesPerUnit: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: todayStart } }, select: { totalAmount: true, items: { include: { product: { select: { buyPrice: true, piecesPerUnit: true } } } } } }),
    prisma.udharTransaction.findMany({ where: { createdAt: { gte: todayStart } }, select: { totalAmount: true, items: { include: { product: { select: { buyPrice: true, piecesPerUnit: true } } } } } }),
    prisma.udharTransaction.findMany({ include: { customer: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
  ]);

  // ✅ Correct stock value: cost per retail unit × stock
  const totalStockValue = products.reduce((acc: number, p: any) => {
    const costPerUnit = p.piecesPerUnit > 1 ? p.buyPrice / p.piecesPerUnit : p.buyPrice;
    return acc + costPerUnit * p.stock;
  }, 0);

  // ✅ Today's Revenue: cash + udhar
  const todayRevenue =
    todayCashOrders.reduce((s: number, o: any) => s + o.totalAmount, 0) +
    todayUdharSales.reduce((s: number, t: any) => s + t.totalAmount, 0);

  // ✅ Today's Profit: revenue - cost of goods sold
  const calcProfit = (orders: any[]) =>
    orders.reduce((sum, o) =>
      sum + o.items.reduce((s: number, i: any) => {
        const cost = i.product.piecesPerUnit > 1 ? i.product.buyPrice / i.product.piecesPerUnit : i.product.buyPrice;
        return s + (i.priceAtTime - cost) * i.quantity;
      }, 0), 0);

  const todayProfit = calcProfit(todayCashOrders) + calcProfit(todayUdharSales);

  // ✅ Low stock (runtime filter using minStockLevel per product)
  const lowStockCount = (await prisma.product.findMany({ select: { stock: true, minStockLevel: true } }))
    .filter((p: any) => p.stock > 0 && p.stock <= (p.minStockLevel || 5)).length;

  // ✅ Combined recent activity
  const recentActivity = [
    ...recentUdharTx.map((t: any) => ({ id: t.id, name: t.customer?.name || 'Unknown', amount: t.totalAmount, type: 'UDHAR', createdAt: t.createdAt })),
    ...recentCashOrders.map((o: any) => ({ id: o.id, name: 'Walk-in Customer', amount: o.totalAmount, type: 'CASH', createdAt: o.createdAt }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  res.json({
    totalProducts,
    outOfStock,
    lowStock: lowStockCount,
    totalUdhar: totalUdhar._sum.currentBalance || 0,
    totalStockValue,
    todayRevenue,
    todayProfit,
    recentActivity
  });
});

export const getSalesReportData = catchAsync(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  // Use provided boundaries strictly, or fallback to server "today"
  const start = startDate ? new Date(startDate as string) : new Date();
  const end = endDate ? new Date(endDate as string) : new Date();

  // Only apply default hours if NOT provided as a full ISO string/custom date
  if (!startDate) start.setHours(0, 0, 0, 0);
  if (!endDate) end.setHours(23, 59, 59, 999);

  const [cashSales, udharSales] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.udharTransaction.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  const allSales = [
    ...cashSales.map((s: any) => ({
      id: s.id,
      date: s.createdAt,
      type: 'CASH',
      customer: 'Walk-in',
      total: s.totalAmount,
      profit: calcSaleProfit(s.items as unknown as OrderItem[]),
      items: s.items.map((i: any) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(', '),
      itemDetails: s.items.map((i: any) => ({
        name: i.product.name,
        quantity: i.quantity,
        unit: i.product.unit,
        price: i.priceAtTime,
        total: i.priceAtTime * i.quantity
      }))
    })),
    ...udharSales.map((s: any) => ({
      id: s.id,
      date: s.createdAt,
      type: 'UDHAR',
      customer: s.customer.name,
      total: s.totalAmount,
      profit: calcSaleProfit(s.items as unknown as OrderItem[]),
      items: s.items.map((i: any) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(', '),
      itemDetails: s.items.map((i: any) => ({
        name: i.product.name,
        quantity: i.quantity,
        unit: i.product.unit,
        price: i.priceAtTime,
        total: i.priceAtTime * i.quantity
      }))
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json(allSales);
});

export const exportSalesReport = catchAsync(async (req: Request, res: Response) => {
  const { period, startDate, endDate, format = 'xlsx' } = req.query;
  let start = new Date();
  let end = new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (startDate) {
    start = new Date(startDate as string);
  } else if (period === 'week') {
    start.setDate(start.getDate() - 7);
  } else if (period === 'month') {
    start.setMonth(start.getMonth() - 1);
  }

  if (endDate) {
    end = new Date(endDate as string);
  }

  const [cashSales, udharSales] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { items: { include: { product: true } } }
    }),
    prisma.udharTransaction.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { customer: true, items: { include: { product: true } } }
    })
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sales Report');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 25 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Customer', key: 'customer', width: 25 },
    { header: 'Items', key: 'items', width: 50 },
    { header: 'Total (PKR)', key: 'total', width: 15 },
    { header: 'Profit (PKR)', key: 'profit', width: 15 },
  ];

  // Cash Sales
  cashSales.forEach((order: any) => {
    const itemDetails = order.items.map((i: any) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(' | ');
    sheet.addRow({
      date: order.createdAt.toLocaleString(),
      type: 'CASH',
      customer: 'Walk-in',
      items: itemDetails,
      total: order.totalAmount,
      profit: calcSaleProfit(order.items as unknown as OrderItem[])
    });
  });

  // Udhar Sales
  udharSales.forEach((tx: any) => {
    const itemDetails = tx.items.map((i: any) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(' | ');
    sheet.addRow({
      date: tx.createdAt.toLocaleString(),
      type: 'UDHAR',
      customer: tx.customer.name,
      items: itemDetails,
      total: tx.totalAmount,
      profit: calcSaleProfit(tx.items as unknown as OrderItem[])
    });
  });

  // Styling
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

  const fileName = `Sales_Report_${period || 'custom'}_${new Date().toISOString().split('T')[0]}.${format}`;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    await workbook.csv.write(res);
  } else {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    await workbook.xlsx.write(res);
  }
  res.end();
});

export const getNotifications = catchAsync(async (req: Request, res: Response) => {
  const notifications = await prisma.adminNotification.findMany({
    where: {
      type: { notIn: ['LOW_STOCK', 'OUT_OF_STOCK'] }
    },
    orderBy: { createdAt: 'desc' },
    take: 30
  });
  res.json(notifications);
});

export const markAsRead = catchAsync(async (req: Request, res: Response) => {
  await prisma.adminNotification.update({
    where: { id: req.params.id as string },
    data: { isRead: true }
  });
  res.json({ success: true });
});

// Helper for other controllers
export const createNotification = async (title: string, message: string, type: string = 'LOW_STOCK') => {
  return await prisma.adminNotification.create({
    data: { title, message, type }
  });
};

export const getInventoryValue = catchAsync(async (req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { name: 'asc' }
  });

  const detailedValue = products.map((p: any) => {
    const costPerUnit = p.piecesPerUnit > 1 ? p.buyPrice / p.piecesPerUnit : p.buyPrice;
    const value = costPerUnit * p.stock;
    return {
      id: p.id,
      name: p.name,
      category: p.category?.name || 'General',
      sku: p.sku,
      unit: p.unit,
      costPerUnit,
      stock: p.stock,
      value
    };
  });

  const grandTotal = detailedValue.reduce((sum: number, item: any) => sum + item.value, 0);

  res.json({
    products: detailedValue,
    grandTotal
  });
});
