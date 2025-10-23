#!/usr/bin/env node

const app = require('./server.js');
const request = require('supertest');

console.log('🧪 Testing Backend for Vercel Deployment...\n');

async function testBackend() {
  try {
    console.log('1. Testing health endpoint...');
    const healthResponse = await request(app)
      .get('/api/health')
      .expect(200);
    
    console.log('✅ Health endpoint working:', healthResponse.body);
    
    console.log('\n2. Testing CORS headers...');
    const corsResponse = await request(app)
      .options('/api/health')
      .expect(200);
    
    console.log('✅ CORS preflight working');
    
    console.log('\n3. Testing auth endpoint...');
    const authResponse = await request(app)
      .get('/api/auth/register')
      .expect(200);
    
    console.log('✅ Auth endpoint working');
    
    console.log('\n4. Testing products endpoint...');
    const productsResponse = await request(app)
      .get('/api/products')
      .expect(200);
    
    console.log('✅ Products endpoint working');
    
    console.log('\n🎉 All tests passed! Your backend is ready for Vercel deployment.');
    console.log('\n📋 Next steps:');
    console.log('1. Run: vercel login');
    console.log('2. Run: vercel');
    console.log('3. Set environment variables in Vercel dashboard');
    console.log('4. Run: vercel --prod');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure all dependencies are installed: npm install');
    console.log('2. Check your MongoDB connection');
    console.log('3. Verify environment variables in env file');
  }
}

// Run the test
testBackend();
