const express = require('express');

const router = express.Router();

// Public routes (no auth required for testing)
// Placeholder routes - receipts are created automatically via purchase confirmations
router.get('/', (req, res) => {
  res.json({ message: 'Receipts are created automatically when purchases are confirmed' });
});

router.get('/:id', (req, res) => {
  res.json({ message: 'Receipt details endpoint - to be implemented' });
});

module.exports = router;