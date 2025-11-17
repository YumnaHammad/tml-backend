const mongoose = require('mongoose');

const postExOrderSchema = new mongoose.Schema({
  orderType: {
    type: String,
    required: true,
    enum: ['Normal', 'Express']
  },
  orderReferenceNumber: {
    type: String,
    required: true
  },
  orderAmount: {
    type: Number,
    required: true,
    min: 0
  },
  orderDate: {
    type: Date,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerContact: {
    type: String,
    required: true
  },
  deliveryCity: {
    type: String,
    required: true
  },
  deliveryAddress: {
    type: String,
    required: true
  },
  airwayBillCopies: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  items: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  pickupCity: {
    type: String,
    required: true
  },
  pickupAddress: {
    type: String,
    required: true
  },
  returnCity: {
    type: String,
    default: ''
  },
  returnAddress: {
    type: String,
    default: ''
  },
  bookingWeight: {
    type: Number,
    min: 0
  },
  orderDetail: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'in_transit', 'delivered', 'cancelled'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Index for faster queries
postExOrderSchema.index({ orderReferenceNumber: 1 });
postExOrderSchema.index({ createdAt: -1 });
postExOrderSchema.index({ status: 1 });

const PostExOrder = mongoose.model('PostExOrder', postExOrderSchema);

module.exports = PostExOrder;



