const mongoose = require('mongoose');
const ExpectedReturn = require('../models/ExpectedReturn');
const SalesOrder = require('../models/SalesOrder');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const { createAuditLog } = require('../middleware/audit');

// Get all expected returns
const getAllExpectedReturns = async (req, res) => {
  try {
    const { status, from, to } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (from || to) {
      query.expectedReturnDate = {};
      if (from) query.expectedReturnDate.$gte = new Date(from);
      if (to) query.expectedReturnDate.$lte = new Date(to);
    }
    
    const expectedReturns = await ExpectedReturn.find(query)
      .populate('salesOrderId', 'orderNumber status')
      .populate('items.productId', 'name sku')
      .populate('warehouseId', 'name location')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    
    // Calculate statistics
    const stats = {
      total: expectedReturns.length,
      pending: expectedReturns.filter(r => r.status === 'pending').length,
      inTransit: expectedReturns.filter(r => r.status === 'in_transit').length,
      received: expectedReturns.filter(r => r.status === 'received').length,
      totalItems: expectedReturns.reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0)
    };
    
    res.json({ expectedReturns, stats });
  } catch (error) {
    console.error('Get expected returns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single expected return
const getExpectedReturnById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const expectedReturn = await ExpectedReturn.findById(id)
      .populate('salesOrderId')
      .populate('items.productId')
      .populate('warehouseId')
      .populate('createdBy', 'firstName lastName email');
    
    if (!expectedReturn) {
      return res.status(404).json({ error: 'Expected return not found' });
    }
    
    res.json(expectedReturn);
  } catch (error) {
    console.error('Get expected return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create expected return
const createExpectedReturn = async (req, res) => {
  try {
    const {
      salesOrderId,
      items,
      expectedReturnDate,
      returnReason,
      warehouseId,
      notes,
      trackingNumber
    } = req.body;
    
    // Validate sales order
    const salesOrder = await SalesOrder.findById(salesOrderId)
      .populate('items.productId');
    
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }
    
    // Populate product details
    const populatedItems = await Promise.all(items.map(async (item) => {
      const product = await Product.findById(item.productId);
      return {
        ...item,
        productName: product?.name || 'Unknown Product'
      };
    }));
    
    // Create expected return
    const expectedReturn = new ExpectedReturn({
      salesOrderId,
      orderNumber: salesOrder.orderNumber,
      customerName: salesOrder.customerInfo?.name || 'Unknown',
      customerEmail: salesOrder.customerInfo?.email,
      customerPhone: salesOrder.customerInfo?.phone,
      items: populatedItems,
      expectedReturnDate,
      returnReason,
      warehouseId,
      notes,
      trackingNumber,
      refundAmount: items.reduce((sum, item) => {
        const orderItem = salesOrder.items.find(i => 
          i.productId._id.toString() === item.productId.toString()
        );
        return sum + (orderItem ? orderItem.unitPrice * item.quantity : 0);
      }, 0),
      createdBy: req.user?._id
    });
    
    await expectedReturn.save();
    
    // Create audit log
    if (req.user) {
      await createAuditLog(
        req.user._id,
        req.user.role,
        'expected_return_created',
        'ExpectedReturn',
        expectedReturn._id,
        null,
        expectedReturn.toObject(),
        { orderNumber: salesOrder.orderNumber },
        req
      );
    }
    
    await expectedReturn.populate([
      { path: 'items.productId', select: 'name sku' },
      { path: 'warehouseId', select: 'name location' }
    ]);
    
    res.status(201).json({
      message: 'Expected return created successfully',
      expectedReturn
    });
  } catch (error) {
    console.error('Create expected return error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Update expected return status
const updateExpectedReturnStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualReturnDate, notes, warehouseId } = req.body;
    
    // Do NOT populate productId here to ensure we always have the raw ObjectId even if product was deleted
    const expectedReturn = await ExpectedReturn.findById(id);
    
    if (!expectedReturn) {
      return res.status(404).json({ error: 'Expected return not found' });
    }
    
    const oldStatus = expectedReturn.status;
    expectedReturn.status = status;
    
    if (actualReturnDate) {
      expectedReturn.actualReturnDate = actualReturnDate;
    }
    
    if (notes) {
      expectedReturn.notes = notes;
    }
    
    // Update warehouse if provided
    if (warehouseId) {
      expectedReturn.warehouseId = warehouseId;
    }
    
    // If status is 'received', add stock back to warehouse with 'returned' tag
    if (status === 'received') {
      console.log('Processing received status for expected return:', expectedReturn._id);
      let targetWarehouseId = warehouseId || expectedReturn.warehouseId;
      
      if (!targetWarehouseId) {
        // Fallback: pick first active warehouse
        const fallbackWh = await Warehouse.findOne({ isActive: true });
        if (!fallbackWh) {
          return res.status(400).json({ error: 'No warehouse available to receive the return' });
        }
        targetWarehouseId = fallbackWh._id;
      }
      
      console.log('Looking up warehouse:', targetWarehouseId);
      const warehouse = await Warehouse.findById(targetWarehouseId);
      
      if (!warehouse) {
        console.error('Warehouse not found:', targetWarehouseId);
        return res.status(404).json({ error: 'Warehouse not found' });
      }
      console.log('Warehouse found:', warehouse.name);
      
      // Ensure currentStock array exists
      if (!Array.isArray(warehouse.currentStock)) {
        warehouse.currentStock = [];
      }
      
      // Determine createdBy for stock movements (prefer request user, then linked sales order creator, then expectedReturn creator, then admin)
      let createdByUserId = req.user?._id;
      let linkedSalesOrder = null;
      if (!createdByUserId) {
        try {
          linkedSalesOrder = await SalesOrder.findById(expectedReturn.salesOrderId);
          createdByUserId = linkedSalesOrder?.createdBy || expectedReturn.createdBy;
        } catch (e) {
          console.warn('Failed to load linked sales order for createdBy fallback:', e.message);
        }
      }
      if (!createdByUserId) {
        try {
          const User = require('../models/User');
          const adminUser = await User.findOne({ role: 'admin', isActive: true });
          if (adminUser) {
            createdByUserId = adminUser._id;
          }
        } catch (e) {
          console.warn('Could not resolve fallback user for stock movement:', e.message);
        }
      }
      // Absolute fallback to a zero ObjectId to satisfy schema if none resolved
      if (!createdByUserId) {
        createdByUserId = new mongoose.Types.ObjectId('000000000000000000000000');
      }
      
      console.log('Processing items:', expectedReturn.items.length);
      for (const item of expectedReturn.items) {
        console.log('Processing item:', item);
        const product = item.productId; // could be ObjectId or string
        if (!product) {
          console.warn('ExpectedReturn item missing productId, skipping');
          continue;
        }
        const productIdStr = (product && product._id)
          ? product._id.toString()
          : product.toString();
        const itemVariantId = item.variantId || null;
        console.log('Product ID string:', productIdStr, 'Variant ID:', itemVariantId);
        
        // Find or create stock entry by productId AND variantId
        let stockItem = warehouse.currentStock.find(stock =>
          stock.productId.toString() === productIdStr &&
          (stock.variantId || null) === itemVariantId
        );
        
        if (stockItem) {
          // Move from expectedReturns to returnedQuantity (DO NOT add to total quantity)
          const itemQty = Number(item.quantity) || 0;
          if (stockItem.expectedReturns && stockItem.expectedReturns >= itemQty) {
            stockItem.expectedReturns -= itemQty;
          }
          // ❌ REMOVED: stockItem.quantity += itemQty; // Don't increase total stock!
          
          // Track returned quantity separately
          if (!stockItem.returnedQuantity) {
            stockItem.returnedQuantity = 0;
          }
          stockItem.returnedQuantity += itemQty;
          
          // Decrease delivered quantity since items came back
          if (!stockItem.deliveredQuantity) {
            stockItem.deliveredQuantity = 0;
          }
          if (stockItem.deliveredQuantity > 0) {
            stockItem.deliveredQuantity = Math.max(0, stockItem.deliveredQuantity - itemQty);
            console.log(`Reduced delivered quantity by ${itemQty}, new delivered quantity: ${stockItem.deliveredQuantity}`);
          }
          
          // Add 'returned' tag
          if (!stockItem.tags) {
            stockItem.tags = [];
          }
          if (!stockItem.tags.includes('returned')) {
            stockItem.tags.push('returned');
          }
          // Add condition tag
          if (item.condition && !stockItem.tags.includes(item.condition)) {
            stockItem.tags.push(item.condition);
          }
        } else {
          const itemQty2 = Number(item.quantity) || 0;
          const newEntry = {
            productId: (product && product._id) ? product._id : product,
            variantId: itemVariantId,
            variantName: item.variantName || null,
            quantity: 0, // ✅ Start with 0 quantity for new items
            reservedQuantity: 0,
            expectedReturns: 0,
            returnedQuantity: itemQty2,
            deliveredQuantity: 0,
            tags: ['returned', item.condition].filter(Boolean)
          };
          warehouse.currentStock.push(newEntry);
          stockItem = newEntry; // so movement quantities compute correctly below
        }
        
        // Create stock movement
        const StockMovement = require('../models/StockMovement');
        const stockMovement = new StockMovement({
          productId: (product && product._id) ? product._id : product,
          warehouseId: warehouse._id,
          movementType: 'in',
          quantity: Number(item.quantity) || 0,
          previousQuantity: stockItem ? stockItem.quantity - (Number(item.quantity) || 0) : 0,
          newQuantity: stockItem ? stockItem.quantity : (Number(item.quantity) || 0),
          referenceType: 'return',
          referenceId: expectedReturn._id,
          notes: `Expected return received from order ${expectedReturn.orderNumber}`,
          createdBy: createdByUserId
        });
        await stockMovement.save();
      }
      
      await warehouse.save();
      
      // Also update the related sales order status to 'returned'
      try {
        const salesOrder = linkedSalesOrder || await SalesOrder.findById(expectedReturn.salesOrderId);
        if (salesOrder) {
          salesOrder.status = 'returned';
          await salesOrder.save();
        }
      } catch (e) {
        console.warn('Failed to update related sales order to returned:', e.message);
      }
      expectedReturn.warehouseName = warehouse.name;
    }
    
    await expectedReturn.save();
    
    // Create audit log
    if (req.user) {
      await createAuditLog(
        req.user._id,
        req.user.role,
        'expected_return_status_updated',
        'ExpectedReturn',
        expectedReturn._id,
        { status: oldStatus },
        { status: expectedReturn.status },
        { orderNumber: expectedReturn.orderNumber },
        req
      );
    }
    
    res.json({
      message: status === 'received' 
        ? 'Return received and stock updated'
        : 'Expected return status updated',
      expectedReturn
    });
  } catch (error) {
    console.error('Update expected return status error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request params:', { id, status, actualReturnDate, notes, warehouseId });
    console.error('Expected return found:', !!expectedReturn);
    res.status(500).json({ 
      error: error.message || 'Internal server error', 
      details: error.stack || error.name,
      errorType: error.name,
      requestData: { id, status, actualReturnDate, notes, warehouseId }
    });
  }
};

// Get expected returns by product (for purchase decisions)
const getExpectedReturnsByProduct = async (req, res) => {
  try {
    const expectedReturns = await ExpectedReturn.find({
      status: { $in: ['pending', 'in_transit'] }
    }).populate('items.productId', 'name sku');
    
    // Group by product
    const productReturns = {};
    
    expectedReturns.forEach(ret => {
      ret.items.forEach(item => {
        const productId = item.productId._id.toString();
        if (!productReturns[productId]) {
          productReturns[productId] = {
            product: item.productId,
            totalExpected: 0,
            returns: []
          };
        }
        productReturns[productId].totalExpected += item.quantity;
        productReturns[productId].returns.push({
          orderNumber: ret.orderNumber,
          quantity: item.quantity,
          expectedDate: ret.expectedReturnDate,
          status: ret.status,
          condition: item.condition
        });
      });
    });
    
    res.json({ productReturns: Object.values(productReturns) });
  } catch (error) {
    console.error('Get expected returns by product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete expected return
const deleteExpectedReturn = async (req, res) => {
  try {
    const { id } = req.params;
    
    const expectedReturn = await ExpectedReturn.findById(id);
    if (!expectedReturn) {
      return res.status(404).json({ error: 'Expected return not found' });
    }
    
    await ExpectedReturn.findByIdAndDelete(id);
    
    res.json({ message: 'Expected return deleted successfully' });
  } catch (error) {
    console.error('Delete expected return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// New simplified return received process
const processReturnReceived = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('=== PROCESSING RETURN RECEIVED ===');
    console.log('Expected return ID:', id);
    
    // Step 1: Find the expected return
    const expectedReturn = await ExpectedReturn.findById(id);
    if (!expectedReturn) {
      return res.status(404).json({ error: 'Expected return not found' });
    }
    console.log('Found expected return:', expectedReturn.orderNumber);
    
    // Step 2: Find target warehouse
    let warehouse = null;
    if (expectedReturn.warehouseId) {
      warehouse = await Warehouse.findById(expectedReturn.warehouseId);
    }
    
    if (!warehouse) {
      warehouse = await Warehouse.findOne({ isActive: true });
      if (!warehouse) {
        return res.status(400).json({ error: 'No active warehouse found' });
      }
    }
    console.log('Using warehouse:', warehouse.name);
    
    // Step 3: Process each item
    for (const item of expectedReturn.items) {
      console.log('Processing item:', item);
      
      const productId = item.productId.toString();
      const variantId = item.variantId || null;
      const quantity = Number(item.quantity) || 0;
      
      if (!quantity || quantity <= 0) {
        console.warn('Invalid quantity for item:', item);
        continue;
      }
      
      // Find existing stock item
      let stockItem = warehouse.currentStock.find(stock =>
        stock.productId.toString() === productId &&
        (stock.variantId || null) === variantId
      );
      
      if (stockItem) {
        // Update existing stock
        console.log('Updating existing stock item');
        // ❌ REMOVED: stockItem.quantity += quantity; // Don't increase total stock!
        stockItem.returnedQuantity = (stockItem.returnedQuantity || 0) + quantity;
        
        // Reduce expected returns if any
        if (stockItem.expectedReturns && stockItem.expectedReturns > 0) {
          stockItem.expectedReturns = Math.max(0, stockItem.expectedReturns - quantity);
        }
        
        // Decrease delivered quantity since items came back
        if (!stockItem.deliveredQuantity) {
          stockItem.deliveredQuantity = 0;
        }
        if (stockItem.deliveredQuantity > 0) {
          stockItem.deliveredQuantity = Math.max(0, stockItem.deliveredQuantity - quantity);
          console.log(`Reduced delivered quantity by ${quantity}, new delivered quantity: ${stockItem.deliveredQuantity}`);
        }
        
        // Add returned tag
        if (!stockItem.tags) stockItem.tags = [];
        if (!stockItem.tags.includes('returned')) {
          stockItem.tags.push('returned');
        }
      } else {
        // Create new stock item
        console.log('Creating new stock item');
        warehouse.currentStock.push({
          productId: item.productId,
          variantId: variantId,
          variantName: item.variantName || null,
          quantity: 0, // ✅ Start with 0 quantity for new items
          reservedQuantity: 0,
          expectedReturns: 0,
          returnedQuantity: quantity,
          deliveredQuantity: 0,
          tags: ['returned']
        });
      }
    }
    
    // Step 4: Save warehouse
    await warehouse.save();
    console.log('Warehouse saved successfully');
    
    // Step 5: Update expected return status
    expectedReturn.status = 'received';
    expectedReturn.actualReturnDate = new Date();
    await expectedReturn.save();
    console.log('Expected return status updated to received');
    
    // Step 6: Update sales order status
    const salesOrder = await SalesOrder.findById(expectedReturn.salesOrderId);
    if (salesOrder) {
      salesOrder.status = 'returned';
      await salesOrder.save();
      console.log('Sales order status updated to returned');
    }
    
    console.log('=== RETURN PROCESS COMPLETED SUCCESSFULLY ===');
    
    res.json({
      message: 'Return processed successfully',
      expectedReturn,
      warehouseName: warehouse.name
    });
    
  } catch (error) {
    console.error('=== RETURN PROCESS ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process return',
      details: error.message 
    });
  }
};

module.exports = {
  getAllExpectedReturns,
  getExpectedReturnById,
  createExpectedReturn,
  updateExpectedReturnStatus,
  getExpectedReturnsByProduct,
  deleteExpectedReturn,
  processReturnReceived
};

