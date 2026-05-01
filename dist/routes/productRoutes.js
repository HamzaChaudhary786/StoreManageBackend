"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.protect, authMiddleware_1.authorizeAdmin);
router.route('/')
    .get(productController_1.getProducts)
    .post(productController_1.createProduct);
router.route('/:id')
    .get(productController_1.getProductById)
    .put(productController_1.updateProduct)
    .delete(productController_1.deleteProduct);
router.patch('/:id/category', productController_1.switchCategory);
router.route('/:id/stock')
    .patch(productController_1.updateStock);
router.post('/bulk-import', productController_1.bulkImportProducts);
exports.default = router;
//# sourceMappingURL=productRoutes.js.map