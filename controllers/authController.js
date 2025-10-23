const jwt = require('jsonwebtoken');
const User = require('../models/User');
const bcrypt = require('bcryptjs'); 
const { createAuditLog } = require('../middleware/audit'); // optional if used

// ✅ REGISTER
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password: password.trim(), // ⚠️ Don't hash manually here
      role: role || 'employee',
      isActive: true,
    });

    await newUser.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser._id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
    

    const user = await User.findOne({ email: cleanedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials - user not found' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    
    // Test with cleaned password
    const isPasswordValid = await user.comparePassword(cleanedPassword);

    if (!isPasswordValid) {
    
      for (let i = 0; i < cleanedPassword.length; i++) {
        console.log(`  ${i}: '${cleanedPassword[i]}' - Code: ${cleanedPassword.charCodeAt(i)}`);
      }
      
      // Try different comparison methods
      const directCompare = await bcrypt.compare(cleanedPassword, user.password);
      
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
    res.status(500).json({ error: 'Internal server error' });
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
