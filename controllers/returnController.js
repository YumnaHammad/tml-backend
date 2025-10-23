const { Return, SalesOrder, Product, Warehouse, StockMovement } = require('../models');
const { createAuditLog } = require('../middleware/audit');

// Create a new return
const createReturn = async (req, res) => {
  try {
    const { salesOrderId, items, notes } = req.body;

    // Validate sales order
    const salesOrder = await SalesOrder.findById(salesOrderId);
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    if (salesOrder.status !== 'delivered') {
      return res.status(400).json({ error: 'Can only return items from delivered orders' });
    }

    // Validate return items
    const validatedItems = [];
    for (const item of items) {
      const orderItem = salesOrder.items.find(orderItem => 
        orderItem.productId.toString() === item.productId
      );

      if (!orderItem) {
        return res.status(400).json({ 
          error: `Product ${item.productId} not found in sales order` 
        });
      }

      if (item.quantity > orderItem.quantity) {
        return res.status(400).json({ 
          error: `Return quantity cannot exceed ordered quantity for product ${item.productId}` 
        });
      }

      validatedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        condition: item.condition || 'good',
        returnReason: item.returnReason,
        warehouseId: item.warehouseId
      });
    }

    // Create return
    const returnOrder = new Return({
      salesOrderId,
      items: validatedItems,
      notes,
      createdBy: req.user._id
    });

    await returnOrder.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'return_created',
      'Return',
      returnOrder._id,
      null,
      { returnNumber: returnOrder.returnNumber, salesOrderNumber: salesOrder.orderNumber },
      req
    );

    // Populate for response
    await returnOrder.populate([
      { path: 'salesOrderId', select: 'orderNumber customerInfo' },
      { path: 'items.productId', select: 'name sku' },
      { path: 'items.warehouseId', select: 'name location' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    res.status(201).json({
      message: 'Return created successfully',
      returnOrder
    });

  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all returns
const getAllReturns = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate, isActive } = req.query;
    
    // Show all returns by default, allow filtering by isActive
    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (status) query.status = status;
    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) query.returnDate.$gte = new Date(startDate);
      if (endDate) query.returnDate.$lte = new Date(endDate);
    }

    const returns = await Return.find(query)
      .populate('salesOrderId', 'orderNumber customerInfo')
      .populate('items.productId', 'name sku')
      .populate('items.warehouseId', 'name location')
      .populate('createdBy', 'firstName lastName')
      .sort({ returnDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Return.countDocuments(query);

    res.json({
      returns,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get returns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get return by ID
const getReturnById = async (req, res) => {
  try {
    const { id } = req.params;

    const returnOrder = await Return.findById(id)
      .populate('salesOrderId', 'orderNumber customerInfo deliveryAddress')
      .populate('items.productId', 'name sku description unit')
      .populate('items.warehouseId', 'name location capacity')
      .populate('createdBy', 'firstName lastName email');

    if (!returnOrder) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json(returnOrder);

  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Process return (add stock back to warehouse)
const processReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { refundAmount, refundStatus, notes } = req.body;

    const returnOrder = await Return.findById(id);
    if (!returnOrder) {
      return res.status(404).json({ error: 'Return not found' });
    }

    if (returnOrder.status !== 'received') {
      return res.status(400).json({ error: 'Return must be received to process' });
    }

    // Add stock back to warehouses
    for (const returnItem of returnOrder.items) {
      const warehouse = await Warehouse.findById(returnItem.warehouseId);
      if (!warehouse) {
        return res.status(404).json({ error: `Warehouse ${returnItem.warehouseId} not found` });
      }

      const stockItem = warehouse.currentStock.find(item => 
        item.productId.toString() === returnItem.productId.toString()
      );

      if (stockItem) {
        const previousQuantity = stockItem.quantity;
        // ❌ REMOVED: stockItem.quantity += returnItem.quantity; // Don't increase total stock!
        
        // Decrease delivered quantity since items came back
        if (!stockItem.deliveredQuantity) {
          stockItem.deliveredQuantity = 0;
        }
        if (stockItem.deliveredQuantity > 0) {
          stockItem.deliveredQuantity = Math.max(0, stockItem.deliveredQuantity - returnItem.quantity);
          console.log(`Reduced delivered quantity by ${returnItem.quantity}, new delivered quantity: ${stockItem.deliveredQuantity}`);
        }
        
        // Add returned quantity tracking
        if (!stockItem.returnedQuantity) {
          stockItem.returnedQuantity = 0;
        }
        stockItem.returnedQuantity += returnItem.quantity;
        
        // Add return tag if condition is not good
        if (returnItem.condition !== 'good') {
          if (!stockItem.tags) stockItem.tags = [];
          if (!stockItem.tags.includes('returned')) {
            stockItem.tags.push('returned');
          }
          stockItem.returnedAt = new Date();
        }

        // Create stock movement record
        const stockMovement = new StockMovement({
          productId: returnItem.productId,
          warehouseId: returnItem.warehouseId,
          movementType: 'return',
          quantity: returnItem.quantity,
          previousQuantity,
          newQuantity: stockItem.quantity,
          referenceType: 'return',
          referenceId: returnOrder._id,
          notes: `Return processed - ${returnItem.returnReason}`,
          createdBy: req.user._id
        });

        await stockMovement.save();
      } else {
        warehouse.currentStock.push({
          productId: returnItem.productId,
          quantity: 0, // ✅ Start with 0 quantity for new items
          reservedQuantity: 0,
          deliveredQuantity: 0,
          returnedQuantity: returnItem.quantity,
          tags: returnItem.condition !== 'good' ? ['returned'] : [],
          returnedAt: returnItem.condition !== 'good' ? new Date() : null
        });

        // Create stock movement record
        const stockMovement = new StockMovement({
          productId: returnItem.productId,
          warehouseId: returnItem.warehouseId,
          movementType: 'return',
          quantity: returnItem.quantity,
          previousQuantity: 0,
          newQuantity: returnItem.quantity,
          referenceType: 'return',
          referenceId: returnOrder._id,
          notes: `Return processed - ${returnItem.returnReason}`,
          createdBy: req.user._id
        });

        await stockMovement.save();
      }

      await warehouse.save();
    }

    // Update return status
    returnOrder.status = 'processed';
    if (refundAmount) returnOrder.refundAmount = refundAmount;
    if (refundStatus) returnOrder.refundStatus = refundStatus;
    if (notes) returnOrder.notes = notes;

    await returnOrder.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'return_processed',
      'Return',
      returnOrder._id,
      { status: 'received' },
      { status: 'processed', refundAmount, refundStatus },
      { returnNumber: returnOrder.returnNumber },
      req
    );

    res.json({
      message: 'Return processed successfully',
      returnOrder
    });

  } catch (error) {
    console.error('Process return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update return status
const updateReturnStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const returnOrder = await Return.findById(id);
    if (!returnOrder) {
      return res.status(404).json({ error: 'Return not found' });
    }

    const oldStatus = returnOrder.status;
    returnOrder.status = status;
    if (notes) returnOrder.notes = notes;

    await returnOrder.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'return_status_updated',
      'Return',
      returnOrder._id,
      { status: oldStatus },
      { status: returnOrder.status },
      { returnNumber: returnOrder.returnNumber },
      req
    );

    res.json({
      message: 'Return status updated successfully',
      returnOrder
    });

  } catch (error) {
    console.error('Update return status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete return (hard delete)
const deleteReturn = async (req, res) => {
  try {
    const { id } = req.params;

    const returnOrder = await Return.findById(id);
    if (!returnOrder) {
      return res.status(404).json({ error: 'Return not found' });
    }

    if (returnOrder.status === 'processed') {
      return res.status(400).json({ 
        error: 'Cannot delete processed return. Stock has been adjusted.' 
      });
    }

    // Hard delete
    await Return.findByIdAndDelete(id);

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'return_deleted',
      'Return',
      id,
      returnOrder.toObject(),
      null,
      { returnNumber: returnOrder.returnNumber },
      req
    );

    res.json({ message: 'Return deleted successfully' });

  } catch (error) {
    console.error('Delete return error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createReturn,
  getAllReturns,
  getReturnById,
  processReturn,
  updateReturnStatus,
  deleteReturn
};
