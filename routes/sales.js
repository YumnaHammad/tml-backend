const express = require('express');
const { 
  createSalesOrder, 
  getAllSalesOrders, 
  getSalesOrderById, 
  updateSalesOrderStatus,
  dispatchSalesOrder,
  markDeliveryCompleted,
  deleteSalesOrder 
} = require('../controllers/salesController');
const { optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// Routes with optional authentication
router.get('/', optionalAuthenticate, getAllSalesOrders);
router.get('/:id', optionalAuthenticate, getSalesOrderById);
router.post('/', optionalAuthenticate, createSalesOrder);
router.put('/:id/status', optionalAuthenticate, updateSalesOrderStatus);
router.patch('/:id/status', optionalAuthenticate, updateSalesOrderStatus);
router.post('/:id/dispatch', optionalAuthenticate, dispatchSalesOrder);
router.post('/:id/deliver', optionalAuthenticate, markDeliveryCompleted);
router.delete('/:id', optionalAuthenticate, deleteSalesOrder);

module.exports = router;