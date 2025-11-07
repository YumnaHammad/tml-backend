const { SalesOrder, Product, Customer, Warehouse, StockMovement, SalesShipment } = require('../models');
const { createAuditLog } = require('../middleware/audit');

const normalizeId = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();

  let current = value;
  const visited = new Set();
  let depth = 0;
  const MAX_DEPTH = 6;

  while (current && typeof current === 'object' && depth < MAX_DEPTH && !visited.has(current)) {
    visited.add(current);

    if (typeof current === 'string') return current;
    if (typeof current === 'number') return current.toString();

    if (current._id) {
      current = current._id;
      depth += 1;
      continue;
    }

    if (current.id) {
      const idValue = current.id;
      if (typeof idValue === 'string') return idValue;
      current = idValue;
      depth += 1;
      continue;
    }

    break;
  }

  if (current && typeof current === 'object' && typeof current.toString === 'function' && current.toString !== Object.prototype.toString) {
    return current.toString();
  }

  return String(current);
};

// Create a new sales order
const createSalesOrder = async (req, res) => {
  try {
    const { customerInfo, items, deliveryAddress, expectedDeliveryDate, notes, agentName, timestamp } = req.body;

    // Validate required fields
    if (!customerInfo?.address?.city) {
      return res.status(400).json({ 
        error: 'Customer city is required',
        field: 'customerInfo.address.city' 
      });
    }

    // User authentication is optional - use system user if not authenticated
    let userId = req.user?._id || null;
    
    // If no user, try to find a default admin user
    if (!userId) {
      const User = require('../models/User');
      const adminUser = await User.findOne({ role: 'admin', isActive: true });
      if (adminUser) {
        userId = adminUser._id;
      }
    }

    // Validate products and check stock availability
    let totalAmount = 0;
    const validatedItems = [];
    const stockChecks = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ error: `Product with ID ${item.productId} not found` });
      }

      const requestedProductId = normalizeId(item.productId);
      const requestedVariantId = normalizeId(item.variantId || '');
      const requestedVariantName = item.variantName || null;

      // Get variant info if provided
      let variantName = requestedVariantName;
      if (!variantName && requestedVariantId && product.hasVariants && Array.isArray(product.variants)) {
        const variant = product.variants.find(v => {
          const variantId = normalizeId(v._id);
          const variantSku = normalizeId(v.sku);
          return variantId === requestedVariantId || (variantSku && variantSku === requestedVariantId);
        });
        if (variant) {
          variantName = variant.name;
        }
      }

      // Check stock availability across all warehouses (MATCH BY PRODUCT + VARIANT)
      const warehouses = await Warehouse.find({ isActive: true });
      let totalAvailableStock = 0;
      
      for (const warehouse of warehouses) {
        const stockItem = warehouse.currentStock.find(stock => {
          const stockProductId = normalizeId(stock.productId?._id || stock.productId);
          const stockVariantId = normalizeId(stock.variantId || stock.variantDetails?._id || stock.variantDetails?.sku || '');

          const productMatches = stockProductId === requestedProductId;
          const variantMatches = requestedVariantId
            ? stockVariantId === requestedVariantId
            : !stockVariantId;

          return productMatches && variantMatches;
        });
        if (stockItem) {
          const reserved = stockItem.reservedQuantity || 0;
          const delivered = stockItem.deliveredQuantity || 0;
          const confirmedDelivered = stockItem.confirmedDeliveredQuantity || 0;
          const available = (stockItem.quantity || 0) - reserved - delivered - confirmedDelivered;
          totalAvailableStock += Math.max(0, available);
        }
      }
      
      if (totalAvailableStock < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for product ${product.name}${variantName ? ` (${variantName})` : ''}. Available: ${totalAvailableStock}, Required: ${item.quantity}` 
        });
      }

      const itemTotal = item.quantity * item.unitPrice;
      totalAmount += itemTotal;

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        variantName: variantName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: itemTotal
      });

      stockChecks.push({
        productId: item.productId,
        variantId: item.variantId || null,
        variantName: variantName,
        availableStock: totalAvailableStock,
        requiredStock: item.quantity
      });
    }

    // Generate unique order number using atomic operation with retry
    let salesOrder;
    let orderNumber;
    
    // Strategy: Find max order number, then use findOneAndUpdate with upsert to ensure atomicity
    // But since we can't use that for order number generation, we'll use a simple retry loop
    let attempts = 0;
    const maxAttempts = 100;
    
    // Get the maximum order number using aggregation
    let startNumber = 0;
    try {
      const result = await SalesOrder.aggregate([
        { 
          $project: { 
            orderNum: { 
              $toInt: { 
                $arrayElemAt: [
                  { $split: [{ $ifNull: ["$orderNumber", "SO-0000"] }, "-"] },
                  1
                ]
              }
            }
          }
        },
        { $group: { _id: null, maxOrder: { $max: "$orderNum" } } }
      ]);
      
      if (result && result.length > 0 && result[0].maxOrder !== null && result[0].maxOrder !== undefined) {
        startNumber = result[0].maxOrder;
      }
    } catch (aggError) {
      // Fallback: use findOne with sort
      console.warn('Aggregation failed, using fallback method:', aggError.message);
      const lastOrder = await SalesOrder.findOne({}, { orderNumber: 1 }).sort({ orderNumber: -1 });
      if (lastOrder && lastOrder.orderNumber) {
        const match = lastOrder.orderNumber.match(/SO-(\d+)/);
        if (match) {
          startNumber = parseInt(match[1]) || 0;
        }
      }
    }
    
    let candidateNumber = startNumber + 1;
    console.log(`Starting order number generation from: ${startNumber}, next candidate: ${candidateNumber}`);
    
    // Retry loop with database checks
    while (attempts < maxAttempts) {
      orderNumber = `SO-${String(candidateNumber).padStart(4, '0')}`;
      
      try {
        // Check if exists
        const exists = await SalesOrder.findOne({ orderNumber: orderNumber });
        if (exists) {
          candidateNumber++;
          attempts++;
          continue;
        }
        
        // Try to create with this order number
        salesOrder = new SalesOrder({
          orderNumber,
          customerInfo,
          items: validatedItems,
          totalAmount,
          deliveryAddress,
          expectedDeliveryDate,
          notes,
          agentName: agentName || null,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          createdBy: userId
        });

        await salesOrder.save();
        // Success!
        break;
        
      } catch (saveError) {
        // Handle duplicate key error
        if (saveError.code === 11000) {
          candidateNumber++;
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique order number after 100 attempts. Please try again.');
          }
          // Small delay
          await new Promise(resolve => setTimeout(resolve, 10));
          continue;
        }
        // Other errors should be thrown
        throw saveError;
      }
    }
    
    if (!salesOrder) {
      throw new Error('Failed to create sales order: Could not generate unique order number.');
    }
    
    // Reservation will occur on dispatch; keep empty array for response compatibility
    const reservedStock = [];
    
    // Create audit log (only if user is authenticated)
    if (req.user && userId) {
    await createAuditLog(
        userId,
        req.user.role || 'admin',
      'sales_order_created',
      'SalesOrder',
      salesOrder._id,
      null,
      { orderNumber: salesOrder.orderNumber, totalAmount, customerName: customerInfo.name },
      req
    );
    }

    // Populate items for response
    await salesOrder.populate([
      { path: 'items.productId', select: 'name sku' },
      { path: 'createdBy', select: 'firstName lastName' }
    ]);

    res.status(201).json({
      message: 'Sales order created successfully.',
      salesOrder,
      stockChecks,
      reservedStock
    });

  } catch (error) {
    // Log full error for debugging
    console.error('Error creating sales order:', error);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    console.error('Error keyPattern:', error.keyPattern);
    
    // Provide detailed error message to help debugging
    const errorMessage = error.message || 'Internal server error';
    const errorDetails = {
      error: 'Failed to create sales order',
      details: errorMessage,
      code: error.code,
      keyPattern: error.keyPattern
    };
    
    // If it's a duplicate key error, provide specific message
    if (error.code === 11000) {
      errorDetails.error = 'Duplicate order number detected';
      errorDetails.details = `Order number already exists. ${errorMessage}`;
      errorDetails.suggestion = 'Please try again - the system will generate a new number automatically';
    } else {
      errorDetails.suggestion = 'Please check your data and try again. If the problem persists, contact support.';
    }
    
    res.status(500).json(errorDetails);
  }
};

// Get all sales orders
const getAllSalesOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate, isActive, search } = req.query;
    
    // Show all sales orders by default, allow filtering by isActive
    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (status) query.status = status;
    if (startDate || endDate) {
      // Use orderDate, timestamp, or createdAt for date filtering
      query.$or = [];
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        query.$or = [
          { orderDate: { $gte: start, $lte: end } },
          { timestamp: { $gte: start, $lte: end } },
          { createdAt: { $gte: start, $lte: end } }
        ];
      } else if (startDate) {
        const start = new Date(startDate);
        query.$or = [
          { orderDate: { $gte: start } },
          { timestamp: { $gte: start } },
          { createdAt: { $gte: start } }
        ];
      } else if (endDate) {
        const end = new Date(endDate);
        query.$or = [
          { orderDate: { $lte: end } },
          { timestamp: { $lte: end } },
          { createdAt: { $lte: end } }
        ];
      }
    }

    // Add search functionality for phone number, CN number, and agent name
    const isSearching = search && search.trim();
    if (isSearching) {
      const searchRegex = new RegExp(search.trim(), 'i'); // Case-insensitive search
      query.$or = [
        { 'customerInfo.phone': searchRegex },
        { 'customerInfo.cnNumber': searchRegex },
        { 'agentName': searchRegex }
      ];
    }

    // Convert limit and page to numbers, with safety limits
    // When searching OR when limit is high (All Time), allow much higher limit to show all results
    const pageNum = Math.max(1, parseInt(page) || 1);
    const requestedLimit = parseInt(limit) || 10;
    const isHighLimit = requestedLimit >= 1000; // "All Time" or search uses high limit
    
    let limitNum;
    if (isSearching || isHighLimit) {
      // When searching or "All Time", show all results (up to 10000 for safety)
      limitNum = Math.min(10000, Math.max(1, requestedLimit));
    } else {
      // Normal pagination when not searching
      limitNum = Math.min(1000, Math.max(1, requestedLimit));
    }

    // Determine sort order - default to newest first (orderDate descending)
    let sortOrder = { orderDate: -1 }; // Default: newest first

    const salesOrders = await SalesOrder.find(query)
      .populate('items.productId', 'name sku')
      .populate('createdBy', 'firstName lastName')
      .sort(sortOrder)
      .limit(limitNum)
      .skip((isSearching || isHighLimit) ? 0 : (pageNum - 1) * limitNum); // Skip pagination when searching or "All Time"

    const total = await SalesOrder.countDocuments(query);

    res.json({
      salesOrders,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    });

  } catch (error) {
    console.error('Get sales orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get sales order by ID
const getSalesOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const salesOrder = await SalesOrder.findById(id)
      .populate('items.productId', 'name sku description unit')
      .populate('createdBy', 'firstName lastName email');

    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    res.json(salesOrder);

  } catch (error) {
    console.error('Get sales order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update sales order (full update)
const updateSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    const oldStatus = salesOrder.status;
    const newStatus = updateData.status;

    // Update allowed fields
    if (updateData.customerInfo) salesOrder.customerInfo = { ...salesOrder.customerInfo, ...updateData.customerInfo };
    if (updateData.deliveryAddress) salesOrder.deliveryAddress = { ...salesOrder.deliveryAddress, ...updateData.deliveryAddress };
    if (updateData.agentName !== undefined) salesOrder.agentName = updateData.agentName;
    if (updateData.notes !== undefined) salesOrder.notes = updateData.notes;
    if (updateData.items) {
      salesOrder.items = updateData.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId || null,
        variantName: item.variantName || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        isOutOfStock: item.isOutOfStock || false
      }));
      // Recalculate total amount
      salesOrder.totalAmount = salesOrder.items.reduce((sum, item) => sum + item.totalPrice, 0);
    }
    
    // If status is being updated and it's different, update status separately to trigger warehouse logic
    if (newStatus && newStatus !== oldStatus) {
      salesOrder.status = newStatus;
      // The pre-save hooks and status-specific logic will be handled by updateSalesOrderStatus logic
      // For now, just update the status and let the existing save handle it
    }
    
    await salesOrder.save();

    // If status changed, apply warehouse updates using the same logic as status update
    if (newStatus && newStatus !== oldStatus) {
      const Warehouse = require('../models/Warehouse');
      const StockMovement = require('../models/StockMovement');
      
      // Handle DISPATCH status - reserve stock
      if (newStatus === 'dispatch' || newStatus === 'dispatched') {
        const warehouses = await Warehouse.find({ isActive: true });
        
        for (const item of salesOrder.items) {
          const itemProductId = (item.productId && item.productId._id)
            ? item.productId._id.toString()
            : item.productId.toString();
          let quantityToReserve = item.quantity;
          
          for (const warehouse of warehouses) {
            if (quantityToReserve <= 0) break;
            
            const stockItem = warehouse.currentStock.find(stock => 
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
            );
            
            if (stockItem) {
              const availableQty = (stockItem.quantity || 0) - (stockItem.reservedQuantity || 0);
              const reserveQty = Math.min(availableQty, quantityToReserve);
              
              if (reserveQty > 0) {
                stockItem.reservedQuantity = (stockItem.reservedQuantity || 0) + reserveQty;
                quantityToReserve -= reserveQty;
                await warehouse.save();
                
                const stockMovement = new StockMovement({
                  productId: item.productId,
                  warehouseId: warehouse._id,
                  movementType: 'reserved',
                  quantity: reserveQty,
                  previousQuantity: stockItem.quantity - stockItem.reservedQuantity + reserveQty,
                  newQuantity: stockItem.quantity - stockItem.reservedQuantity,
                  referenceType: 'sales_order',
                  referenceId: salesOrder._id,
                  notes: `Reserved for sales order ${salesOrder.orderNumber} (status change)`,
                  createdBy: req.user?._id || salesOrder.createdBy
                });
                await stockMovement.save();
              }
            }
          }
        }
      }
      // Add more status transition logic as needed (delivered, confirmed_delivered, etc.)
    }

    res.json({ 
      message: 'Sales order updated successfully',
      salesOrder 
    });
  } catch (error) {
    console.error('Update sales order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update sales order status
const updateSalesOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    console.log('Status update request:', { id, status, notes });

    const salesOrder = await SalesOrder.findById(id).populate('items.productId');
    if (!salesOrder) {
      console.error('Sales order not found:', id);
      return res.status(404).json({ error: 'Sales order not found' });
    }

    console.log('Current order status:', salesOrder.status);
    console.log('Attempting to change to:', status);

    const oldStatus = salesOrder.status;
    let returnWarehouse = null; // Track warehouse for return status
    
    // Handle DISPATCH status - reserve stock now so it shows in reserved column
    if (status === 'dispatch' || status === 'dispatched') {
      console.log('Processing dispatch - reserving stock (move to reserved column)');
      
      const warehouses = await Warehouse.find({ isActive: true });
      
      for (const item of salesOrder.items) {
        const itemProductId = (item.productId && item.productId._id)
          ? item.productId._id.toString()
          : item.productId.toString();
        let quantityToReserve = item.quantity;
        
        for (const warehouse of warehouses) {
          if (quantityToReserve <= 0) break;
          
          // Match by BOTH productId AND variantId
          const stockItem = warehouse.currentStock.find(stock => 
            stock.productId.toString() === itemProductId &&
            (stock.variantId || null) === (item.variantId || null)
          );
          
          if (stockItem) {
            const availableQty = (stockItem.quantity || 0) - (stockItem.reservedQuantity || 0);
            if (availableQty > 0) {
              const reserveQty = Math.min(availableQty, quantityToReserve);
              
              if (!stockItem.reservedQuantity) {
                stockItem.reservedQuantity = 0;
              }
              stockItem.reservedQuantity += reserveQty;
              quantityToReserve -= reserveQty;
              
              await warehouse.save();
              
              // Create stock movement record for reservation
              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: 'reserved',
                quantity: reserveQty,
                previousQuantity: stockItem.quantity,
                newQuantity: stockItem.quantity,
                referenceType: 'sales_order',
                referenceId: salesOrder._id,
                notes: `Stock reserved for dispatch ${salesOrder.orderNumber}${item.variantName ? ' - ' + item.variantName : ''}`,
                createdBy: req.user?._id || salesOrder.createdBy
              });
              await stockMovement.save();
            }
          }
        }
      }
    }
    
    // Handle cancelled status - release reserved stock
    if (status === 'cancelled') {
      console.log('Processing cancellation - releasing reserved stock');
      
      // Find all warehouses with reserved stock for this order
      const warehouses = await Warehouse.find({ isActive: true });
      
      for (const item of salesOrder.items) {
        const itemProductId = (item.productId && item.productId._id)
          ? item.productId._id.toString()
          : item.productId.toString();
        let quantityToRelease = item.quantity;
        
        for (const warehouse of warehouses) {
          if (quantityToRelease <= 0) break;
          
          // Match by BOTH productId AND variantId
          const stockItem = warehouse.currentStock.find(stock => 
            stock.productId.toString() === itemProductId &&
            (stock.variantId || null) === (item.variantId || null)
          );
          
          if (stockItem && stockItem.reservedQuantity > 0) {
            const releaseQty = Math.min(stockItem.reservedQuantity, quantityToRelease);
            stockItem.reservedQuantity -= releaseQty;
            quantityToRelease -= releaseQty;
            
            await warehouse.save();
            
            // Create stock movement record for release
            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: 'unreserved',
              quantity: releaseQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: 'sales_order',
              referenceId: salesOrder._id,
              notes: `Reserved stock released due to order cancellation ${salesOrder.orderNumber}${item.variantName ? ' - ' + item.variantName : ''}`,
              createdBy: req.user?._id || salesOrder.createdBy
            });
            
            await stockMovement.save();
          }
        }
      }
    }
    
    // Handle DISPATCHED status - Move from reserved to delivered (items leave warehouse)
    if (status === 'dispatched') {
      console.log('Processing dispatched - moving from reserved to delivered');
      
      const warehouses = await Warehouse.find({ isActive: true });
      
      for (const item of salesOrder.items) {
        const itemProductId = (item.productId && item.productId._id)
          ? item.productId._id.toString()
          : item.productId.toString();
        let quantityToMove = item.quantity;
        
        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;
          
          const stockItem = warehouse.currentStock.find(stock => 
            stock.productId.toString() === itemProductId &&
            (stock.variantId || null) === (item.variantId || null)
          );
          
          if (stockItem && stockItem.reservedQuantity > 0) {
            const moveQty = Math.min(stockItem.reservedQuantity, quantityToMove);
            
            // Move from reserved to delivered
            stockItem.reservedQuantity -= moveQty;
            
            // Add to delivered quantity
            if (!stockItem.deliveredQuantity) {
              stockItem.deliveredQuantity = 0;
            }
            stockItem.deliveredQuantity += moveQty;
            
            quantityToMove -= moveQty;
            
            await warehouse.save();
            
            // Create stock movement record
            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: 'out',
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: 'sales_order',
              referenceId: salesOrder._id,
              notes: `Dispatched for sales order ${salesOrder.orderNumber}${item.variantName ? ' - ' + item.variantName : ''} (Moved from reserved to delivered)`,
              createdBy: req.user?._id || salesOrder.createdBy
            });
            await stockMovement.save();
          }
        }
      }
    }
    
    // Handle DELIVERED status - Move from reserved to delivered if not already done
    if (status === 'delivered') {
      console.log('Processing delivered status - ensuring items are moved from reserved to delivered');
      
      const warehouses = await Warehouse.find({ isActive: true });
      
      for (const item of salesOrder.items) {
        const itemProductId = (item.productId && item.productId._id)
          ? item.productId._id.toString()
          : item.productId.toString();
        let quantityToMove = item.quantity;
        
        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;
          
          const stockItem = warehouse.currentStock.find(stock => 
            stock.productId.toString() === itemProductId &&
            (stock.variantId || null) === (item.variantId || null)
          );
          
          if (stockItem && stockItem.reservedQuantity > 0) {
            const moveQty = Math.min(stockItem.reservedQuantity, quantityToMove);
            
            // Move from reserved to delivered
            stockItem.reservedQuantity -= moveQty;
            
            // Add to delivered quantity
            if (!stockItem.deliveredQuantity) {
              stockItem.deliveredQuantity = 0;
            }
            stockItem.deliveredQuantity += moveQty;
            
            quantityToMove -= moveQty;
            
            await warehouse.save();
            
            // Create stock movement record
            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: 'out',
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: 'sales_order',
              referenceId: salesOrder._id,
              notes: `Delivered for sales order ${salesOrder.orderNumber}${item.variantName ? ' - ' + item.variantName : ''} (Moved from reserved to delivered)`,
              createdBy: req.user?._id || salesOrder.createdBy
            });
            await stockMovement.save();
          }
        }
      }
    }
    
    // Handle EXPECTED RETURN - ADD TO EXPECTED RETURNS AND REMOVE FROM RESERVED
    if (status === 'expected_return') {
      console.log('Processing EXPECTED return - adding to expected returns column and removing from reserved');
      
      const warehouses = await Warehouse.find({ isActive: true });
      if (warehouses.length === 0) {
        return res.status(400).json({ error: 'No active warehouse found' });
      }
      
      returnWarehouse = warehouses[0];
      console.log('Adding to expected returns in warehouse:', returnWarehouse.name);
      
      for (const item of salesOrder.items) {
        const product = item.productId;
        let quantityToProcess = item.quantity;
        
        // First, remove from reserved quantity across all warehouses
        for (const warehouse of warehouses) {
          if (quantityToProcess <= 0) break;
          
          const stockItem = warehouse.currentStock.find(stock => 
            stock.productId.toString() === product._id.toString() &&
            (stock.variantId || null) === (item.variantId || null)
          );
          
          if (stockItem && stockItem.reservedQuantity > 0) {
            const releaseQty = Math.min(stockItem.reservedQuantity, quantityToProcess);
            stockItem.reservedQuantity -= releaseQty;
            quantityToProcess -= releaseQty;
            
            console.log(`Removed ${releaseQty} from reserved in ${warehouse.name}`);
            
            await warehouse.save();
            
            // Create stock movement record for unreserving
            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: 'unreserved',
              quantity: releaseQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: 'sales_order',
              referenceId: salesOrder._id,
              notes: `Reserved stock released - moved to expected return for order ${salesOrder.orderNumber}${item.variantName ? ' - ' + item.variantName : ''}`,
              createdBy: req.user?._id || salesOrder.createdBy
            });
            await stockMovement.save();
          }
        }
        
        // Then, add to expected returns in the first warehouse
        let stockItem = returnWarehouse.currentStock.find(stock => 
          stock.productId.toString() === product._id.toString() &&
          (stock.variantId || null) === (item.variantId || null)
        );
        
        if (stockItem) {
          if (!stockItem.expectedReturns) {
            stockItem.expectedReturns = 0;
          }
          stockItem.expectedReturns += item.quantity;
        } else {
          returnWarehouse.currentStock.push({
            productId: product._id,
            variantId: item.variantId || null,
            variantName: item.variantName || null,
            quantity: 0,
            reservedQuantity: 0,
            expectedReturns: item.quantity,
            tags: []
          });
        }
      }
      
      await returnWarehouse.save();
      console.log('Expected returns column updated and reserved quantities released');
      
      // CREATE EXPECTED RETURN RECORD automatically for the red button to work
      const ExpectedReturn = require('../models/ExpectedReturn');
      
      // Check if expected return already exists for this order
      const existingExpectedReturn = await ExpectedReturn.findOne({
        salesOrderId: salesOrder._id,
        status: 'pending'
      });
      
      if (!existingExpectedReturn) {
        console.log('Creating ExpectedReturn record automatically...');
        
        const expectedReturnItems = salesOrder.items.map(item => ({
          productId: item.productId._id || item.productId,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          quantity: item.quantity,
          productName: item.productId.name || 'Unknown Product'
        }));
        
        const expectedReturn = new ExpectedReturn({
          salesOrderId: salesOrder._id,
          orderNumber: salesOrder.orderNumber,
          customerName: salesOrder.customerInfo?.name || salesOrder.customerName || 'Unknown',
          customerEmail: salesOrder.customerInfo?.email || '',
          customerPhone: salesOrder.customerInfo?.phone || '',
          items: expectedReturnItems,
          expectedReturnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          returnReason: 'Customer return request',
          warehouseId: returnWarehouse._id,
          notes: 'Auto-created from sales order expected return',
          refundAmount: salesOrder.totalAmount || 0,
          status: 'pending',
          createdBy: req.user?._id || salesOrder.createdBy
        });
        
        await expectedReturn.save();
        console.log('ExpectedReturn record created:', expectedReturn._id);
      } else {
        console.log('ExpectedReturn record already exists');
      }
    }
    
    // Handle CONFIRMED DELIVERED - Move from delivered to confirmed delivered
    if (status === 'confirmed_delivered') {
      console.log('Processing CONFIRMED DELIVERED - moving from delivered to confirmed delivered');
      
      const warehouses = await Warehouse.find({ isActive: true });
      
      for (const item of salesOrder.items) {
        const itemProductId = (item.productId && item.productId._id)
          ? item.productId._id.toString()
          : item.productId.toString();
        let quantityToConfirm = item.quantity;
        
        for (const warehouse of warehouses) {
          if (quantityToConfirm <= 0) break;
          
          const stockItem = warehouse.currentStock.find(stock => 
            stock.productId.toString() === itemProductId &&
            (stock.variantId || null) === (item.variantId || null)
          );
          
          if (stockItem && stockItem.deliveredQuantity > 0) {
            const confirmQty = Math.min(stockItem.deliveredQuantity, quantityToConfirm);
            
            // Move from delivered to confirmed delivered
            stockItem.deliveredQuantity -= confirmQty;
            
            // Add to confirmed delivered quantity
            if (!stockItem.confirmedDeliveredQuantity) {
              stockItem.confirmedDeliveredQuantity = 0;
            }
            stockItem.confirmedDeliveredQuantity += confirmQty;
            
            quantityToConfirm -= confirmQty;
            
            await warehouse.save();
            
            // Create stock movement record
            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: 'confirmed_delivery',
              quantity: confirmQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: 'sales_order',
              referenceId: salesOrder._id,
              notes: `Confirmed delivered for sales order ${salesOrder.orderNumber}${item.variantName ? ' - ' + item.variantName : ''}`,
              createdBy: req.user?._id || salesOrder.createdBy
            });
            await stockMovement.save();
          }
        }
      }
    }
    
    // Handle CONFIRMED RETURN - DISABLED (use Expected Returns module instead)
    if (status === 'returned') {
      return res.status(400).json({ 
        error: 'Direct return from delivered status is not allowed. Please use "Expected Return" first, then confirm receipt in Expected Returns module.',
        suggestion: 'Click "Expected Return" button instead to track the return properly'
      });
    }
    
    salesOrder.status = status;
    if (notes) salesOrder.notes = notes;

    await salesOrder.save();

    console.log('Status updated successfully to:', salesOrder.status);

    // Create audit log (only if user is authenticated)
    if (req.user) {
    await createAuditLog(
      req.user._id,
      req.user.role,
      'sales_order_status_updated',
      'SalesOrder',
      salesOrder._id,
      { status: oldStatus },
      { status: salesOrder.status },
      { orderNumber: salesOrder.orderNumber },
      req
    );
    }

    res.json({
          message: status === 'expected_return'
            ? `Order added to Expected Returns in ${returnWarehouse ? returnWarehouse.name : 'warehouse'}`
            : status === 'returned' 
            ? `Return confirmed! Stock added to ${returnWarehouse ? returnWarehouse.name : 'warehouse'}`
            : status === 'delivered'
            ? 'Order delivered successfully! Reserved stock cleared (0) and stock removed from warehouse.'
            : status === 'confirmed_delivered'
            ? 'Order confirmed as delivered! Items moved to confirmed delivered column in warehouse.'
            : 'Sales order status updated successfully',
          salesOrder,
          stockRestored: status === 'returned',
          expectedReturn: status === 'expected_return',
          delivered: status === 'delivered',
          confirmedDelivered: status === 'confirmed_delivered',
          reservedCleared: status === 'delivered' || status === 'dispatch' || status === 'dispatched',
          warehouseName: returnWarehouse ? returnWarehouse.name : null
    });

  } catch (error) {
    console.error('Update sales order status error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // Send more detailed error info
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: error.name 
    });
  }
};

// Dispatch sales order
const dispatchSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouseId, trackingNumber, carrier, expectedDeliveryDate } = req.body;

    const salesOrder = await SalesOrder.findById(id).populate('items.productId');
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    // Allow dispatching from pending status (not just confirmed)
    if (salesOrder.status === 'delivered' || salesOrder.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot dispatch this order' });
    }

    // Find warehouses with reserved stock and REMOVE IT
    const warehouses = await Warehouse.find({ isActive: true });
    
    for (const orderItem of salesOrder.items) {
      let quantityToRemove = orderItem.quantity;
      
      for (const warehouse of warehouses) {
        if (quantityToRemove <= 0) break;
        
        // Match by BOTH productId AND variantId
      const stockItem = warehouse.currentStock.find(item => 
          item.productId.toString() === orderItem.productId.toString() &&
          (item.variantId || null) === (orderItem.variantId || null)
        );

        if (stockItem && stockItem.reservedQuantity > 0) {
          const removeQty = Math.min(stockItem.reservedQuantity, quantityToRemove);
          
          // REMOVE from both quantity AND reserved
          stockItem.quantity -= removeQty;
          stockItem.reservedQuantity -= removeQty;
          quantityToRemove -= removeQty;
          
          await warehouse.save();
          
          // Create stock movement
          const stockMovement = new StockMovement({
            productId: orderItem.productId,
            warehouseId: warehouse._id,
            movementType: 'out',
            quantity: removeQty,
            previousQuantity: stockItem.quantity + removeQty,
            newQuantity: stockItem.quantity,
            referenceType: 'sales_order',
            referenceId: salesOrder._id,
            notes: `Dispatched for sales order ${salesOrder.orderNumber}${orderItem.variantName ? ' - ' + orderItem.variantName : ''}`,
            createdBy: req.user?._id || salesOrder.createdBy
          });
          await stockMovement.save();
        }
      }
    }

    // Get user ID
    let userId = req.user?._id || salesOrder.createdBy;

    // Create shipment
    const shipment = new SalesShipment({
      salesOrderId: salesOrder._id,
      items: salesOrder.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        warehouseId
      })),
      trackingNumber,
      carrier,
      expectedDeliveryDate,
      deliveryAddress: salesOrder.deliveryAddress,
      createdBy: userId
    });

    await shipment.save();

    // Update sales order status
    salesOrder.status = 'dispatched';
    await salesOrder.save();

    // Create audit log (only if user is authenticated)
    if (req.user) {
    await createAuditLog(
      req.user._id,
      req.user.role,
      'sales_order_dispatched',
      'SalesOrder',
      salesOrder._id,
      { status: 'confirmed' },
      { status: 'dispatched' },
      { orderNumber: salesOrder.orderNumber, shipmentNumber: shipment.shipmentNumber },
      req
    );
    }

    res.json({
      message: 'Sales order dispatched successfully',
      salesOrder,
      shipment
    });

  } catch (error) {
    console.error('Dispatch sales order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Mark delivery as completed
const markDeliveryCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualDeliveryDate } = req.body;
    
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    if (salesOrder.status !== 'dispatched') {
      return res.status(400).json({ error: 'Sales order must be dispatched to mark as delivered' });
    }

    // Get the shipment
    const shipment = await SalesShipment.findOne({ salesOrderId: id });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // Stock already removed during dispatch - no need to remove again

    // Update sales order and shipment
    salesOrder.status = 'delivered';
    salesOrder.actualDeliveryDate = actualDeliveryDate || new Date();
    
    shipment.status = 'delivered';
    shipment.actualDeliveryDate = actualDeliveryDate || new Date();

    await salesOrder.save();
    await shipment.save();

    // Create audit log (only if user is authenticated)
    if (req.user) {
    await createAuditLog(
      req.user._id,
      req.user.role,
      'sales_order_delivered',
      'SalesOrder',
      salesOrder._id,
      { status: 'dispatched' },
      { status: 'delivered' },
      { orderNumber: salesOrder.orderNumber },
      req
    );
    }

    res.json({
      message: 'Delivery marked as completed successfully',
      salesOrder,
      shipment
    });

  } catch (error) {
    console.error('Mark delivery completed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete sales order (hard delete)
const deleteSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    
    const salesOrder = await SalesOrder.findById(id).populate('items.productId');
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    if (salesOrder.status === 'dispatched' || salesOrder.status === 'delivered') {
      return res.status(400).json({ 
        error: 'Cannot delete dispatched or delivered sales order' 
      });
    }

    // CLEAN UP WAREHOUSE - Release reserved stock and expected returns
    const warehouses = await Warehouse.find({ isActive: true });
    
    for (const item of salesOrder.items) {
      for (const warehouse of warehouses) {
        const stockItem = warehouse.currentStock.find(stock => 
          stock.productId.toString() === item.productId._id.toString() &&
          (stock.variantId || null) === (item.variantId || null)
        );
        
        if (stockItem) {
          // Release reserved quantity
          if (stockItem.reservedQuantity && stockItem.reservedQuantity > 0) {
            const releaseQty = Math.min(stockItem.reservedQuantity, item.quantity);
            stockItem.reservedQuantity -= releaseQty;
          }
          
          // Remove expected returns
          if (stockItem.expectedReturns && stockItem.expectedReturns > 0) {
            const removeQty = Math.min(stockItem.expectedReturns, item.quantity);
            stockItem.expectedReturns -= removeQty;
          }
          
          await warehouse.save();
        }
      }
    }

    // Hard delete
    await SalesOrder.findByIdAndDelete(id);

    // Create audit log (only if user is authenticated)
    if (req.user) {
    await createAuditLog(
      req.user._id,
      req.user.role,
      'sales_order_deleted',
      'SalesOrder',
      id,
      salesOrder.toObject(),
      null,
      { orderNumber: salesOrder.orderNumber },
      req
    );
  }

    res.json({ 
      message: 'Sales order deleted successfully',
      warehouseUpdated: true
    });

  } catch (error) {
    console.error('Delete sales order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update QC status
const updateQCStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { qcStatus } = req.body;

    if (!qcStatus || !['pending', 'approved', 'rejected'].includes(qcStatus)) {
      return res.status(400).json({ error: 'Invalid QC status. Must be pending, approved, or rejected' });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    salesOrder.qcStatus = qcStatus;
    await salesOrder.save();

    res.json({ 
      message: `QC status updated to ${qcStatus}`,
      salesOrder 
    });
  } catch (error) {
    console.error('Update QC status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check for duplicate phone numbers in sales orders
const checkDuplicatePhoneNumbers = async (req, res) => {
  try {
    const { limit = 1000 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 1000, 5000); // Max 5000 for safety
    
    // Get all active sales orders
    const allOrders = await SalesOrder.find({ 
      isActive: { $ne: false },
      'customerInfo.phone': { $exists: true, $ne: null, $ne: '' }
    })
    .select('orderNumber customerInfo items totalAmount timestamp status agentName')
    .sort({ timestamp: -1 })
    .limit(limitNum);
    
    // Group orders by normalized phone number
    const phoneGroups = {};
    
    for (const order of allOrders) {
      const phone = order.customerInfo?.phone;
      if (!phone) continue;
      
      // Normalize phone number (remove spaces, dashes, convert to lowercase)
      const normalizedPhone = phone.replace(/[\s-]/g, '').toLowerCase();
      
      if (!phoneGroups[normalizedPhone]) {
        phoneGroups[normalizedPhone] = [];
      }
      phoneGroups[normalizedPhone].push(order);
    }
    
    // Find phone numbers with multiple orders
    const duplicatePhones = [];
    
    for (const [normalizedPhone, orders] of Object.entries(phoneGroups)) {
      if (orders.length > 1) {
        // Group by customer name to see if same customer or different customers
        const customerGroups = {};
        
        for (const order of orders) {
          const customerName = order.customerInfo?.name?.trim().toLowerCase() || 'Unknown';
          if (!customerGroups[customerName]) {
            customerGroups[customerName] = [];
          }
          customerGroups[customerName].push(order);
        }
        
        const uniqueCustomers = Object.keys(customerGroups).length;
        const totalOrders = orders.length;
        
        // Calculate statistics
        const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const statusCounts = {};
        orders.forEach(o => {
          statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        });
        
        duplicatePhones.push({
          phoneNumber: orders[0].customerInfo.phone, // Original format
          normalizedPhone: normalizedPhone,
          totalOrders: totalOrders,
          uniqueCustomers: uniqueCustomers,
          totalAmount: totalAmount,
          averageOrderAmount: totalAmount / totalOrders,
          statusCounts: statusCounts,
          orders: orders.map(order => ({
            orderNumber: order.orderNumber,
            timestamp: order.timestamp,
            customerName: order.customerInfo?.name,
            phone: order.customerInfo?.phone,
            cnNumber: order.customerInfo?.cnNumber,
            totalAmount: order.totalAmount,
            status: order.status,
            agentName: order.agentName,
            itemsCount: order.items?.length || 0
          })),
          customers: Object.keys(customerGroups).map(name => ({
            name: name,
            orderCount: customerGroups[name].length,
            orders: customerGroups[name].map(o => o.orderNumber)
          })),
          isSameCustomer: uniqueCustomers === 1,
          message: uniqueCustomers === 1 
            ? `Phone number used for ${totalOrders} orders by the same customer`
            : `Phone number used for ${totalOrders} orders by ${uniqueCustomers} different customers`
        });
      }
    }
    
    // Sort by total orders (descending)
    duplicatePhones.sort((a, b) => b.totalOrders - a.totalOrders);
    
    // Calculate summary statistics
    const summary = {
      totalOrdersChecked: allOrders.length,
      uniquePhoneNumbers: Object.keys(phoneGroups).length,
      duplicatePhoneNumbers: duplicatePhones.length,
      phoneNumbersWithMultipleOrders: duplicatePhones.filter(p => p.totalOrders > 1).length,
      phoneNumbersWithDifferentCustomers: duplicatePhones.filter(p => !p.isSameCustomer).length,
      totalOrdersWithDuplicates: duplicatePhones.reduce((sum, p) => sum + p.totalOrders, 0)
    };
    
    res.json({
      message: `Checked ${allOrders.length} orders for duplicate phone numbers`,
      summary: summary,
      duplicates: duplicatePhones
    });
    
  } catch (error) {
    console.error('Check duplicate phone numbers error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Check for duplicate phone numbers for a specific phone number
const checkPhoneNumberDuplicates = async (req, res) => {
  try {
    const { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Normalize phone number
    const normalizedPhone = phone.replace(/[\s-]/g, '').toLowerCase();
    const phoneRegex = new RegExp(normalizedPhone.replace(/[-\s]/g, '[\\s-]*'), 'i');
    
    // Find all orders with this phone number
    const orders = await SalesOrder.find({
      isActive: { $ne: false },
      'customerInfo.phone': phoneRegex
    })
    .select('orderNumber customerInfo items totalAmount timestamp status agentName')
    .sort({ timestamp: -1 });
    
    if (orders.length === 0) {
      return res.json({
        message: `No orders found for phone number: ${phone}`,
        phoneNumber: phone,
        orders: []
      });
    }
    
    // Group by customer name
    const customerGroups = {};
    for (const order of orders) {
      const customerName = order.customerInfo?.name?.trim().toLowerCase() || 'Unknown';
      if (!customerGroups[customerName]) {
        customerGroups[customerName] = [];
      }
      customerGroups[customerName].push(order);
    }
    
    const uniqueCustomers = Object.keys(customerGroups).length;
    const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    
    res.json({
      message: `Found ${orders.length} order(s) for phone number: ${phone}`,
      phoneNumber: phone,
      normalizedPhone: normalizedPhone,
      totalOrders: orders.length,
      uniqueCustomers: uniqueCustomers,
      totalAmount: totalAmount,
      averageOrderAmount: totalAmount / orders.length,
      isSameCustomer: uniqueCustomers === 1,
      orders: orders.map(order => ({
        orderNumber: order.orderNumber,
        timestamp: order.timestamp,
        customerName: order.customerInfo?.name,
        phone: order.customerInfo?.phone,
        cnNumber: order.customerInfo?.cnNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        agentName: order.agentName,
        itemsCount: order.items?.length || 0
      })),
      customers: Object.keys(customerGroups).map(name => ({
        name: name,
        orderCount: customerGroups[name].length,
        orders: customerGroups[name].map(o => o.orderNumber)
      }))
    });
    
  } catch (error) {
    console.error('Check phone number duplicates error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

module.exports = {
  createSalesOrder,
  getAllSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  updateSalesOrderStatus,
  dispatchSalesOrder,
  markDeliveryCompleted,
  deleteSalesOrder,
  updateQCStatus,
  checkDuplicatePhoneNumbers,
  checkPhoneNumberDuplicates
};