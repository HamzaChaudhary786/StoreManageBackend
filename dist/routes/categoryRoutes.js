"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categoryController_1 = require("../controllers/categoryController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.protect, authMiddleware_1.authorizeAdmin);
router.route('/')
    .get(categoryController_1.getCategories)
    .post(categoryController_1.createCategory);
exports.default = router;
//# sourceMappingURL=categoryRoutes.js.map