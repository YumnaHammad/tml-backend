const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorRole: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    trim: true
  },
  resourceType: {
    type: String,
    required: true,
    enum: ['Product', 'Warehouse', 'Supplier', 'Purchase', 'Invoice', 'Receipt', 'SalesOrder', 'SalesShipment', 'Return', 'User', 'Report']
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  oldValues: {
    type: mongoose.Schema.Types.Mixed
  },
  newValues: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  // Timestamp fields with timezone
  timestampISO: {
    type: String,
    required: true
  },
  timestampDisplay: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient searching
auditLogSchema.index({ actorId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resourceType: 1 });
auditLogSchema.index({ resourceId: 1 });
auditLogSchema.index({ timestampISO: 1 });
auditLogSchema.index({ createdAt: 1 });

// Pre-save middleware to set timestamp fields
auditLogSchema.pre('save', function(next) {
  if (this.isNew) {
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

module.exports = mongoose.model('AuditLog', auditLogSchema);
