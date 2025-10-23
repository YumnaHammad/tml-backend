const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportType: {
    type: String,
    required: true,
    enum: ['dashboard', 'product_lifecycle', 'warehouse_capacity', 'sales_summary', 'returns_summary', 'supplier_payment']
  },
  reportData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  period: {
    startDate: Date,
    endDate: Date
  },
  filters: {
    type: mongoose.Schema.Types.Mixed
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient searching
reportSchema.index({ reportType: 1 });
reportSchema.index({ generatedAt: 1 });
reportSchema.index({ period: 1 });

module.exports = mongoose.model('Report', reportSchema);
