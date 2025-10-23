const express = require('express');
const router = express.Router();
const {
  updateDispatchStatus,
  getAllDispatches,
  getDispatchById
} = require('../controllers/dispatchController');

// @route   GET /api/dispatches
// @desc    Get all dispatches
// @access  Public (for testing)
router.get('/', getAllDispatches);

// @route   GET /api/dispatches/:id
// @desc    Get dispatch by ID
// @access  Public (for testing)
router.get('/:id', getDispatchById);

// @route   PUT /api/dispatches/:id/status
// @desc    Update dispatch status
// @access  Public (for testing)
router.put('/:id/status', updateDispatchStatus);

module.exports = router;