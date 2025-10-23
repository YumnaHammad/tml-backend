const express = require('express');
const {
  generatePurchaseInvoice,
  generateSalesInvoice,
  getAllInvoices,
  getInvoiceById,
  downloadInvoicePDF,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoiceStatistics
} = require('../controllers/invoiceController');

const router = express.Router();

// Public routes (no auth required for testing)
router.get('/', getAllInvoices);
router.get('/statistics', getInvoiceStatistics);
router.get('/:id', getInvoiceById);
router.get('/:id/pdf', downloadInvoicePDF);
router.post('/purchase/:purchaseId', generatePurchaseInvoice);
router.post('/sales/:salesOrderId', generateSalesInvoice);
router.put('/:id/status', updateInvoiceStatus);
router.delete('/:id', deleteInvoice);

module.exports = router;
