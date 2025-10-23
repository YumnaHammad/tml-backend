const { Warehouse, Product, AuditLog } = require('../models');
const { createAuditLog } = require('../middleware/audit');

const getAllWarehouses = async (req, res) => {
  try {
    // Allow filtering by isActive status via query parameter
    const { isActive } = req.query;
    const query = isActive !== undefined ? { isActive: isActive === 'true' } : {};
    
    const warehouses = await Warehouse.find(query)
      .populate('currentStock.productId', 'name sku category sellingPrice hasVariants variants')
      .sort({ createdAt: -1 });

    const warehousesWithStats = warehouses.map(warehouse => {
      // Enrich stock items with variant details
      const enrichedStock = warehouse.currentStock.map(stockItem => {
        const stockObj = stockItem.toObject ? stockItem.toObject() : stockItem;
        const product = stockObj.productId;
        
        // If product has variants and this stock item has a variantId, find the variant details
        if (product && product.hasVariants && product.variants && stockObj.variantId) {
          const variant = product.variants.find(v => 
            (v._id && v._id.toString() === stockObj.variantId) || 
            (v.sku === stockObj.variantId) ||
            (v.sku && stockObj.variantId && v.sku.toString() === stockObj.variantId.toString())
          );
          
          if (variant) {
            return {
              ...stockObj,
              variantDetails: {
                name: variant.name,
                sku: variant.sku,
                sellingPrice: variant.sellingPrice,
                attributes: variant.attributes
              }
            };
          }
        }
        
        return stockObj;
      });

      return {
        ...warehouse.toObject(),
        currentStock: enrichedStock,
        totalStock: warehouse.getTotalStock(),
        capacityUsage: warehouse.getCapacityUsage(),
        productCount: warehouse.currentStock.length
      };
    });

    res.json(warehousesWithStats);
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getWarehouseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const warehouse = await Warehouse.findById(id)
      .populate('currentStock.productId', 'name sku category sellingPrice hasVariants variants');
    
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    // Enrich stock items with variant details
    const enrichedStock = warehouse.currentStock.map(stockItem => {
      const stockObj = stockItem.toObject ? stockItem.toObject() : stockItem;
      const product = stockObj.productId;
      
      // If product has variants and this stock item has a variantId, find the variant details
      if (product && product.hasVariants && product.variants && stockObj.variantId) {
        const variant = product.variants.find(v => 
          (v._id && v._id.toString() === stockObj.variantId) || 
          (v.sku === stockObj.variantId) ||
          (v.sku && stockObj.variantId && v.sku.toString() === stockObj.variantId.toString())
        );
        
        if (variant) {
          return {
            ...stockObj,
            variantDetails: {
              name: variant.name,
              sku: variant.sku,
              sellingPrice: variant.sellingPrice,
              attributes: variant.attributes
            }
          };
        }
      }
      
      return stockObj;
    });

    const warehouseData = {
      ...warehouse.toObject(),
      currentStock: enrichedStock,
      totalStock: warehouse.getTotalStock(),
      capacityUsage: warehouse.getCapacityUsage(),
      availableCapacity: warehouse.capacity - warehouse.getTotalStock()
    };

    res.json(warehouseData);
  } catch (error) {
    console.error('Get warehouse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createWarehouse = async (req, res) => {
  try {
    const warehouseData = req.body;
    
    console.log('Creating warehouse with data:', JSON.stringify(warehouseData, null, 2));
    
    // Validate required fields
    if (!warehouseData.name || !warehouseData.name.trim()) {
      return res.status(400).json({ 
        error: 'Name is required',
        field: 'name',
        message: 'Please provide a warehouse name'
      });
    }
    
    if (!warehouseData.location || !warehouseData.location.trim()) {
      return res.status(400).json({ 
        error: 'Location is required',
        field: 'location',
        message: 'Please provide a warehouse location'
      });
    }
    
    if (!warehouseData.capacity || warehouseData.capacity < 1) {
      return res.status(400).json({ 
        error: 'Capacity is required',
        field: 'capacity',
        message: 'Please provide a valid warehouse capacity (minimum 1)'
      });
    }
    
    const warehouse = await Warehouse.create(warehouseData);
    
    // Create audit log only if user is authenticated
    if (req.user) {
      try {
        await createAuditLog(
          req.user._id,
          req.user.role,
          'warehouse_created',
          'Warehouse',
          warehouse._id,
          null,
          warehouse.toObject(),
          { name: warehouse.name, capacity: warehouse.capacity },
          req
        );
      } catch (auditError) {
        // Audit log error is non-critical
      }
    }

    res.status(201).json({
      message: 'Warehouse created successfully',
      warehouse
    });
  } catch (error) {
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = {};
      Object.keys(error.errors).forEach(key => {
        validationErrors[key] = error.errors[key].message;
      });
      
      return res.status(400).json({ 
        error: 'Validation failed',
        validationErrors,
        message: 'Please check all required fields'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create warehouse',
      details: error.message
    });
  }
};

const updateWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    const oldValues = warehouse.toObject();
    const updatedWarehouse = await Warehouse.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );

    // Create audit log only if user is authenticated
    if (req.user) {
      try {
        await createAuditLog(
          req.user._id,
          req.user.role,
          'warehouse_updated',
          'Warehouse',
          id,
          oldValues,
          updatedWarehouse.toObject(),
          { name: updatedWarehouse.name, capacity: updatedWarehouse.capacity },
          req
        );
      } catch (auditError) {
        // Audit log error is non-critical
      }
    }

    res.json({
      message: 'Warehouse updated successfully',
      warehouse: updatedWarehouse
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update warehouse',
      details: error.message
    });
  }
};

const deleteWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    
    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    // Check if warehouse has stock
    const totalStock = warehouse.getTotalStock();
    if (totalStock > 0) {
      return res.status(409).json({ 
        error: 'Warehouse contains stock. Transfer or remove stock before deletion.' 
      });
    }

    // Hard delete - completely remove from database
    await Warehouse.findByIdAndDelete(id);

    // Create audit log only if user is authenticated
    if (req.user) {
      try {
        await createAuditLog(
          req.user._id,
          req.user.role,
          'warehouse_deleted',
          'Warehouse',
          id,
          warehouse.toObject(),
          null,
          { name: warehouse.name, totalStock },
          req
        );
      } catch (auditError) {
        // Audit log error is non-critical
      }
    }

    res.json({ message: 'Warehouse deleted successfully' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete warehouse',
      details: error.message
    });
  }
};

const addStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, quantity, tags = [] } = req.body;

    // Validate input
    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Product ID and valid quantity are required' });
    }

    // Check if warehouse exists
    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check warehouse capacity
    const currentStock = warehouse.getTotalStock();
    if (currentStock + quantity > warehouse.capacity) {
      return res.status(400).json({ 
        error: `Adding ${quantity} items would exceed warehouse capacity. Available space: ${warehouse.capacity - currentStock}` 
      });
    }

    // Add stock to warehouse
    await warehouse.updateStock(productId, quantity, tags);
    await warehouse.save();

    // Create audit log only if user is authenticated
    if (req.user) {
      try {
        await createAuditLog(
          req.user._id,
          req.user.role,
          'stock_added',
          'Warehouse',
          id,
          { totalStock: currentStock },
          { totalStock: warehouse.getTotalStock() },
          { 
            productId,
            productName: product.name,
            quantity,
            tags,
            warehouseName: warehouse.name
          },
          req
        );
      } catch (auditError) {
        // Audit log error is non-critical
      }
    }

    // Populate the updated warehouse with product details
    await warehouse.populate('currentStock.productId', 'name sku category');

    res.json({
      message: 'Stock added successfully',
      warehouse: {
        ...warehouse.toObject(),
        totalStock: warehouse.getTotalStock(),
        capacityUsage: warehouse.getCapacityUsage()
      },
      addedStock: {
        product: product.name,
        quantity,
        tags
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const transferStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetWarehouseId, transfers } = req.body;

    const sourceWarehouse = await Warehouse.findById(id);
    const targetWarehouse = await Warehouse.findById(targetWarehouseId);

    if (!sourceWarehouse || !targetWarehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    if (sourceWarehouse._id.toString() === targetWarehouse._id.toString()) {
      return res.status(400).json({ error: 'Source and target warehouses cannot be the same' });
    }

    // Validate transfers and check available stock
    for (const transfer of transfers) {
      const { productId, quantity } = transfer;
      
      const sourceStockItem = sourceWarehouse.currentStock.find(item => 
        item.productId.toString() === productId
      );
      
      if (!sourceStockItem || sourceStockItem.quantity < quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for product ${productId}` 
        });
      }

      // Check target warehouse capacity
      const product = await Product.findById(productId);
      const currentTargetStock = targetWarehouse.getTotalStock();
      if (currentTargetStock + quantity > targetWarehouse.capacity) {
        return res.status(400).json({ 
          error: `Transfer would exceed target warehouse capacity` 
        });
      }
    }

    // Perform transfers
    const transferDetails = [];
    
    for (const transfer of transfers) {
      const { productId, quantity, tags = [] } = transfer;
      
      // Remove from source warehouse
      const sourceStockItem = sourceWarehouse.currentStock.find(item => 
        item.productId.toString() === productId
      );
      sourceStockItem.quantity -= quantity;
      
      if (sourceStockItem.quantity === 0) {
        sourceWarehouse.currentStock = sourceWarehouse.currentStock.filter(
          item => item.productId.toString() !== productId
        );
      }

      // Add to target warehouse
      await targetWarehouse.updateStock(productId, quantity, tags);
      
      transferDetails.push({
        productId,
        quantity,
        fromWarehouse: sourceWarehouse.name,
        toWarehouse: targetWarehouse.name
      });
    }

    await sourceWarehouse.save();
    await targetWarehouse.save();

    // Create audit log only if user is authenticated
    if (req.user) {
      try {
        await createAuditLog(
          req.user._id,
          req.user.role,
          'stock_transferred',
          'Warehouse',
          id,
          { sourceStock: sourceWarehouse.currentStock },
          { targetStock: targetWarehouse.currentStock },
          { 
            transfers: transferDetails,
            sourceWarehouseId: id,
            targetWarehouseId 
          },
          req
        );
      } catch (auditError) {
        // Audit log error is non-critical
      }
    }

    res.json({ 
      message: 'Stock transferred successfully',
      transfers: transferDetails,
      sourceWarehouse: {
        id: sourceWarehouse._id,
        name: sourceWarehouse.name,
        totalStock: sourceWarehouse.getTotalStock()
      },
      targetWarehouse: {
        id: targetWarehouse._id,
        name: targetWarehouse.name,
        totalStock: targetWarehouse.getTotalStock()
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  addStock,
  transferStock
};