const { PurchaseOrder, PurchaseOrderItem, Variant, Inventory, User, Invoice } = require('../models');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Create draft purchase order
const createPurchaseOrder = async (req, res) => {
  const { supplierName, items } = req.body;
  const userId = req.user.id;

  try {
    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    const purchaseOrder = await PurchaseOrder.create({
      supplierName,
      totalAmount,
      createdBy: userId,
      status: 'draft'
    });

    // Create purchase order items
    for (const item of items) {
      await PurchaseOrderItem.create({
        purchaseOrderId: purchaseOrder.id,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price
      });
    }

    res.status(201).json({
      message: 'Purchase order created successfully',
      purchaseOrder
    });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
};

// Get all purchase orders
const getAllPurchaseOrders = async (req, res) => {
  try {
    const purchaseOrders = await PurchaseOrder.findAll({
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email']
        },
        {
          model: PurchaseOrderItem,
          as: 'items',
          include: [
            {
              model: Variant,
              as: 'variant',
              include: [
                {
                  model: require('../models').Product,
                  as: 'product'
                }
              ]
            }
          ]
        }
      ],
      order: [['createdDateTime', 'DESC']]
    });

    res.json(purchaseOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
};

// Update draft purchase order
const updatePurchaseOrder = async (req, res) => {
  const { id } = req.params;
  const { supplierName, items } = req.body;

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(id);
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (purchaseOrder.status !== 'draft') {
      return res.status(400).json({ error: 'Cannot edit submitted purchase order' });
    }

    // Update purchase order
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    await purchaseOrder.update({
      supplierName,
      totalAmount
    });

    // Delete existing items and create new ones
    await PurchaseOrderItem.destroy({
      where: { purchaseOrderId: id }
    });

    for (const item of items) {
      await PurchaseOrderItem.create({
        purchaseOrderId: id,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price
      });
    }

    res.json({
      message: 'Purchase order updated successfully',
      purchaseOrder
    });
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
};

// Submit purchase order
const submitPurchaseOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(id, {
      include: [
        {
          model: PurchaseOrderItem,
          as: 'items',
          include: [
            {
              model: Variant,
              as: 'variant'
            }
          ]
        }
      ]
    });

    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (purchaseOrder.status !== 'draft') {
      return res.status(400).json({ error: 'Purchase order already submitted' });
    }

    // Update inventory for each item
    for (const item of purchaseOrder.items) {
      const inventory = await Inventory.findOne({
        where: { variantId: item.variantId }
      });

      if (inventory) {
        inventory.quantity += item.quantity;
        await inventory.save();
      } else {
        await Inventory.create({
          variantId: item.variantId,
          quantity: item.quantity
        });
      }
    }

    // Update purchase order status
    await purchaseOrder.update({
      status: 'submitted',
      submittedAt: new Date()
    });

    // Generate PDF invoice
    const invoicePath = await generatePurchaseInvoice(purchaseOrder);
    
    // Create invoice record
    const invoice = await Invoice.create({
      orderId: purchaseOrder.id,
      orderType: 'purchase',
      pdfPath: invoicePath,
      invoiceNumber: `PO-${purchaseOrder.id}-${Date.now()}`
    });

    res.json({
      message: 'Purchase order submitted successfully',
      purchaseOrder,
      invoice
    });
  } catch (error) {
    console.error('Error submitting purchase order:', error);
    res.status(500).json({ error: 'Failed to submit purchase order' });
  }
};

// Generate PDF invoice for purchase order
const generatePurchaseInvoice = async (purchaseOrder) => {
  const doc = new PDFDocument();
  const invoicePath = path.join(__dirname, '../invoices', `purchase-${purchaseOrder.id}.pdf`);
  
  // Ensure invoices directory exists
  const invoicesDir = path.dirname(invoicePath);
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  doc.pipe(fs.createWriteStream(invoicePath));

  // Invoice header
  doc.fontSize(20).text('PURCHASE INVOICE', 50, 50);
  doc.fontSize(12).text(`Invoice #: PO-${purchaseOrder.id}`, 50, 80);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 100);
  doc.text(`Supplier: ${purchaseOrder.supplierName}`, 50, 120);

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
  for (const item of purchaseOrder.items) {
    y += 20;
    doc.text(item.variant.sku, 50, y);
    doc.text(item.quantity.toString(), 250, y);
    doc.text(`$${item.price.toFixed(2)}`, 350, y);
    doc.text(`$${(item.quantity * item.price).toFixed(2)}`, 450, y);
  }

  // Total
  y += 30;
  doc.moveTo(50, y).lineTo(550, y).stroke();
  doc.fontSize(14).text(`Total: $${purchaseOrder.totalAmount.toFixed(2)}`, 350, y + 10);

  doc.end();

  return invoicePath;
};

module.exports = {
  createPurchaseOrder,
  getAllPurchaseOrders,
  updatePurchaseOrder,
  submitPurchaseOrder
};
