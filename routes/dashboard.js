const express = require('express');
const router = express.Router();
const { getDashboardSummary, getModuleAnalytics } = require('../controllers/dashboardController');

// @route   GET /api/dashboard/summary
// @desc    Get dashboard summary
// @access  Public (for testing)
router.get('/summary', getDashboardSummary);

// @route   GET /api/dashboard/analytics/:module
// @desc    Get module-specific analytics
// @access  Public (for testing)
router.get('/analytics/:module', getModuleAnalytics);

module.exports = router;
