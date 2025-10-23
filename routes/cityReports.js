const express = require('express');
const router = express.Router();
const { getCitySalesReport, getPopularProductsByCity, getCitiesList, getProductDeliveries } = require('../controllers/cityReportController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get city-wise sales report
router.get('/sales', getCitySalesReport);

// Get popular products by city
router.get('/products/:city', getPopularProductsByCity);

// Get product deliveries by city
router.get('/product-deliveries', getProductDeliveries);

// Get cities list
router.get('/cities', getCitiesList);

module.exports = router;
