const { Invoice, Purchase, SalesOrder, Customer, Supplier, User } = require('../models');
const { createAuditLog } = require('../middleware/audit');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Generate Purchase Invoice
const generatePurchaseInvoice = async (req, res) => {
  try {
    const { purchaseId } = req.params;

    // Get purchase details with populated data
    const purchase = await Purchase.findById(purchaseId)
      .populate('supplierId')
      .populate('items.productId')
      .populate('createdBy', 'firstName lastName email');

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Generate invoice number
    const invoiceCount = await Invoice.countDocuments();
    const invoiceNumber = `INV-PUR-${String(invoiceCount + 1).padStart(6, '0')}`;

    // Create invoice document
    const invoice = new Invoice({
      invoiceNumber,
      type: 'purchase',
      purchaseId: purchase._id,
      supplierId: purchase.supplierId._id,
      customerInfo: {
        name: purchase.supplierId.name,
        company: purchase.supplierId.company,
        email: purchase.supplierId.email,
        phone: purchase.supplierId.phone,
        address: purchase.supplierId.address
      },
      items: purchase.items.map(item => ({
        productId: item.productId._id,
        productName: item.productId.name,
        sku: item.productId.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        description: item.productId.description
      })),
      subtotal: purchase.totalAmount,
      taxAmount: purchase.totalAmount * 0.15, // 15% tax
      totalAmount: purchase.totalAmount * 1.15,
      status: 'pending',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      notes: purchase.notes,
      createdBy: req.user._id
    });

    await invoice.save();

    // Generate PDF invoice
    const pdfPath = await generateInvoicePDF(invoice);

    // Update invoice with PDF path
    invoice.pdfPath = pdfPath;
    await invoice.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'invoice_created',
      'Invoice',
      invoice._id,
      null,
      { invoiceNumber, type: 'purchase', totalAmount: invoice.totalAmount },
      req
    );

    res.status(201).json({
      message: 'Purchase invoice generated successfully',
      invoice,
      pdfUrl: `/api/invoices/${invoice._id}/pdf`
    });

  } catch (error) {
    console.error('Generate purchase invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Generate Sales Invoice
const generateSalesInvoice = async (req, res) => {
  try {
    const { salesOrderId } = req.params;

    // Get sales order details with populated data
    const salesOrder = await SalesOrder.findById(salesOrderId)
      .populate('items.productId')
      .populate('createdBy', 'firstName lastName email');

    if (!salesOrder) {
      return res.status(404).json({ error: 'Sales order not found' });
    }

    // Generate invoice number
    const invoiceCount = await Invoice.countDocuments();
    const invoiceNumber = `INV-SAL-${String(invoiceCount + 1).padStart(6, '0')}`;

    // Create invoice document
    const invoice = new Invoice({
      invoiceNumber,
      type: 'sales',
      salesOrderId: salesOrder._id,
      customerInfo: salesOrder.customerInfo,
      items: salesOrder.items.map(item => ({
        productId: item.productId._id,
        productName: item.productId.name,
        sku: item.productId.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        description: item.productId.description
      })),
      subtotal: salesOrder.totalAmount,
      taxAmount: salesOrder.totalAmount * 0.15, // 15% tax
      totalAmount: salesOrder.totalAmount * 1.15,
      status: 'pending',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      notes: salesOrder.notes,
      createdBy: req.user._id
    });

    await invoice.save();

    // Generate PDF invoice
    const pdfPath = await generateInvoicePDF(invoice);

    // Update invoice with PDF path
    invoice.pdfPath = pdfPath;
    await invoice.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'invoice_created',
      'Invoice',
      invoice._id,
      null,
      { invoiceNumber, type: 'sales', totalAmount: invoice.totalAmount },
      req
    );

    res.status(201).json({
      message: 'Sales invoice generated successfully',
      invoice,
      pdfUrl: `/api/invoices/${invoice._id}/pdf`
    });

  } catch (error) {
    console.error('Generate sales invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Generate PDF Invoice
const generateInvoicePDF = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });
      
      // Create invoices directory if it doesn't exist
      const invoicesDir = path.join(__dirname, '../invoices');
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      const filename = `invoice-${invoice.invoiceNumber}.pdf`;
      const filepath = path.join(invoicesDir, filename);
      
      // Pipe PDF to file
      doc.pipe(fs.createWriteStream(filepath));

      // Company Header
      doc.fontSize(20).font('Helvetica-Bold').text('INVENTORY MANAGEMENT SYSTEM', 50, 50);
      doc.fontSize(12).font('Helvetica').text('Professional Inventory Solutions', 50, 75);
      doc.text('Email: info@inventorysystem.com', 50, 95);
      doc.text('Phone: +92-21-1234567', 50, 115);
      doc.text('Address: 123 Business Street, Karachi, Pakistan', 50, 135);

      // Invoice Details
      doc.fontSize(16).font('Helvetica-Bold').text('INVOICE', 450, 50);
      doc.fontSize(10).font('Helvetica');
      
      doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 450, 75);
      doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString()}`, 450, 95);
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 450, 115);
      doc.text(`Status: ${invoice.status.toUpperCase()}`, 450, 135);

      // Customer Information
      doc.fontSize(12).font('Helvetica-Bold').text('Bill To:', 50, 180);
      doc.fontSize(10).font('Helvetica');
      doc.text(invoice.customerInfo.name, 50, 200);
      if (invoice.customerInfo.company) {
        doc.text(invoice.customerInfo.company, 50, 220);
      }
      doc.text(invoice.customerInfo.email, 50, 240);
      if (invoice.customerInfo.phone) {
        doc.text(invoice.customerInfo.phone, 50, 260);
      }
      if (invoice.customerInfo.address) {
        if (typeof invoice.customerInfo.address === 'string') {
          doc.text(invoice.customerInfo.address, 50, 280);
        } else {
          const address = invoice.customerInfo.address;
          doc.text(`${address.street || ''}, ${address.city || ''}, ${address.state || ''}`, 50, 280);
          doc.text(`${address.zipCode || ''}, ${address.country || ''}`, 50, 300);
        }
      }

      // Items Table
      doc.fontSize(12).font('Helvetica-Bold').text('Items:', 50, 350);
      
      let yPosition = 380;
      
      // Table Headers
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Product', 50, yPosition);
      doc.text('SKU', 200, yPosition);
      doc.text('Qty', 280, yPosition);
      doc.text('Unit Price', 320, yPosition);
      doc.text('Total', 420, yPosition);
      
      // Draw line under headers
      doc.moveTo(50, yPosition + 15).lineTo(500, yPosition + 15).stroke();
      
      yPosition += 25;

      // Table Rows
      doc.fontSize(9).font('Helvetica');
      invoice.items.forEach(item => {
        doc.text(item.productName, 50, yPosition);
        doc.text(item.sku, 200, yPosition);
        doc.text(item.quantity.toString(), 280, yPosition);
        doc.text(`PKR ${item.unitPrice.toLocaleString()}`, 320, yPosition);
        doc.text(`PKR ${item.totalPrice.toLocaleString()}`, 420, yPosition);
        yPosition += 20;
      });

      // Totals
      yPosition += 20;
      doc.moveTo(50, yPosition).lineTo(500, yPosition).stroke();
      yPosition += 15;

      doc.fontSize(10).font('Helvetica');
      doc.text('Subtotal:', 350, yPosition);
      doc.text(`PKR ${invoice.subtotal.toLocaleString()}`, 420, yPosition);
      yPosition += 20;

      doc.text('Tax (15%):', 350, yPosition);
      doc.text(`PKR ${invoice.taxAmount.toLocaleString()}`, 420, yPosition);
      yPosition += 20;

      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Amount:', 350, yPosition);
      doc.text(`PKR ${invoice.totalAmount.toLocaleString()}`, 420, yPosition);

      // Footer
      yPosition += 50;
      doc.fontSize(8).font('Helvetica');
      doc.text('Thank you for your business!', 50, yPosition);
      doc.text('Terms: Payment due within 30 days of invoice date.', 50, yPosition + 15);

      doc.end();

      doc.on('end', () => {
        resolve(filepath);
      });

      doc.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
};

// Get All Invoices
const getAllInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status, search } = req.query;
    
    let query = {};
    
    if (type) query.type = type;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'customerInfo.name': { $regex: search, $options: 'i' } },
        { 'customerInfo.company': { $regex: search, $options: 'i' } }
      ];
    }

    const invoices = await Invoice.find(query)
      .populate('purchaseId', 'purchaseNumber')
      .populate('salesOrderId', 'orderNumber')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Invoice.countDocuments(query);

    res.json({
      invoices,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get all invoices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get Invoice by ID
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('purchaseId')
      .populate('salesOrderId')
      .populate('createdBy', 'firstName lastName email');

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });

  } catch (error) {
    console.error('Get invoice by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Download Invoice PDF
const downloadInvoicePDF = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!invoice.pdfPath || !fs.existsSync(invoice.pdfPath)) {
      // Regenerate PDF if not exists
      const pdfPath = await generateInvoicePDF(invoice);
      invoice.pdfPath = pdfPath;
      await invoice.save();
    }

    res.download(invoice.pdfPath, `invoice-${invoice.invoiceNumber}.pdf`);

  } catch (error) {
    console.error('Download invoice PDF error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update Invoice Status
const updateInvoiceStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const oldStatus = invoice.status;
    invoice.status = status;
    invoice.updatedBy = req.user._id;
    await invoice.save();

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'invoice_status_updated',
      'Invoice',
      invoice._id,
      { status: oldStatus },
      { status },
      req
    );

    res.json({
      message: 'Invoice status updated successfully',
      invoice
    });

  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete Invoice
const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Delete PDF file if exists
    if (invoice.pdfPath && fs.existsSync(invoice.pdfPath)) {
      fs.unlinkSync(invoice.pdfPath);
    }

    await Invoice.findByIdAndDelete(req.params.id);

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'invoice_deleted',
      'Invoice',
      invoice._id,
      { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount },
      null,
      req
    );

    res.json({ message: 'Invoice deleted successfully' });

  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get Invoice Statistics
const getInvoiceStatistics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      totalInvoices,
      pendingInvoices,
      paidInvoices,
      overdueInvoices,
      monthlyRevenue,
      yearlyRevenue,
      invoiceTypes
    ] = await Promise.all([
      Invoice.countDocuments(),
      Invoice.countDocuments({ status: 'pending' }),
      Invoice.countDocuments({ status: 'paid' }),
      Invoice.countDocuments({ status: 'overdue' }),
      Invoice.aggregate([
        { $match: { createdAt: { $gte: startOfMonth }, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Invoice.aggregate([
        { $match: { createdAt: { $gte: startOfYear }, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Invoice.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    res.json({
      statistics: {
        totalInvoices,
        pendingInvoices,
        paidInvoices,
        overdueInvoices,
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
        yearlyRevenue: yearlyRevenue[0]?.total || 0,
        invoiceTypes
      }
    });

  } catch (error) {
    console.error('Get invoice statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  generatePurchaseInvoice,
  generateSalesInvoice,
  getAllInvoices,
  getInvoiceById,
  downloadInvoicePDF,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoiceStatistics
};
