import { Router } from 'express';
import { protect, authorizeAdmin } from '../middlewares/authMiddleware';
import { getDashboardStats, getNotifications, exportSalesReport, getSalesReportData, getInventoryValue } from '../controllers/adminController';

const router = Router();

router.use(protect, authorizeAdmin);

router.get('/stats', getDashboardStats);
router.get('/inventory-value', getInventoryValue);
router.get('/notifications', getNotifications);
router.get('/export-sales', exportSalesReport);
router.get('/sales-report-data', getSalesReportData);

export default router;

