const { SalesOrder, SalesOrderItem, Variant, Inventory, User, Dispatch, Invoice } = require('../models');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Create draft sales order
const createSalesOrder = async (req, res) => {
  const { customerName, items } = req.body;
  const userId = req.user.id;

  try {
    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    const salesOrder = await SalesOrder.create({
      customerName,
      totalAmount,
      createdBy: userId,
      status: 'draft'
    });

    // Create sales order items
    for (const item of items) {
      await SalesOrderItem.create({
        salesOrderId: salesOrder.id,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price
      });
    }

    res.status(201).json({
      message: 'Sales order created successfully',
      salesOrder
    });
  } catch (error) {
    console.error('Error creating sales order:', error);
    res.status(500).json({ error: 'Failed to create sales order' });
  }
};

// Get all sales orders
const getAllSalesOrders = async (req, res) => {
  try {
    const salesOrders = await SalesOrder.findAll({
     include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email']
        },
        {
          model: SalesOrderItem,
          as: 'items',
          include: [
            {
              model: Variant,
              as: 'variant',
              include: [
                {
                  model: require('../models').Product,
                  as: 'product',
                  attributes: ['id', 'name', 'sku', 'sellingPrice']
                }
              ]
            }
          ]
        }
      ],
      order: [['createdDateTime', 'DESC']]
    });

    res.json(salesOrders);
  } catch (error) {
    console.error('Error fetching sales orders:', error);
    res.status(500).json({ error: 'Failed to fetch sales orders' });
  }
};

// Update draft sales order
const updateSalesOrder = async (req, res) => {
  const { id } = req.params;
  const { customerName, items } = req.body;

  try {
    const salesOrder = await SalesOrder.findByPk(id);
    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    if (salesOrder.status !== 'draft') {
      return res.status(400).json({ error: 'Cannot edit submitted sales order' });
    }

    // Update sales order
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    await salesOrder.update({
      customerName,
      totalAmount
    });

    // Delete existing items and create new ones
    await SalesOrderItem.destroy({
      where: { salesOrderId: id }
    });

    for (const item of items) {
      await SalesOrderItem.create({
        salesOrderId: id,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price
      });
    }

    res.json({
      message: 'Sales order updated successfully',
      salesOrder
    });
  } catch (error) {
    console.error('Error updating sales order:', error);
    res.status(500).json({ error: 'Failed to update sales order' });
  }
};

// Submit sales order
const submitSalesOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const salesOrder = await SalesOrder.findByPk(id, {
      include: [
        {
          model: SalesOrderItem,
          as: 'items',
          include: [
            {
              model: Variant,
              as: 'variant',
              include: [
                {
                  model: Inventory,
                  as: 'inventory'
                }
              ]
            }
          ]
        }
      ]
    });

    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    if (salesOrder.status !== 'draft') {
      return res.status(400).json({ error: 'Sales order already submitted' });
    }

    // Check stock availability
    for (const item of salesOrder.items) {
      const currentStock = item.variant.inventory ? item.variant.inventory.quantity : 0;
      if (currentStock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${item.variant.sku}. Available: ${currentStock}, Required: ${item.quantity}`
        });
      }
    }

    // Update inventory for each item
    for (const item of salesOrder.items) {
      const inventory = await Inventory.findOne({
        where: { variantId: item.variantId }
      });

      if (inventory) {
        inventory.quantity -= item.quantity;
        await inventory.save();
      }
    }

    // Update sales order status
    await salesOrder.update({
      status: 'submitted',
      submittedAt: new Date()
    });

    // Create dispatch record
    const dispatch = await Dispatch.create({
      salesOrderId: salesOrder.id,
      status: 'pending'
    });

    // Generate PDF receipt
    const invoicePath = await generateSalesReceipt(salesOrder);
    
    // Create invoice record
    const invoice = await Invoice.create({
      orderId: salesOrder.id,
      orderType: 'sale',
      pdfPath: invoicePath,
      invoiceNumber: `SO-${salesOrder.id}-${Date.now()}`
    });

    res.json({
      message: 'Sales order submitted successfully',
      salesOrder,
      dispatch,
      invoice
    });
  } catch (error) {
    console.error('Error submitting sales order:', error);
    res.status(500).json({ error: 'Failed to submit sales order' });
  }
};

// Generate PDF receipt for sales order
const generateSalesReceipt = async (salesOrder) => {
  const doc = new PDFDocument();
  const invoicePath = path.join(__dirname, '../invoices', `sales-${salesOrder.id}.pdf`);
  
  // Ensure invoices directory exists
  const invoicesDir = path.dirname(invoicePath);
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  doc.pipe(fs.createWriteStream(invoicePath));

  // Receipt header
  doc.fontSize(20).text('SALES RECEIPT', 50, 50);
  doc.fontSize(12).text(`Receipt #: SO-${salesOrder.id}`, 50, 80);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 100);
  doc.text(`Customer: ${salesOrder.customerName}`, 50, 120);

  // Items table
  let y = 160;
  doc.fontSize(10);
  doc.text('Item', 50, y);
  doc.text('Quantity', 250, y);
  doc.text('Price', 350, y);
  doc.text('Total', 450, y);
  
  y += 20;
  doc.moveTo(50, y).lineTo(550, y).stroke();

  // Add items
  for (const item of salesOrder.items) {
    y += 20;
    doc.text(item.variant.sku, 50, y);
    doc.text(item.quantity.toString(), 250, y);
    doc.text(`$${item.price.toFixed(2)}`, 350, y);
    doc.text(`$${(item.quantity * item.price).toFixed(2)}`, 450, y);
  }

  // Total
  y += 30;
  doc.moveTo(50, y).lineTo(550, y).stroke();
  doc.fontSize(14).text(`Total: $${salesOrder.totalAmount.toFixed(2)}`, 350, y + 10);

  doc.end();

  return invoicePath;
};

module.exports = {
  createSalesOrder,
  getAllSalesOrders,
  updateSalesOrder,
  submitSalesOrder
};
