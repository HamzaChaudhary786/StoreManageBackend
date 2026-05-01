import { Request, Response } from 'express';
import { prisma } from '../server';
import { catchAsync } from '../utils/catchAsync';

export const getCategories = catchAsync(async (req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: { products: true }
      }
    },
    orderBy: { name: 'asc' }
  });
  res.json(categories);
});

export const createCategory = catchAsync(async (req: Request, res: Response) => {
  const { name, description } = req.body;
  const category = await prisma.category.create({
    data: { name, description }
  });
  res.status(201).json(category);
});
