import { Router } from 'express';
import { getCustomers, getCustomerById, createCustomer, addUdharTransaction, payUdhar, revertTransaction } from '../controllers/customerController';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.use(protect, authorizeAdmin);

router.route('/')
  .get(getCustomers)
  .post(createCustomer);

router.route('/:id')
  .get(getCustomerById);

router.post('/transaction', addUdharTransaction);
router.delete('/transaction/:transactionId', revertTransaction);
router.post('/pay', payUdhar);

export default router;
