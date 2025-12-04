const mongoose = require('mongoose');

const oldCRMSchema = new mongoose.Schema({
  // Lead/Customer Information
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: false
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  customerPhone: {
    type: String,
    required: true,
    trim: true
  },
  
  // CRM Activity Type
  activityType: {
    type: String,
    enum: ['lead', 'call', 'meeting', 'email', 'note', 'follow_up', 'quote', 'order', 'complaint', 'support'],
    required: true,
    default: 'lead'
  },
  
  // Activity Details
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  
  // Status and Priority
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'closed', 'follow_up', 'in_progress', 'resolved'],
    default: 'new'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Dates
  activityDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date
  },
  followUpDate: {
    type: Date
  },
  
  // Value/Amount (for quotes, orders, etc.)
  value: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  
  // Assigned User
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Tags for categorization
  tags: [{
    type: String,
    trim: true
  }],
  
  // Source of lead/activity
  source: {
    type: String,
    enum: ['website', 'phone', 'email', 'referral', 'social_media', 'walk_in', 'exhibition', 'other'],
    default: 'other'
  },
  
  // Related entities
  relatedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder'
  },
  relatedProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  
  // Outcome
  outcome: {
    type: String,
    enum: ['successful', 'unsuccessful', 'pending', 'cancelled', 'rescheduled'],
    default: 'pending'
  },
  
  // Additional metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  
  // Active status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Created by
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
oldCRMSchema.index({ customerId: 1 });
oldCRMSchema.index({ activityType: 1 });
oldCRMSchema.index({ status: 1 });
oldCRMSchema.index({ assignedTo: 1 });
oldCRMSchema.index({ activityDate: -1 });
oldCRMSchema.index({ dueDate: 1 });
oldCRMSchema.index({ followUpDate: 1 });
oldCRMSchema.index({ createdAt: -1 });
oldCRMSchema.index({ customerEmail: 1 });
oldCRMSchema.index({ customerPhone: 1 });

// Virtual for full customer info
oldCRMSchema.virtual('customerInfo').get(function() {
  return {
    name: this.customerName,
    email: this.customerEmail,
    phone: this.customerPhone
  };
});

module.exports = mongoose.model('OldCRM', oldCRMSchema);

