const express = require('express');
const { 
  createReturn, 
  getAllReturns, 
  getReturnById, 
  processReturn,
  updateReturnStatus,
  deleteReturn 
} = require('../controllers/returnController');

const router = express.Router();

// Public routes (no auth required for testing)
router.get('/', getAllReturns);
router.get('/:id', getReturnById);
router.post('/', createReturn);
router.post('/:id/process', processReturn);
router.put('/:id/status', updateReturnStatus);
router.delete('/:id', deleteReturn);

module.exports = router;