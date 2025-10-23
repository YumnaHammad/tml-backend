const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: function() {
      // SKU is required only if product has no variants
      return !this.hasVariants;
    },
    unique: true,
    sparse: true, // Allow null values in unique index
    trim: true,
    uppercase: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  unit: {
    type: String,
    required: true,
    enum: ['pcs', 'kg', 'liters', 'boxes', 'meters'],
    default: 'pcs'
  },
  costPrice: {
    type: Number,
    required: false, // Not required when hasVariants is true
    min: 0,
    default: 0
  },
  sellingPrice: {
    type: Number,
    required: false, // Not required when hasVariants is true
    min: 0,
    default: 0
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Variant Support
  hasVariants: {
    type: Boolean,
    default: false
  },
  attributes: [{
    name: {
      type: String,
      trim: true
    },
    values: [{
      type: String,
      trim: true
    }]
  }],
  variants: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true  // Each variant must have unique SKU
    },
    attributes: [{
      name: {
        type: String,
        trim: true
      },
      value: {
        type: String,
        trim: true
      }
    }],
    costPrice: {
      type: Number,
      min: 0
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0
    },
    stock: {
      type: Number,
      default: 0,
      min: 0
    }
  }]
}, {
  timestamps: true
});

// Index for efficient searching
productSchema.index({ sku: 1 }, { unique: true, sparse: true }); // Ensure unique SKU at database level
// Removed variants.sku index to avoid conflicts with null values
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });

// Variant SKU validation removed to avoid index conflicts
// The application will handle SKU uniqueness at the application level

module.exports = mongoose.model('Product', productSchema);