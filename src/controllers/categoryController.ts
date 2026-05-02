import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/appError';

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

export const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const category = await prisma.category.update({
    where: { id },
    data: { name, description }
  });

  res.json(category);
});

export const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if category has products
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } }
  });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  if (category._count.products > 0) {
    throw new AppError('Cannot delete category with existing products. Please move or delete products first.', 400);
  }

  await prisma.category.delete({
    where: { id }
  });

  res.status(204).json({ status: 'success' });
});
