const express = require('express');
const { register, login, getProfile } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /register - Returns API documentation for the register endpoint
router.get('/register', (req, res) => {
  res.json({
    endpoint: '/api/auth/register',
    method: 'POST',
    description: 'Register a new user account',
    contentType: 'application/json',
    requiredFields: {
      firstName: 'string (required)',
      lastName: 'string (required)',
      email: 'string (required)',
      password: 'string (required)',
      role: 'string (optional, default: "employee")'
    },
    example: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'SecurePassword123',
      role: 'employee'
    },
    possibleRoles: ['admin', 'manager', 'employee'],
    note: 'Please use POST method to register. GET method is for documentation only.'
  });
});

router.post('/register', register); // POST http://localhost:5000/api/auth/register

// GET /login - Returns API documentation for the login endpoint
router.get('/login', (req, res) => {
  res.json({
    endpoint: '/api/auth/login',
    method: 'POST',
    description: 'Login to get authentication token',
    contentType: 'application/json',
    requiredFields: {
      email: 'string (required)',
      password: 'string (required)'
    },
    example: {
      email: 'john.doe@example.com',
      password: 'SecurePassword123'
    },
    note: 'Please use POST method to login. GET method is for documentation only.'
  });
});

router.post('/login', login);       // POST http://localhost:5000/api/auth/login
router.get('/profile', authenticateToken, getProfile); // GET profile

// GET /users - Public endpoint to view all registered users (for testing)
router.get('/users', async (req, res) => {
  try {
    const User = require('../models/User');
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ 
      count: users.length,
      users: users.map(u => ({
        _id: u._id,
        id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        phone: u.phone,
        department: u.department,
        position: u.position,
        employeeId: u.employeeId,
        lastLogin: u.lastLogin,
        loginCount: u.loginCount,
        address: u.address,
        emergencyContact: u.emergencyContact,
        hireDate: u.hireDate,
        notes: u.notes,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;
