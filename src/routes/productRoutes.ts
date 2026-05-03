import { Router } from 'express';
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct, updateStock, bulkImportProducts, switchCategory, bulkCSVUpload } from '../controllers/productController';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for CSV uploads
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

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
router.post('/bulk-csv-upload', upload.single('file'), bulkCSVUpload);

export default router;
