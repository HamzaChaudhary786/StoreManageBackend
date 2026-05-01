"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeAdmin = exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const server_1 = require("../server");
const catchAsync_1 = require("../utils/catchAsync");
exports.protect = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token');
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const admin = await server_1.prisma.admin.findUnique({
            where: { id: decoded.id },
            select: { id: true, name: true, email: true }
        });
        if (!admin) {
            res.status(401);
            throw new Error('Not authorized, admin not found');
        }
        req.user = { ...admin, role: 'ADMIN' };
        next();
    }
    catch (error) {
        res.status(401);
        throw new Error('Not authorized, token failed');
    }
});
// Simplified authorize for admin only
const authorizeAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403);
        return next(new Error('Not authorized as an admin'));
    }
    next();
};
exports.authorizeAdmin = authorizeAdmin;
//# sourceMappingURL=authMiddleware.js.map