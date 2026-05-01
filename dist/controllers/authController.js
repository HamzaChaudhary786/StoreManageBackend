"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshToken = exports.logout = exports.login = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
const generateTokens = (adminId) => {
    const accessToken = jsonwebtoken_1.default.sign({ id: adminId }, process.env.JWT_SECRET, { expiresIn: '1d' }); // Longer session for admin convenience
    const refreshToken = jsonwebtoken_1.default.sign({ id: adminId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};
exports.login = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { email, password } = req.body;
    const admin = await server_1.prisma.admin.findUnique({ where: { email } });
    if (!admin || !(await bcrypt_1.default.compare(password, admin.password))) {
        res.status(401);
        throw new Error('Invalid admin credentials');
    }
    const { accessToken, refreshToken } = generateTokens(admin.id);
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.status(200).json({
        user: { id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' },
        accessToken
    });
});
const logout = (req, res) => {
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
};
exports.logout = logout;
// Refresh token logic
exports.refreshToken = (0, catchAsync_1.catchAsync)(async (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) {
        res.status(401);
        throw new Error('No refresh token provided');
    }
    const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_REFRESH_SECRET);
    const admin = await server_1.prisma.admin.findUnique({ where: { id: decoded.id } });
    if (!admin) {
        res.status(401);
        throw new Error('Admin not found');
    }
    const tokens = generateTokens(admin.id);
    res.status(200).json({ accessToken: tokens.accessToken });
});
//# sourceMappingURL=authController.js.map