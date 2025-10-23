const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  companyName: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },

  // Address Information
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },

  // Business Information
  taxId: String,
  businessLicense: String,
  registrationNumber: String,
  
  // Contact Information
  contactPerson: {
    name: String,
    position: String,
    email: String,
    phone: String
  },

  // Financial Information
  paymentTerms: {
    type: String,
    enum: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'COD', 'Prepaid'],
    default: 'Net 30'
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },

  // Supplier Performance Metrics
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  },
  deliveryTime: {
    average: Number, // in days
    reliability: {
      type: String,
      enum: ['Excellent', 'Good', 'Average', 'Poor'],
      default: 'Good'
    }
  },
  qualityRating: {
    type: String,
    enum: ['Excellent', 'Good', 'Average', 'Poor'],
    default: 'Good'
  },

  // Product Categories
  categories: [{
    type: String,
    trim: true
  }],

  // Status and Settings
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Suspended', 'Blacklisted'],
    default: 'Active'
  },
  isPreferred: {
    type: Boolean,
    default: false
  },
  notes: String,

  // Purchase Statistics
  totalPurchases: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  lastPurchaseDate: Date,
  averageOrderValue: {
    type: Number,
    default: 0
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
supplierSchema.index({ email: 1 });
supplierSchema.index({ name: 1 });
supplierSchema.index({ status: 1 });
supplierSchema.index({ isPreferred: 1 });

// Virtual for full address
supplierSchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  if (!addr) return '';
  
  const parts = [addr.street, addr.city, addr.state, addr.country, addr.postalCode];
  return parts.filter(part => part && part.trim()).join(', ');
});

// Virtual for display name
supplierSchema.virtual('displayName').get(function() {
  return this.companyName || this.name;
});

// Pre-save middleware to update timestamps
supplierSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get supplier statistics
supplierSchema.statics.getSupplierStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalSuppliers: { $sum: 1 },
        activeSuppliers: { 
          $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } 
        },
        preferredSuppliers: { 
          $sum: { $cond: ['$isPreferred', 1, 0] } 
        },
        totalSpent: { $sum: '$totalSpent' },
        averageRating: { $avg: '$rating' }
      }
    }
  ]);
  
  return stats[0] || {
    totalSuppliers: 0,
    activeSuppliers: 0,
    preferredSuppliers: 0,
    totalSpent: 0,
    averageRating: 0
  };
};

// Instance method to update purchase statistics
supplierSchema.methods.updatePurchaseStats = async function(purchaseAmount) {
  this.totalPurchases += 1;
  this.totalSpent += purchaseAmount;
  this.lastPurchaseDate = new Date();
  this.averageOrderValue = this.totalSpent / this.totalPurchases;
  
  await this.save();
};

// Instance method to calculate spending by period
supplierSchema.methods.getSpendingByPeriod = async function(period = 'month') {
  const Purchase = mongoose.model('Purchase');
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
  
  const purchases = await Purchase.aggregate([
    {
      $match: {
        supplierId: this._id,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$totalAmount' },
        totalOrders: { $sum: 1 },
        averageOrderValue: { $avg: '$totalAmount' }
      }
    }
  ]);
  
  return purchases[0] || {
    totalAmount: 0,
    totalOrders: 0,
    averageOrderValue: 0
  };
};

module.exports = mongoose.model('Supplier', supplierSchema);