"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderController_1 = require("../controllers/orderController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.protect, authMiddleware_1.authorizeAdmin);
router.route('/')
    .get(orderController_1.getSalesHistory)
    .post(orderController_1.createSale);
exports.default = router;
//# sourceMappingURL=orderRoutes.js.map