const express = require('express');
const {
  getAllOldCRMActivities,
  getOldCRMActivityById,
  createOldCRMActivity,
  updateOldCRMActivity,
  deleteOldCRMActivity,
  getOldCRMStats,
  getOldCRMActivitiesByCustomer
} = require('../controllers/oldCrmController');
const { optionalAuthenticate } = require('../middleware/auth');

const router = express.Router();

// Get all Old CRM activities
router.get('/', optionalAuthenticate, getAllOldCRMActivities);

// Get Old CRM statistics
router.get('/stats', optionalAuthenticate, getOldCRMStats);

// Get activities by customer
router.get('/customer/:customerId', optionalAuthenticate, getOldCRMActivitiesByCustomer);

// Get Old CRM activity by ID
router.get('/:id', optionalAuthenticate, getOldCRMActivityById);

// Create new Old CRM activity
router.post('/', optionalAuthenticate, createOldCRMActivity);

// Update Old CRM activity
router.put('/:id', optionalAuthenticate, updateOldCRMActivity);
router.patch('/:id', optionalAuthenticate, updateOldCRMActivity);

// Delete Old CRM activity
router.delete('/:id', optionalAuthenticate, deleteOldCRMActivity);

module.exports = router;

