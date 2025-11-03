const express = require('express');
const { 
  createSalesOrder, 
  getAllSalesOrders, 
  getSalesOrderById, 
  updateSalesOrder,
  updateSalesOrderStatus,
  dispatchSalesOrder,
  markDeliveryCompleted,
  deleteSalesOrder,
  updateQCStatus
} = require('../controllers/salesController');
const { optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// Routes with optional authentication
router.get('/', optionalAuthenticate, getAllSalesOrders);
router.post('/', optionalAuthenticate, createSalesOrder);
// More specific routes must come before /:id routes
router.put('/:id', optionalAuthenticate, updateSalesOrder);
router.put('/:id/status', optionalAuthenticate, updateSalesOrderStatus);
router.patch('/:id/status', optionalAuthenticate, updateSalesOrderStatus);
router.put('/:id/qc-status', optionalAuthenticate, updateQCStatus);
router.post('/:id/dispatch', optionalAuthenticate, dispatchSalesOrder);
router.post('/:id/deliver', optionalAuthenticate, markDeliveryCompleted);
router.get('/:id', optionalAuthenticate, getSalesOrderById);
router.delete('/:id', optionalAuthenticate, deleteSalesOrder);

module.exports = router;