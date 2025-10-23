const express = require('express');
const { 
  createPurchase, 
  getAllPurchases, 
  getPurchaseById, 
  updatePurchaseStatus,
  generateReceipt,
  generateInvoice,
  markPaymentCleared,
  downloadDocument,
  deletePurchase 
} = require('../controllers/purchaseController');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// Health check for purchases endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Purchases endpoint is working',
    timestamp: new Date().toISOString()
  });
});

// Routes with optional authentication (will work with or without login)
router.get('/', optionalAuthenticate, getAllPurchases);
router.get('/:id', optionalAuthenticate, getPurchaseById);
router.post('/', optionalAuthenticate, createPurchase);
router.put('/:id/status', optionalAuthenticate, updatePurchaseStatus);
router.post('/:id/receipt', optionalAuthenticate, generateReceipt);
router.post('/:id/invoice', optionalAuthenticate, generateInvoice);
router.post('/:id/clear-payment', optionalAuthenticate, markPaymentCleared);
router.get('/:id/download', optionalAuthenticate, downloadDocument);
router.delete('/:id', optionalAuthenticate, deletePurchase);

module.exports = router;