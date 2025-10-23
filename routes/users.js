const express = require('express');
const router = express.Router();
const { 
  getAllUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  getUserById 
} = require('../controllers/userController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// @route   GET /api/users
// @desc    Get all users
// @access  Private (Admin only)
router.get('/', authenticateToken, requireAdmin, getAllUsers);

// @route   POST /api/users
// @desc    Create new user
// @access  Private (Admin only)
router.post('/', authenticateToken, requireAdmin, createUser);

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (Admin only)
router.get('/:id', authenticateToken, requireAdmin, getUserById);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (Admin only)
router.put('/:id', authenticateToken, requireAdmin, updateUser);

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, deleteUser);

module.exports = router;
