import { Router } from 'express';
import { getCustomers, getCustomerById, createCustomer, addUdharTransaction, payUdhar, revertTransaction, paySpecificTransaction, deleteCustomer, updateCustomer } from '../controllers/customerController';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.use(protect, authorizeAdmin);

router.route('/')
  .get(getCustomers)
  .post(createCustomer);

router.route('/:id')
  .get(getCustomerById)
  .patch(updateCustomer)
  .delete(deleteCustomer);

router.post('/transaction', addUdharTransaction);
router.delete('/transaction/:transactionId', revertTransaction);
router.post('/pay', payUdhar);
router.post('/pay-transaction/:id', paySpecificTransaction);

export default router;
