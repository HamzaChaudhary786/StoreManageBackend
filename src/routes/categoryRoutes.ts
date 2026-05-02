import { Router } from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categoryController';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.use(protect, authorizeAdmin);

router.route('/')
  .get(getCategories)
  .post(createCategory);

router.route('/:id')
  .patch(updateCategory)
  .delete(deleteCategory);

export default router;
