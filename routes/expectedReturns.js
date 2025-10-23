const express = require('express');
const {
  getAllExpectedReturns,
  getExpectedReturnById,
  createExpectedReturn,
  updateExpectedReturnStatus,
  getExpectedReturnsByProduct,
  deleteExpectedReturn,
  processReturnReceived
} = require('../controllers/expectedReturnController');
const { optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// Routes with optional authentication
router.get('/', optionalAuthenticate, getAllExpectedReturns);
router.get('/by-product', optionalAuthenticate, getExpectedReturnsByProduct);
router.get('/:id', optionalAuthenticate, getExpectedReturnById);
router.post('/', optionalAuthenticate, createExpectedReturn);
router.patch('/:id/status', optionalAuthenticate, updateExpectedReturnStatus);
router.post('/:id/receive', optionalAuthenticate, processReturnReceived);
router.delete('/:id', optionalAuthenticate, deleteExpectedReturn);

module.exports = router;

