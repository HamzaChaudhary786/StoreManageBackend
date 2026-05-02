import { Router } from 'express';
import { createSale, getSalesHistory, revertCashSale } from '../controllers/orderController';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.use(protect, authorizeAdmin);

router.route('/')
  .get(getSalesHistory)
  .post(createSale);

router.delete('/:id', revertCashSale);

export default router;
