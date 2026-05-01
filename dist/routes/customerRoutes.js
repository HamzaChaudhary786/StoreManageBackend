"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const customerController_1 = require("../controllers/customerController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.protect, authMiddleware_1.authorizeAdmin);
router.route('/')
    .get(customerController_1.getCustomers)
    .post(customerController_1.createCustomer);
router.route('/:id')
    .get(customerController_1.getCustomerById);
router.post('/transaction', customerController_1.addUdharTransaction);
router.delete('/transaction/:transactionId', customerController_1.revertTransaction);
router.post('/pay', customerController_1.payUdhar);
exports.default = router;
//# sourceMappingURL=customerRoutes.js.map