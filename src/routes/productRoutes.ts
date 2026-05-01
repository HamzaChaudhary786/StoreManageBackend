import { Router } from 'express';
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct, updateStock, bulkImportProducts, switchCategory } from '../controllers/productController';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';

const router = Router();

router.use(protect, authorizeAdmin);

router.route('/')
  .get(getProducts)
  .post(createProduct);

router.route('/:id')
  .get(getProductById)
  .put(updateProduct)
  .delete(deleteProduct);

router.patch('/:id/category', switchCategory);

router.route('/:id/stock')
  .patch(updateStock);

router.post('/bulk-import', bulkImportProducts);

export default router;
