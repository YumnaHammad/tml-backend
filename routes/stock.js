const express = require('express');
const { 
  getStockAlerts, 
  getProductStockMovements, 
  getCurrentStockLevels, 
  transferStock,
  adjustStock 
} = require('../controllers/stockController');

const router = express.Router();

// Public routes (no auth required for testing)
router.get('/alerts', getStockAlerts);
router.get('/movements/:productId', getProductStockMovements);
router.get('/levels', getCurrentStockLevels);
router.post('/transfer', transferStock);
router.post('/adjust', adjustStock);

module.exports = router;