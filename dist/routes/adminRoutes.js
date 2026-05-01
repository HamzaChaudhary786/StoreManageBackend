"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const adminController_1 = require("../controllers/adminController");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.protect, (0, authMiddleware_1.authorize)('ADMIN'));
router.get('/udhar-report', adminController_1.getUdharReport);
router.get('/udhar-report/csv', adminController_1.downloadUdharCSV);
router.get('/notifications', adminController_1.getNotifications);
exports.default = router;
//# sourceMappingURL=adminRoutes.js.map