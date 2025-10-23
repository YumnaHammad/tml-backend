# Backend Deployment Guide for Vercel

## 🚀 Your backend is now ready for Vercel serverless deployment!

### ✅ What's been configured:

1. **Database Connection Middleware** - Prevents reconnection on every request
2. **Serverless Function Export** - `module.exports = app` for Vercel
3. **Environment Variables** - Properly configured in `env` file
4. **CORS Configuration** - Uses `FRONTEND_URL` environment variable
5. **Vercel Scripts** - Added `vercel-start` script in package.json

### 📋 Environment Variables Required:

#### For Local Development (in `env` file):
```
MONGODB_URI=mongodb+srv://inventory:leader12@cluster0.earrfsb.mongodb.net/inventory_system?retryWrites=true&w=majority
NODE_ENV=development
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-here
FRONTEND_URL=http://localhost:3000
```

#### For Production (set in Vercel Dashboard):
```
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-jwt-secret
FRONTEND_URL=https://your-frontend-domain.vercel.app
NODE_ENV=production
```

### 🚀 Deployment Steps:

#### 1. Install Vercel CLI:
```bash
npm install -g vercel
```

#### 2. Login to Vercel:
```bash
vercel login
```

#### 3. Deploy your backend:
```bash
vercel
```

#### 4. Set Environment Variables in Vercel Dashboard:
1. Go to your project in Vercel dashboard
2. Go to Settings → Environment Variables
3. Add these variables:
   - `MONGODB_URI` (your production MongoDB URI)
   - `JWT_SECRET` (generate a strong secret)
   - `FRONTEND_URL` (your frontend Vercel URL)
   - `NODE_ENV` = `production`

#### 5. Redeploy after setting environment variables:
```bash
vercel --prod
```

### 🔗 Connecting Frontend to Backend:

In your frontend's environment variables, set:
```
REACT_APP_API_URL=https://your-backend-domain.vercel.app/api
```

### 🧪 Testing Your Deployment:

1. **Health Check**: `https://your-backend-domain.vercel.app/api/health`
2. **Test API Endpoints**: All your existing endpoints will work
3. **CORS**: Should work with your frontend URL

### 📁 File Structure:
```
backend/
├── server.js              # ✅ Modified for serverless
├── package.json           # ✅ Added vercel-start script
├── vercel.json           # ✅ Configured for serverless
├── env                   # ✅ Environment variables
├── routes/               # ✅ All your existing routes
├── controllers/          # ✅ All your existing controllers
├── models/               # ✅ All your existing models
└── middleware/           # ✅ All your existing middleware
```

### 🔧 Key Features:

- **Database Connection Middleware**: Prevents reconnection on every request
- **Serverless Optimized**: Works with Vercel's serverless functions
- **CORS Configured**: Uses environment variable for frontend URL
- **Error Handling**: Proper error handling for database connections
- **Local Development**: Still works with `npm run dev`

### 🚨 Important Notes:

1. **Database Connection**: The middleware ensures stable database connections
2. **Cold Starts**: First request might be slower due to cold start
3. **Environment Variables**: Make sure to set them in Vercel dashboard
4. **CORS**: Update `FRONTEND_URL` when you deploy your frontend

### 🆘 Troubleshooting:

1. **Database Connection Issues**: Check your MongoDB URI
2. **CORS Errors**: Verify `FRONTEND_URL` is set correctly
3. **Environment Variables**: Make sure all are set in Vercel dashboard
4. **Function Timeout**: Default is 30 seconds (configurable in vercel.json)

Your backend is now ready for production deployment! 🎉
