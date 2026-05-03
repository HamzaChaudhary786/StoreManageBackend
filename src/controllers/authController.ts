import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { catchAsync } from '../utils/catchAsync';

const generateTokens = (adminId: string) => {
  const accessToken = jwt.sign({ id: adminId }, process.env.JWT_SECRET as string, { expiresIn: '1d' }); // Longer session for admin convenience
  const refreshToken = jwt.sign({ id: adminId }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  // Case-insensitive email search
  const admin = await prisma.admin.findUnique({ 
    where: { email: email.toLowerCase().trim() } 
  });

  if (!admin) {
    res.status(401);
    throw new Error('No account found with this email');
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid password');
  }
  
  const { accessToken, refreshToken } = generateTokens(admin.id);
  
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  
  res.status(200).json({
    admin: { id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' },
    token: accessToken
  });
});

export const logout = (req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  res.status(200).json({ message: 'Logged out successfully' });
};

// Refresh token logic
export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    res.status(401);
    throw new Error('No refresh token provided');
  }

  const decoded: any = jwt.verify(token, process.env.JWT_REFRESH_SECRET as string);
  const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });

  if (!admin) {
    res.status(401);
    throw new Error('Admin not found');
  }

  const tokens = generateTokens(admin.id);
  res.status(200).json({ accessToken: tokens.accessToken });
});
