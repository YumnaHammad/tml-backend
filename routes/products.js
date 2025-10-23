const express = require('express');
const { 
  getAllProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  deleteProduct,
  generateSKU
} = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public routes - anyone can view products
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Admin-only routes - only admins can create, update, delete products
router.post('/generate-sku', authenticateToken, requireAdmin, generateSKU);
router.post('/', authenticateToken, requireAdmin, createProduct);
router.put('/:id', authenticateToken, requireAdmin, updateProduct);
router.delete('/:id', authenticateToken, requireAdmin, deleteProduct);

module.exports = router;