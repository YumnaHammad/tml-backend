const { Receipt, Product, Warehouse, User, Stock, StockHistory } = require('../models');
const { Op } = require('sequelize');

const getAllReceipts = async (req, res) => {
  try {
    const { productId, warehouseId, startDate, endDate } = req.query;
    
    const whereClause = {};
    if (productId) whereClause.productId = productId;
    if (warehouseId) whereClause.warehouseId = warehouseId;
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const receipts = await Receipt.findAll({
      where: whereClause,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku', 'unit']
        },
        {
          model: Warehouse,
          as: 'warehouse',
          attributes: ['id', 'name', 'location']
        },
        {
          model: User,
          as: 'receivedByUser',
          attributes: ['id', 'firstName', 'lastName', 'username']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(receipts);
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const receipt = await Receipt.findByPk(id, {
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku', 'unit']
        },
        {
          model: Warehouse,
          as: 'warehouse',
          attributes: ['id', 'name', 'location']
        },
        {
          model: User,
          as: 'receivedByUser',
          attributes: ['id', 'firstName', 'lastName', 'username']
        }
      ]
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json(receipt);
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createReceipt = async (req, res) => {
  try {
    const { 
      productId, 
      warehouseId, 
      quantity, 
      unitCost, 
      supplier, 
      reference, 
      notes 
    } = req.body;

    if (!productId || !warehouseId || !quantity) {
      return res.status(400).json({ 
        error: 'Product ID, warehouse ID, and quantity are required' 
      });
    }

    // Verify product and warehouse exist
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(400).json({ error: 'Product not found' });
    }

    const warehouse = await Warehouse.findByPk(warehouseId);
    if (!warehouse) {
      return res.status(400).json({ error: 'Warehouse not found' });
    }

    const totalCost = unitCost ? unitCost * quantity : null;

    const receipt = await Receipt.create({
      productId,
      warehouseId,
      quantity,
      unitCost,
      totalCost,
      supplier,
      reference,
      notes,
      receivedBy: req.user.id
    });

    // Update stock
    let stock = await Stock.findOne({
      where: { productId, warehouseId }
    });

    if (!stock) {
      stock = await Stock.create({
        productId,
        warehouseId,
        actualStock: 0,
        reservedStock: 0,
        projectedStock: 0
      });
    }

    const previousStock = stock.actualStock;
    const newStock = previousStock + quantity;

    await stock.update({
      actualStock: newStock,
      projectedStock: newStock
    });

    // Create stock history record
    await StockHistory.create({
      productId,
      warehouseId,
      type: 'receipt',
      quantity,
      previousStock,
      newStock,
      reference: receipt.reference || `REC-${receipt.id}`,
      notes: `Receipt from ${supplier || 'Unknown'}`,
      userId: req.user.id
    });

    const createdReceipt = await Receipt.findByPk(receipt.id, {
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku', 'unit']
        },
        {
          model: Warehouse,
          as: 'warehouse',
          attributes: ['id', 'name', 'location']
        },
        {
          model: User,
          as: 'receivedByUser',
          attributes: ['id', 'firstName', 'lastName', 'username']
        }
      ]
    });

    res.status(201).json(createdReceipt);
  } catch (error) {
    console.error('Create receipt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllReceipts,
  getReceiptById,
  createReceipt
};
