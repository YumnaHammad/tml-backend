const express = require('express');
const { 
  getAllWarehouses, 
  getWarehouseById, 
  createWarehouse, 
  updateWarehouse, 
  deleteWarehouse,
  addStock,
  transferStock
} = require('../controllers/warehouseController');

const router = express.Router();

// Public routes (no auth required for testing)
router.get('/', getAllWarehouses);
router.get('/:id', getWarehouseById);
router.post('/', createWarehouse);
router.put('/:id', updateWarehouse);
router.delete('/:id', deleteWarehouse);
router.post('/:id/add-stock', addStock);
router.post('/:id/transfer', transferStock);

module.exports = router;