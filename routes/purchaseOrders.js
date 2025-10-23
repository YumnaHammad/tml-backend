const express = require('express');
const router = express.Router();
const {
  createPurchaseOrder,
  getAllPurchaseOrders,
  updatePurchaseOrder,
  submitPurchaseOrder
} = require('../controllers/purchaseOrderController');

// @route   POST /api/purchase-orders
// @desc    Create draft purchase order
// @access  Public (for testing)
router.post('/', createPurchaseOrder);

// @route   GET /api/purchase-orders
// @desc    Get all purchase orders
// @access  Public (for testing)
router.get('/', getAllPurchaseOrders);

// @route   PUT /api/purchase-orders/:id
// @desc    Update draft purchase order
// @access  Public (for testing)
router.put('/:id', updatePurchaseOrder);

// @route   POST /api/purchase-orders/:id/submit
// @desc    Submit purchase order
// @access  Public (for testing)
router.post('/:id/submit', submitPurchaseOrder);

module.exports = router;
