/**
 * Fix user passwords
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

const usersToFix = [
  { email: 'admin@tml.com', password: 'AdminMart1122' },
  { email: 'manager@tml.com', password: 'Inventory00' },
  { email: 'agent@tml.com', password: 'Agent123' }
];

async function fixPasswords() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI not found');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    for (const cred of usersToFix) {
      const user = await User.findOne({ email: cred.email.toLowerCase() });
      
      if (!user) {
        console.log(`❌ User not found: ${cred.email}`);
        continue;
      }

      // Hash the password correctly
      const hashedPassword = await bcrypt.hash(cred.password, 10);
      
      // Update password directly in database (bypassing pre-save hook)
      await User.updateOne(
        { _id: user._id },
        { $set: { password: hashedPassword } }
      );

      // Verify the password works
      const updatedUser = await User.findById(user._id);
      const isValid = await updatedUser.comparePassword(cred.password);
      
      console.log(`${isValid ? '✅' : '❌'} Fixed password for ${cred.email}: ${isValid ? 'WORKING' : 'FAILED'}`);
    }

    console.log('\n✅ Password fix completed!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixPasswords();

