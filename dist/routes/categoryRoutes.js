"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categoryController_1 = require("../controllers/categoryController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.route('/')
    .get(categoryController_1.getCategories)
    .post(authMiddleware_1.protect, (0, authMiddleware_1.authorize)('ADMIN'), categoryController_1.createCategory);
exports.default = router;
//# sourceMappingURL=categoryRoutes.js.map