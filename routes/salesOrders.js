const express = require('express');
const router = express.Router();
const {
  createSalesOrder,
  getAllSalesOrders,
  updateSalesOrder,
  submitSalesOrder
} = require('../controllers/salesOrderController');

// @route   POST /api/sales-orders
// @desc    Create draft sales order
// @access  Public (for testing)
router.post('/', createSalesOrder);

// @route   GET /api/sales-orders
// @desc    Get all sales orders
// @access  Public (for testing)
router.get('/', getAllSalesOrders);

// @route   PUT /api/sales-orders/:id
// @desc    Update draft sales order
// @access  Public (for testing)
router.put('/:id', updateSalesOrder);

// @route   POST /api/sales-orders/:id/submit
// @desc    Submit sales order
// @access  Public (for testing)
router.post('/:id/submit', submitSalesOrder);

module.exports = router;
