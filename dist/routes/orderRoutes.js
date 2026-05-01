"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderController_1 = require("../controllers/orderController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.route('/')
    .post(authMiddleware_1.protect, orderController_1.createOrder);
exports.default = router;
//# sourceMappingURL=orderRoutes.js.map