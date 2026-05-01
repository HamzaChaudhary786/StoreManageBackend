"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const adminController_1 = require("../controllers/adminController");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.protect, authMiddleware_1.authorizeAdmin);
router.get('/stats', adminController_1.getDashboardStats);
router.get('/inventory-value', adminController_1.getInventoryValue);
router.get('/notifications', adminController_1.getNotifications);
router.get('/export-sales', adminController_1.exportSalesReport);
router.get('/sales-report-data', adminController_1.getSalesReportData);
exports.default = router;
//# sourceMappingURL=adminRoutes.js.map