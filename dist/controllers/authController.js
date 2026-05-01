"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
const generateTokens = (userId) => {
    const accessToken = jsonwebtoken_1.default.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jsonwebtoken_1.default.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};
exports.register = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { name, email, password } = req.body;
    const existingUser = await server_1.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        res.status(400);
        throw new Error('User already exists');
    }
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    const user = await server_1.prisma.user.create({
        data: { name, email, password: hashedPassword }
    });
    const { accessToken, refreshToken } = generateTokens(user.id);
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    res.status(201).json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken
    });
});
exports.login = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { email, password } = req.body;
    const user = await server_1.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt_1.default.compare(password, user.password))) {
        res.status(401);
        throw new Error('Invalid email or password');
    }
    const { accessToken, refreshToken } = generateTokens(user.id);
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.status(200).json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken
    });
});
const logout = (req, res) => {
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
};
exports.logout = logout;
//# sourceMappingURL=authController.js.map