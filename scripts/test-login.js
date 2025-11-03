/**
 * Test login script
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

const testCredentials = [
  { email: 'admin@tml.com', password: 'AdminMart1122' },
  { email: 'manager@tml.com', password: 'Inventory00' },
  { email: 'agent@tml.com', password: 'Agent123' }
];

async function testLogin() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI not found');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    for (const cred of testCredentials) {
      console.log(`Testing: ${cred.email}`);
      
      const user = await User.findOne({ email: cred.email.toLowerCase() });
      
      if (!user) {
        console.log(`  ❌ User not found in database\n`);
        continue;
      }

      console.log(`  ✅ User found: ${user.firstName} ${user.lastName}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  Active: ${user.isActive}`);
      console.log(`  Has password: ${!!user.password}`);
      console.log(`  Password length: ${user.password ? user.password.length : 0}`);

      // Test password
      const isValid = await user.comparePassword(cred.password);
      console.log(`  Password valid: ${isValid ? '✅ YES' : '❌ NO'}`);
      
      // Also test with direct bcrypt
      const directTest = await bcrypt.compare(cred.password, user.password);
      console.log(`  Direct bcrypt test: ${directTest ? '✅ YES' : '❌ NO'}\n`);
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

testLogin();

