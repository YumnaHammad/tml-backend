const express = require('express');
const router = express.Router();
const {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  getSupplierStats,
  getSupplierSpendingAnalytics,
  getTopSuppliers,
  updateSupplierRating,
  togglePreferredSupplier,
  getSupplierOrders,
  getSupplierAnalytics
} = require('../controllers/supplierController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// @route   GET /api/suppliers
// @desc    Get all suppliers with pagination, filtering, and search
// @access  Private
router.get('/', getAllSuppliers);

// @route   GET /api/suppliers/stats
// @desc    Get supplier statistics
// @access  Private
router.get('/stats', getSupplierStats);

// @route   GET /api/suppliers/analytics/spending
// @desc    Get supplier spending analytics by period
// @access  Private
router.get('/analytics/spending', authenticateToken, getSupplierSpendingAnalytics);

// @route   GET /api/suppliers/top
// @desc    Get top suppliers by spending
// @access  Private
router.get('/top', authenticateToken, getTopSuppliers);

// @route   GET /api/suppliers/:id
// @desc    Get supplier by ID
// @access  Private
router.get('/:id', authenticateToken, getSupplierById);

// @route   POST /api/suppliers
// @desc    Create new supplier
// @access  Public (temporarily for testing)
router.post('/', createSupplier);

// @route   PUT /api/suppliers/:id
// @desc    Update supplier
// @access  Private (Admin only)
router.put('/:id', authenticateToken, requireAdmin, updateSupplier);


// @route   PUT /api/suppliers/:id/rating
// @desc    Update supplier rating
// @access  Private (Admin only)
router.put('/:id/rating', authenticateToken, requireAdmin, updateSupplierRating);

// @route   PUT /api/suppliers/:id/preferred
// @desc    Toggle supplier preferred status
// @access  Private (Admin only)
router.put('/:id/preferred', authenticateToken, requireAdmin, togglePreferredSupplier);

// @route   GET /api/suppliers/:supplierId/orders
// @desc    Get supplier orders
// @access  Private
router.get('/:supplierId/orders', authenticateToken, getSupplierOrders);

// @route   GET /api/suppliers/:supplierId/analytics
// @desc    Get supplier analytics
// @access  Private
router.get('/:supplierId/analytics', authenticateToken, getSupplierAnalytics);

module.exports = router;