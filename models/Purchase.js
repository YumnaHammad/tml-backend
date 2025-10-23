const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  purchaseNumber: {
    type: String,
    required: true,
    unique: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variantId: {
      type: String,
      default: null
    },
    variantName: {
      type: String,
      default: null
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  expectedDeliveryDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'ordered', 'received', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial', 'overdue'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'check', 'credit_card', 'debit_card', 'mobile_payment', 'online_transfer', 'letter_of_credit', 'bank_draft']
  },
  paymentTerms: {
    type: String,
    enum: ['immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60', 'on_delivery', 'partial', 'custom'],
    default: 'immediate'
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'fixed'
  },
  paymentDate: {
    type: Date
  },
  advancePayment: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingPayment: {
    type: Number,
    default: 0,
    min: 0
  },
  advancePaymentDate: {
    type: Date
  },
  remainingPaymentDate: {
    type: Date
  },
  receiptNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  invoiceGenerated: {
    type: Boolean,
    default: false
  },
  receiptGenerated: {
    type: Boolean,
    default: false
  },
  invoiceDate: {
    type: Date
  },
  receiptDate: {
    type: Date
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalAmount: {
    type: Number,
    min: 0
  },
  notes: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate purchase, invoice, and receipt numbers
purchaseSchema.pre('save', async function(next) {
  try {
    // Generate purchase number
    if (this.isNew && !this.purchaseNumber) {
      const count = await this.constructor.countDocuments();
      this.purchaseNumber = `PUR-${String(count + 1).padStart(4, '0')}`;
    }
    
    // Generate invoice number when invoice is generated
    if (this.invoiceGenerated && !this.invoiceNumber) {
      const invoiceCount = await this.constructor.countDocuments({ invoiceGenerated: true });
      this.invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, '0')}`;
      this.invoiceDate = new Date();
    }
    
    // Generate receipt number when payment is cleared
    if (this.paymentStatus === 'paid' && !this.receiptNumber) {
      const receiptCount = await this.constructor.countDocuments({ receiptGenerated: true });
      this.receiptNumber = `REC-${String(receiptCount + 1).padStart(4, '0')}`;
      this.receiptDate = new Date();
      this.receiptGenerated = true;
    }
    
    // Calculate final amount
    if (this.totalAmount) {
      this.finalAmount = this.totalAmount + (this.taxAmount || 0) - (this.discountAmount || 0);
    }
    
    // Calculate remaining payment
    if (this.advancePayment && this.finalAmount) {
      this.remainingPayment = this.finalAmount - this.advancePayment;
    }
    
  } catch (error) {
    console.error('Purchase pre-save error:', error);
    // Fallback numbers if generation fails
    if (this.isNew && !this.purchaseNumber) {
      this.purchaseNumber = `PUR-${Date.now().toString().slice(-4)}`;
    }
  }
  next();
});

// Calculate total amount before saving
purchaseSchema.pre('save', function(next) {
  this.totalAmount = this.items.reduce((total, item) => total + item.totalPrice, 0);
  next();
});

// Method to generate invoice
purchaseSchema.methods.generateInvoice = async function() {
  if (!this.invoiceGenerated) {
    this.invoiceGenerated = true;
    await this.save();
    return this.invoiceNumber;
  }
  return this.invoiceNumber;
};

// Method to generate receipt (when payment is cleared)
purchaseSchema.methods.generateReceipt = async function() {
  if (this.paymentStatus === 'paid' && !this.receiptGenerated) {
    this.receiptGenerated = true;
    await this.save();
    return this.receiptNumber;
  }
  return this.receiptNumber;
};

// Method to mark payment as cleared and update stock
purchaseSchema.methods.markPaymentCleared = async function() {
  this.paymentStatus = 'paid';
  this.paymentDate = new Date();
  
  // Auto-generate receipt
  await this.generateReceipt();
  
  // Update stock in warehouse
  await this.updateStockAfterPayment();
  
  await this.save();
  return this;
};

// Method to update stock after payment is cleared
purchaseSchema.methods.updateStockAfterPayment = async function() {
  const { Warehouse, StockMovement } = require('./index');
  
  try {
    // Get default warehouse or first active warehouse
    let warehouse = await Warehouse.findOne({ isActive: true });
    
    if (!warehouse) {
      console.error('No active warehouse found for stock update');
      return;
    }
    
    // Add each item to warehouse stock WITH VARIANT INFO
    for (const item of this.items) {
      console.log(`Processing item: quantity=${item.quantity}, productId=${item.productId}, variantId=${item.variantId}`);
      
      // Find existing stock item by BOTH productId AND variantId
      const stockItem = warehouse.currentStock.find(stock => 
        stock.productId.toString() === item.productId.toString() &&
        (stock.variantId || null) === (item.variantId || null)
      );
      
      const previousQuantity = stockItem ? stockItem.quantity : 0;
      console.log(`Previous quantity in warehouse: ${previousQuantity}`);
      
      // Update or add stock with variant information
      if (stockItem) {
        console.log(`Updating existing stock: ${previousQuantity} + ${item.quantity} = ${previousQuantity + item.quantity}`);
        stockItem.quantity += item.quantity;
        if (item.variantName && !stockItem.variantName) {
          stockItem.variantName = item.variantName;
        }
      } else {
        console.log(`Adding NEW stock entry: quantity=${item.quantity}`);
        warehouse.currentStock.push({
          productId: item.productId,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          quantity: item.quantity,
          reservedQuantity: 0,
          tags: []
        });
      }
      
      const newQuantity = stockItem ? stockItem.quantity : item.quantity;
      console.log(`New quantity in warehouse: ${newQuantity}`);
      
      // Create stock movement record
      const stockMovement = new StockMovement({
        productId: item.productId,
        warehouseId: warehouse._id,
        movementType: 'in',
        quantity: item.quantity,
        previousQuantity: previousQuantity,
        newQuantity: newQuantity,
        referenceType: 'purchase',
        referenceId: this._id,
        notes: `Stock added from purchase ${this.purchaseNumber}${item.variantName ? ' - ' + item.variantName : ''} after payment cleared`,
        createdBy: this.createdBy
      });
      
      await stockMovement.save();
    }
    
    await warehouse.save();
    console.log(`Stock updated for purchase ${this.purchaseNumber} after payment cleared`);
  } catch (error) {
    console.error('Error updating stock after payment:', error);
    throw error;
  }
};

module.exports = mongoose.model('Purchase', purchaseSchema);