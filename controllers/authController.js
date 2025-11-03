const jwt = require('jsonwebtoken');
const User = require('../models/User');
const bcrypt = require('bcryptjs'); 
const { createAuditLog } = require('../middleware/audit'); // optional if used
const { sendRegistrationNotification } = require('../utils/emailService');

// ✅ REGISTER - DISABLED
const register = async (req, res) => {
  // Registration is completely disabled
  return res.status(403).json({ 
    error: 'Registration is currently disabled. New user registration is not allowed. Please contact administrator.' 
  });
};


// ✅ LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Clean the inputs
    const cleanedEmail = email.toString().toLowerCase().trim();
    const cleanedPassword = password.toString().trim();
    
    // Only allow specific authorized emails to login
    const allowedEmails = [
      'admin@tml.com',
      'manager@tml.com',
      'agent@tml.com'
    ];
    
    if (!allowedEmails.includes(cleanedEmail)) {
      return res.status(403).json({ error: 'Invalid credentials' });
    }

    const user = await User.findOne({ email: cleanedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    
    // Test with cleaned password
    const isPasswordValid = await user.comparePassword(cleanedPassword);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
};

// ✅ PROFILE
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { register, login, getProfile };
