/**
 * Seed script to create default users
 * Run: node scripts/seed-users.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('../models/User');

// Users to create
const usersToCreate = [
  {
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@tml.com',
    password: 'AdminMart1122',
    role: 'admin',
    isActive: true
  },
  {
    firstName: 'Manager',
    lastName: 'User',
    email: 'manager@tml.com',
    password: 'Inventory00',
    role: 'manager',
    isActive: true
  },
  {
    firstName: 'Agent',
    lastName: 'User',
    email: 'agent@tml.com',
    password: 'Agent123',
    role: 'agent',
    isActive: true
  }
];

async function seedUsers() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI;
    
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ Connected to MongoDB');

    // Clear existing users with these emails (optional - uncomment if you want to reset)
    // await User.deleteMany({ 
    //   email: { $in: usersToCreate.map(u => u.email.toLowerCase()) } 
    // });
    // console.log('🗑️  Cleared existing users with these emails');

    // Create users
    const createdUsers = [];
    const skippedUsers = [];

    for (const userData of usersToCreate) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ 
          email: userData.email.toLowerCase() 
        });

        if (existingUser) {
          console.log(`⚠️  User ${userData.email} already exists. Skipping...`);
          skippedUsers.push(userData.email);
          continue;
        }

        // Hash password manually (since we're creating directly, we bypass the pre-save hook)
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        // Create new user
        const newUser = new User({
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email.toLowerCase(),
          password: hashedPassword,
          role: userData.role,
          isActive: userData.isActive
        });

        await newUser.save();
        createdUsers.push({
          email: newUser.email,
          role: newUser.role,
          name: `${newUser.firstName} ${newUser.lastName}`
        });
        
        console.log(`✅ Created user: ${newUser.email} (${newUser.role})`);
      } catch (error) {
        console.error(`❌ Error creating user ${userData.email}:`, error.message);
      }
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log(`   ✅ Created: ${createdUsers.length} users`);
    console.log(`   ⚠️  Skipped: ${skippedUsers.length} users (already exist)`);
    
    if (createdUsers.length > 0) {
      console.log('\n👤 Created Users:');
      createdUsers.forEach(user => {
        console.log(`   - ${user.email} (${user.role}) - ${user.name}`);
      });
    }

    if (skippedUsers.length > 0) {
      console.log('\n⚠️  Skipped Users (already exist):');
      skippedUsers.forEach(email => {
        console.log(`   - ${email}`);
      });
    }

    console.log('\n🎉 Seed script completed!');
    
    // Close connection
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed script error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed function
seedUsers();

