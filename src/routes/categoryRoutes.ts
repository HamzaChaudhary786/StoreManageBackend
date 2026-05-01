import { Router } from 'express';
import { getCategories, createCategory } from '../controllers/categoryController';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.use(protect, authorizeAdmin);

router.route('/')
  .get(getCategories)
  .post(createCategory);

export default router;
