const express = require('express');
const {
  getChatwootConversations,
  getChatwootConversationById,
} = require('../controllers/chatwootController');
const { optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// Test route to verify chatwoot routes are loaded
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Chatwoot routes are working',
    timestamp: new Date().toISOString()
  });
});

// Get all conversations from Chatwoot
router.get('/conversations', optionalAuthenticate, getChatwootConversations);

// Get single conversation by ID
router.get('/conversations/:id', optionalAuthenticate, getChatwootConversationById);

module.exports = router;


