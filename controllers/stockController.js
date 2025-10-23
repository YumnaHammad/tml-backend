const { Product, Warehouse, StockMovement, StockAlert } = require('../models');
const { createAuditLog } = require('../middleware/audit');

// Get stock alerts for products
const getStockAlerts = async (req, res) => {
  try {
    const { daysThreshold = 30 } = req.query;

    // Show alerts for all products, not just active ones
    const products = await Product.find({});

    const alerts = [];

    for (const product of products) {
      // Get stock movements for the last 90 days to calculate velocity
      const stockMovements = await StockMovement.find({
        productId: product._id,
        movementType: 'out',
        movementDate: {
          $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        }
      }).sort({ movementDate: -1 });

      // Calculate average daily sales
      const totalSold = stockMovements.reduce((sum, movement) => sum + movement.quantity, 0);
      const dailySalesRate = totalSold / 90; // Average over 90 days

      // Get current stock across all warehouses
      const warehouses = await Warehouse.find({});
      let totalCurrentStock = 0;

      for (const warehouse of warehouses) {
        const stockItem = warehouse.currentStock.find(item => 
          item.productId.toString() === product._id.toString()
        );
        if (stockItem) {
          totalCurrentStock += stockItem.quantity;
        }
      }

      // Calculate days of inventory remaining
      const daysOfInventory = dailySalesRate > 0 ? Math.floor(totalCurrentStock / dailySalesRate) : 999;

      // Create alert if stock is low
      if (daysOfInventory <= daysThreshold && totalCurrentStock > 0) {
        alerts.push({
          productId: product._id,
          productName: product.name,
          productSku: product.sku,
          currentStock: totalCurrentStock,
          dailySalesRate: Math.round(dailySalesRate * 100) / 100,
          daysOfInventory,
          alertLevel: daysOfInventory <= 7 ? 'critical' : daysOfInventory <= 15 ? 'warning' : 'low',
          warehouses: warehouses.map(warehouse => {
            const stockItem = warehouse.currentStock.find(item => 
              item.productId.toString() === product._id.toString()
            );
            return {
              warehouseId: warehouse._id,
              warehouseName: warehouse.name,
              stock: stockItem ? stockItem.quantity : 0
            };
          })
        });
      }
    }

    // Sort by alert level and days of inventory
    alerts.sort((a, b) => {
      const levelOrder = { critical: 0, warning: 1, low: 2 };
      if (levelOrder[a.alertLevel] !== levelOrder[b.alertLevel]) {
        return levelOrder[a.alertLevel] - levelOrder[b.alertLevel];
      }
      return a.daysOfInventory - b.daysOfInventory;
    });

    res.json({
      alerts,
      totalAlerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.alertLevel === 'critical').length,
      warningAlerts: alerts.filter(a => a.alertLevel === 'warning').length,
      lowAlerts: alerts.filter(a => a.alertLevel === 'low').length
    });

  } catch (error) {
    console.error('Get stock alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get stock movements for a product
const getProductStockMovements = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 50, startDate, endDate, warehouseId } = req.query;

    let query = { productId };
    
    if (warehouseId) query.warehouseId = warehouseId;
    if (startDate || endDate) {
      query.movementDate = {};
      if (startDate) query.movementDate.$gte = new Date(startDate);
      if (endDate) query.movementDate.$lte = new Date(endDate);
    }

    const movements = await StockMovement.find(query)
      .populate('warehouseId', 'name location')
      .populate('createdBy', 'firstName lastName')
      .sort({ movementDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockMovement.countDocuments(query);

    res.json({
      movements,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get product stock movements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get current stock levels across all warehouses
const getCurrentStockLevels = async (req, res) => {
  try {
    const { productId, warehouseId } = req.query;

    // Show all warehouses, not just active ones
    let query = {};
    if (warehouseId) query._id = warehouseId;

    const warehouses = await Warehouse.find(query);
    const stockLevels = [];

    for (const warehouse of warehouses) {
      const warehouseStock = {
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        warehouseLocation: warehouse.location,
        capacity: warehouse.capacity,
        products: []
      };

      for (const stockItem of warehouse.currentStock) {
        // If productId filter is provided, only include that product
        if (productId && stockItem.productId.toString() !== productId) {
          continue;
        }

        const product = await Product.findById(stockItem.productId);
        if (product) {
          warehouseStock.products.push({
            productId: stockItem.productId,
            productName: product.name,
            productSku: product.sku,
            currentStock: stockItem.quantity,
            reservedStock: stockItem.reservedQuantity,
            availableStock: stockItem.quantity - stockItem.reservedQuantity,
            tags: stockItem.tags || [],
            returnedAt: stockItem.returnedAt
          });
        }
      }

      // Calculate warehouse utilization
      const totalStock = warehouse.currentStock.reduce((sum, item) => sum + item.quantity, 0);
      warehouseStock.totalStock = totalStock;
      warehouseStock.utilization = Math.round((totalStock / warehouse.capacity) * 100);

      stockLevels.push(warehouseStock);
    }

    res.json(stockLevels);

  } catch (error) {
    console.error('Get current stock levels error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Transfer stock between warehouses
const transferStock = async (req, res) => {
  try {
    const { fromWarehouseId, toWarehouseId, productId, quantity, notes } = req.body;

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ error: 'Source and destination warehouses cannot be the same' });
    }

    // Validate warehouses
    const fromWarehouse = await Warehouse.findById(fromWarehouseId);
    const toWarehouse = await Warehouse.findById(toWarehouseId);

    if (!fromWarehouse) {
      return res.status(404).json({ error: 'Source warehouse not found' });
    }
    if (!toWarehouse) {
      return res.status(404).json({ error: 'Destination warehouse not found' });
    }

    // Validate product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check source warehouse stock
    const fromStockItem = fromWarehouse.currentStock.find(item => 
      item.productId.toString() === productId
    );

    if (!fromStockItem || fromStockItem.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock in source warehouse' });
    }

    // Check destination warehouse capacity
    const currentDestinationStock = toWarehouse.currentStock.reduce((sum, item) => sum + item.quantity, 0);
    if (currentDestinationStock + quantity > toWarehouse.capacity) {
      return res.status(400).json({ error: 'Transfer would exceed destination warehouse capacity' });
    }

    // Perform transfer
    const previousFromQuantity = fromStockItem.quantity;
    fromStockItem.quantity -= quantity;

    // Remove stock item if quantity becomes 0
    if (fromStockItem.quantity === 0) {
      fromWarehouse.currentStock = fromWarehouse.currentStock.filter(item => 
        item.productId.toString() !== productId
      );
    }

    // Add to destination warehouse
    let toStockItem = toWarehouse.currentStock.find(item => 
      item.productId.toString() === productId
    );

    if (toStockItem) {
      const previousToQuantity = toStockItem.quantity;
      toStockItem.quantity += quantity;

      // Create stock movement records
      const fromMovement = new StockMovement({
        productId,
        warehouseId: fromWarehouseId,
        movementType: 'transfer_out',
        quantity,
        previousQuantity: previousFromQuantity,
        newQuantity: fromStockItem.quantity,
        referenceType: 'transfer',
        referenceId: toWarehouseId,
        notes: `Transferred to ${toWarehouse.name} - ${notes || ''}`,
        createdBy: req.user._id
      });

      const toMovement = new StockMovement({
        productId,
        warehouseId: toWarehouseId,
        movementType: 'transfer_in',
        quantity,
        previousQuantity: previousToQuantity,
        newQuantity: toStockItem.quantity,
        referenceType: 'transfer',
        referenceId: fromWarehouseId,
        notes: `Transferred from ${fromWarehouse.name} - ${notes || ''}`,
        createdBy: req.user._id
      });

      await fromMovement.save();
      await toMovement.save();
    } else {
      toWarehouse.currentStock.push({
        productId,
        quantity,
        reservedQuantity: 0
      });

      // Create stock movement records
      const fromMovement = new StockMovement({
        productId,
        warehouseId: fromWarehouseId,
        movementType: 'transfer_out',
        quantity,
        previousQuantity: previousFromQuantity,
        newQuantity: 0,
        referenceType: 'transfer',
        referenceId: toWarehouseId,
        notes: `Transferred to ${toWarehouse.name} - ${notes || ''}`,
        createdBy: req.user._id
      });

      const toMovement = new StockMovement({
      productId,
        warehouseId: toWarehouseId,
        movementType: 'transfer_in',
        quantity,
        previousQuantity: 0,
        newQuantity: quantity,
        referenceType: 'transfer',
        referenceId: fromWarehouseId,
        notes: `Transferred from ${fromWarehouse.name} - ${notes || ''}`,
        createdBy: req.user._id
      });

      await fromMovement.save();
      await toMovement.save();
    }

    await fromWarehouse.save();
    await toWarehouse.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'stock_transferred',
      'StockMovement',
      null,
      null,
      { 
        productName: product.name, 
        quantity, 
        fromWarehouse: fromWarehouse.name,
        toWarehouse: toWarehouse.name 
      },
      req
    );

    res.json({
      message: 'Stock transferred successfully',
      transfer: {
        productId,
        productName: product.name,
        quantity,
        fromWarehouse: {
          id: fromWarehouse._id,
          name: fromWarehouse.name
        },
        toWarehouse: {
          id: toWarehouse._id,
          name: toWarehouse.name
        }
      }
    });

  } catch (error) {
    console.error('Transfer stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Adjust stock (manual adjustment)
const adjustStock = async (req, res) => {
  try {
    const { warehouseId, productId, adjustmentQuantity, reason, notes } = req.body;

    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stockItem = warehouse.currentStock.find(item => 
      item.productId.toString() === productId
    );

    const previousQuantity = stockItem ? stockItem.quantity : 0;
    const newQuantity = Math.max(0, previousQuantity + adjustmentQuantity);

    if (stockItem) {
      stockItem.quantity = newQuantity;
    } else {
      warehouse.currentStock.push({
        productId,
        quantity: newQuantity,
        reservedQuantity: 0
      });
    }

    // Create stock movement record
    const stockMovement = new StockMovement({
      productId,
      warehouseId,
      movementType: 'adjustment',
      quantity: adjustmentQuantity,
      previousQuantity,
      newQuantity,
      referenceType: 'adjustment',
      referenceId: null,
      notes: `${reason} - ${notes || ''}`,
      createdBy: req.user._id
    });

    await stockMovement.save();
    await warehouse.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'stock_adjusted',
      'StockMovement',
      stockMovement._id,
      { quantity: previousQuantity },
      { quantity: newQuantity },
      { productName: product.name, adjustmentQuantity, reason },
      req
    );

    res.json({
      message: 'Stock adjusted successfully',
      adjustment: {
        productId,
        productName: product.name,
        warehouseId,
        warehouseName: warehouse.name,
        previousQuantity,
        adjustmentQuantity,
        newQuantity,
        reason
      }
    });

  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getStockAlerts,
  getProductStockMovements,
  getCurrentStockLevels,
  transferStock,
  adjustStock
};