// Test script to verify Chatwoot routes are properly set up
const path = require('path');

console.log('🧪 Testing Chatwoot Routes Setup...\n');

// Test 1: Check if route file exists
try {
  const routePath = path.join(__dirname, 'routes', 'chatwoot.js');
  require(routePath);
  console.log('✅ Route file (chatwoot.js) loads successfully');
} catch (error) {
  console.error('❌ Error loading route file:', error.message);
  process.exit(1);
}

// Test 2: Check if controller file exists
try {
  const controllerPath = path.join(__dirname, 'controllers', 'chatwootController.js');
  require(controllerPath);
  console.log('✅ Controller file (chatwootController.js) loads successfully');
} catch (error) {
  console.error('❌ Error loading controller file:', error.message);
  process.exit(1);
}

// Test 3: Check if middleware exists
try {
  const authMiddleware = require('./middleware/auth');
  if (authMiddleware.optionalAuthenticate) {
    console.log('✅ Middleware (optionalAuthenticate) exists');
  } else {
    console.error('❌ optionalAuthenticate not found in auth middleware');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error loading middleware:', error.message);
  process.exit(1);
}

// Test 4: Check if express is available
try {
  require('express');
  console.log('✅ Express is installed');
} catch (error) {
  console.error('❌ Express not found. Run: npm install');
  process.exit(1);
}

// Test 5: Check if axios is available
try {
  require('axios');
  console.log('✅ Axios is installed');
} catch (error) {
  console.error('❌ Axios not found. Run: npm install axios');
  process.exit(1);
}

console.log('\n✅ All checks passed! Chatwoot routes should work correctly.');
console.log('\n📝 Next steps:');
console.log('1. Make sure your backend server is running: npm run dev');
console.log('2. Test the route: http://localhost:5000/api/chatwoot/test');
console.log('3. Check server logs for "✅ Chatwoot routes loaded successfully"');

