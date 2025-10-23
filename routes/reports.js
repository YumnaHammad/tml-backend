const express = require('express');
const { 
  getDashboardSummary,
  getMainDashboardReport,
  getDailyStockReport,
  getWeeklySalesReport,
  getMonthlySalesReport,
  getMonthlyInventoryReport,
  getSupplierPerformanceReport,
  getReturnAnalysisReport
} = require('../controllers/reportController');

const router = express.Router();

// Public routes (no auth required for testing)
router.get('/dashboard/summary', getDashboardSummary);
router.get('/dashboard/main', getMainDashboardReport);
router.get('/daily-stock', getDailyStockReport);
router.get('/weekly-sales', getWeeklySalesReport);
router.get('/monthly-sales', getMonthlySalesReport);
router.get('/monthly-inventory', getMonthlyInventoryReport);
router.get('/supplier-performance', getSupplierPerformanceReport);
router.get('/return-analysis', getReturnAnalysisReport);

module.exports = router;