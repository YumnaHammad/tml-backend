const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');

// Get all suppliers
const getAllSuppliers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, sortBy = 'name', sortOrder = 'asc' } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Sort configuration
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const suppliers = await Supplier.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    const total = await Supplier.countDocuments(query);
    
    res.json({
      suppliers,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      success: true
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
};

// Get supplier by ID
const getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
};

// Create new supplier
const createSupplier = async (req, res) => {
  try {
    const supplierData = req.body;
    
    console.log('Creating supplier with data:', JSON.stringify(supplierData, null, 2));
    
    // Validate required fields
    if (!supplierData.name || !supplierData.name.trim()) {
      return res.status(400).json({ 
        error: 'Name is required',
        field: 'name',
        message: 'Please provide a supplier name'
      });
    }
    
    if (!supplierData.email || !supplierData.email.trim()) {
      return res.status(400).json({ 
        error: 'Email is required',
        field: 'email',
        message: 'Please provide a supplier email'
      });
    }
    
    // Check if supplier with same email already exists
    const existingSupplier = await Supplier.findOne({ email: supplierData.email.toLowerCase() });
    if (existingSupplier) {
      return res.status(400).json({ 
        error: 'Supplier with this email already exists',
        field: 'email',
        message: 'A supplier with this email address is already registered'
      });
    }
    
    const supplier = new Supplier(supplierData);
    await supplier.save();
    
    res.status(201).json({
      message: 'Supplier created successfully',
      supplier
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    console.error('Error details:', error.message);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = {};
      Object.keys(error.errors).forEach(key => {
        validationErrors[key] = error.errors[key].message;
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        validationErrors,
        message: 'Please check all required fields'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create supplier',
      details: error.message
    });
  }
};

// Update supplier
const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const supplier = await Supplier.findById(id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    // Check email uniqueness if email is being updated
    if (updateData.email && updateData.email !== supplier.email) {
      const existingSupplier = await Supplier.findOne({ email: updateData.email });
      if (existingSupplier) {
        return res.status(400).json({ error: 'Supplier with this email already exists' });
      }
    }
    
    Object.assign(supplier, updateData);
    await supplier.save();
    
    res.json({
      message: 'Supplier updated successfully',
      supplier
    });
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
};


// Get supplier statistics
const getSupplierStats = async (req, res) => {
  try {
    const stats = await Supplier.getSupplierStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching supplier stats:', error);
    res.status(500).json({ error: 'Failed to fetch supplier statistics' });
  }
};

// Get supplier spending analytics
const getSupplierSpendingAnalytics = async (req, res) => {
  try {
    const { period = 'month', supplierId } = req.query;
    
    let matchQuery = {};
    if (supplierId) {
      matchQuery.supplierId = supplierId;
    }
    
    // Date range based on period
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    matchQuery.createdAt = { $gte: startDate };
    
    // Aggregate spending by supplier
    const spendingBySupplier = await Purchase.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'suppliers',
          localField: 'supplierId',
          foreignField: '_id',
          as: 'supplier'
        }
      },
      { $unwind: '$supplier' },
      {
        $group: {
          _id: '$supplierId',
          supplierName: { $first: '$supplier.name' },
          supplierCompany: { $first: '$supplier.companyName' },
          totalSpent: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$totalAmount' },
          lastPurchaseDate: { $max: '$createdAt' }
        }
      },
      { $sort: { totalSpent: -1 } }
    ]);
    
    // Aggregate spending by product
    const spendingByProduct = await Purchase.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'suppliers',
          localField: 'supplierId',
          foreignField: '_id',
          as: 'supplier'
        }
      },
      { $unwind: '$supplier' },
      {
        $group: {
          _id: {
            supplierId: '$supplierId',
            productId: '$productId'
          },
          supplierName: { $first: '$supplier.name' },
          productName: { $first: '$productName' },
          totalSpent: { $sum: '$totalAmount' },
          totalQuantity: { $sum: '$quantity' },
          totalOrders: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } }
    ]);
    
    res.json({
      period,
      spendingBySupplier,
      spendingByProduct,
      summary: {
        totalSuppliers: spendingBySupplier.length,
        totalSpent: spendingBySupplier.reduce((sum, item) => sum + item.totalSpent, 0),
        totalOrders: spendingBySupplier.reduce((sum, item) => sum + item.totalOrders, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching supplier spending analytics:', error);
    res.status(500).json({ error: 'Failed to fetch supplier spending analytics' });
  }
};

// Get top suppliers by spending
const getTopSuppliers = async (req, res) => {
  try {
    const { limit = 10, period = 'month' } = req.query;
    
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    const topSuppliers = await Purchase.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: 'suppliers',
          localField: 'supplierId',
          foreignField: '_id',
          as: 'supplier'
        }
      },
      { $unwind: '$supplier' },
      {
        $group: {
          _id: '$supplierId',
          supplierName: { $first: '$supplier.name' },
          supplierCompany: { $first: '$supplier.companyName' },
          supplierEmail: { $first: '$supplier.email' },
          totalSpent: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$totalAmount' },
          rating: { $first: '$supplier.rating' },
          status: { $first: '$supplier.status' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: parseInt(limit) }
    ]);
    
    res.json(topSuppliers);
  } catch (error) {
    console.error('Error fetching top suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch top suppliers' });
  }
};

// Update supplier rating
const updateSupplierRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    const supplier = await Supplier.findById(id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    supplier.rating = rating;
    await supplier.save();
    
    res.json({
      message: 'Supplier rating updated successfully',
      supplier
    });
  } catch (error) {
    console.error('Error updating supplier rating:', error);
    res.status(500).json({ error: 'Failed to update supplier rating' });
  }
};

// Toggle supplier preferred status
const togglePreferredSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    
    const supplier = await Supplier.findById(id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    
    supplier.isPreferred = !supplier.isPreferred;
    await supplier.save();
    
    res.json({
      message: `Supplier ${supplier.isPreferred ? 'added to' : 'removed from'} preferred suppliers`,
      supplier
    });
  } catch (error) {
    console.error('Error toggling preferred supplier:', error);
    res.status(500).json({ error: 'Failed to toggle preferred supplier status' });
  }
};

// Get supplier orders
const getSupplierOrders = async (req, res) => {
  try {
    const { supplierId } = req.params;
    
    const orders = await Purchase.find({ supplierId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('supplierId', 'name')
      .lean();
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching supplier orders:', error);
    res.status(500).json({ error: 'Failed to fetch supplier orders' });
  }
};

// Get supplier analytics
const getSupplierAnalytics = async (req, res) => {
  try {
    const { supplierId } = req.params;
    
    // Get basic analytics
    const orders = await Purchase.find({ supplierId }).lean();
    const totalProducts = await Product.countDocuments({ supplierId });
    const activeProducts = await Product.countDocuments({ supplierId, status: 'active' });
    
    // Calculate average rating (mock data for now)
    const averageRating = 4.2; // This should be calculated from actual ratings
    
    const analytics = {
      averageRating,
      totalProducts,
      activeProducts,
      paymentHistory: [] // This should be fetched from payment records
    };
    
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching supplier analytics:', error);
    res.status(500).json({ error: 'Failed to fetch supplier analytics' });
  }
};

module.exports = {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  getSupplierStats,
  getSupplierSpendingAnalytics,
  getTopSuppliers,
  updateSupplierRating,
  togglePreferredSupplier,
  getSupplierOrders,
  getSupplierAnalytics
};