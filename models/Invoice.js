const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
    required: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  },
  dueDate: {
    type: Date,
    required: true
  },
  paidDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'bank_transfer', 'credit_card'],
    default: 'bank_transfer'
  },
  notes: {
    type: String,
    trim: true
  },
  // Audit fields
  recordedAt: {
    type: Date,
    default: Date.now
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  actorRole: {
    type: String
  },
  action: {
    type: String,
    default: 'invoice_created'
  },
  timestampISO: {
    type: String
  },
  timestampDisplay: {
    type: String
  }
}, {
  timestamps: true
});

// Index for efficient searching
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ purchaseId: 1 });
invoiceSchema.index({ supplierId: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });

// Pre-save middleware to set timestamp fields
invoiceSchema.pre('save', function(next) {
  if (this.isNew || this.isModified()) {
    const now = new Date();
    const pakistanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Karachi"}));
    
    this.timestampISO = pakistanTime.toISOString();
    this.timestampDisplay = pakistanTime.toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);