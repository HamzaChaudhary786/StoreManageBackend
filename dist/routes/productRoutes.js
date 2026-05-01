"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.route('/')
    .get(productController_1.getProducts)
    .post(authMiddleware_1.protect, (0, authMiddleware_1.authorize)('ADMIN'), productController_1.createProduct);
router.route('/:id')
    .get(productController_1.getProductById);
exports.default = router;
//# sourceMappingURL=productRoutes.js.map