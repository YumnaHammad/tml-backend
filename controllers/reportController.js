const { 
  Product, 
  Warehouse, 
  Purchase, 
  SalesOrder, 
  Return, 
  SalesShipment, 
  StockMovement,
  Supplier,
  Customer 
} = require('../models');

// Get dashboard summary metrics
const getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Total Products - Show ALL
    const totalProducts = await Product.countDocuments({});

    // Total Items in Stock (across ALL warehouses)
    const warehouses = await Warehouse.find({});
    let totalItemsInStock = 0;
    for (const warehouse of warehouses) {
      totalItemsInStock += warehouse.currentStock.reduce((sum, item) => sum + item.quantity, 0);
    }

    // Total Warehouses - Show ALL
    const totalWarehouses = await Warehouse.countDocuments({});

    // Total Dispatched Products (today/week/month)
    const dispatchedToday = await SalesShipment.countDocuments({
      dispatchDate: { $gte: startOfDay },
      status: { $in: ['dispatched', 'in_transit', 'delivered'] }
    });

    const dispatchedThisWeek = await SalesShipment.countDocuments({
      dispatchDate: { $gte: startOfWeek },
      status: { $in: ['dispatched', 'in_transit', 'delivered'] }
    });

    const dispatchedThisMonth = await SalesShipment.countDocuments({
      dispatchDate: { $gte: startOfMonth },
      status: { $in: ['dispatched', 'in_transit', 'delivered'] }
    });

    // Returns (this week/this month)
    const returnsThisWeek = await Return.countDocuments({
      returnDate: { $gte: startOfWeek }
    });

    const returnsThisMonth = await Return.countDocuments({
      returnDate: { $gte: startOfMonth }
    });

    // Successfully Delivered (this week/this month)
    const deliveredThisWeek = await SalesShipment.countDocuments({
      status: 'delivered',
      actualDeliveryDate: { $gte: startOfWeek }
    });
    
    const deliveredThisMonth = await SalesShipment.countDocuments({
      status: 'delivered',
      actualDeliveryDate: { $gte: startOfMonth }
    });

    res.json({
      totalProducts,
      totalItemsInStock,
      totalWarehouses,
      dispatchedProducts: {
        today: dispatchedToday,
        thisWeek: dispatchedThisWeek,
        thisMonth: dispatchedThisMonth
      },
      returns: {
        thisWeek: returnsThisWeek,
        thisMonth: returnsThisMonth
      },
      deliveredProducts: {
        thisWeek: deliveredThisWeek,
        thisMonth: deliveredThisMonth
      }
    });

  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get main dashboard report (6-column layout)
const getMainDashboardReport = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    // Get ALL products
    const products = await Product.find({})
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const report = [];

    for (const product of products) {
      // Get current stock across ALL warehouses
      const warehouses = await Warehouse.find({});
      let currentStock = 0;
      const warehouseStock = [];

      for (const warehouse of warehouses) {
        const stockItem = warehouse.currentStock.find(item => 
          item.productId.toString() === product._id.toString()
        );
        const stock = stockItem ? stockItem.quantity : 0;
        currentStock += stock;
        warehouseStock.push({
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          stock
        });
      }

      // Calculate weekly sales (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weeklySales = await StockMovement.aggregate([
        {
          $match: {
            productId: product._id,
            movementType: 'out',
            movementDate: { $gte: weekAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalSold: { $sum: '$quantity' }
          }
        }
      ]);

      // Calculate monthly sales (last 30 days)
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const monthlySales = await StockMovement.aggregate([
        {
          $match: {
            productId: product._id,
            movementType: 'out',
            movementDate: { $gte: monthAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalSold: { $sum: '$quantity' }
          }
        }
      ]);

      // Calculate stock alert
      const weeklySold = weeklySales[0]?.totalSold || 0;
      const monthlySold = monthlySales[0]?.totalSold || 0;
      const dailyAverage = weeklySold / 7;
      const daysOfInventory = dailyAverage > 0 ? Math.floor(currentStock / dailyAverage) : 999;

      let stockAlert = 'good';
      if (daysOfInventory <= 7) {
        stockAlert = 'critical';
      } else if (daysOfInventory <= 30) {
        stockAlert = 'warning';
      } else if (currentStock === 0) {
        stockAlert = 'out_of_stock';
      }

      report.push({
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        currentStock,
        weeklySales: weeklySold,
        monthlySales: monthlySold,
        stockAlert,
        daysOfInventory,
        warehouseStock,
        unit: product.unit
      });
    }

    // Sort by stock alert priority
    const alertPriority = { critical: 0, out_of_stock: 1, warning: 2, good: 3 };
    report.sort((a, b) => {
      if (alertPriority[a.stockAlert] !== alertPriority[b.stockAlert]) {
        return alertPriority[a.stockAlert] - alertPriority[b.stockAlert];
      }
      return a.daysOfInventory - b.daysOfInventory;
    });

    const total = await Product.countDocuments({});

    res.json({
      report,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      summary: {
        criticalAlerts: report.filter(r => r.stockAlert === 'critical').length,
        outOfStock: report.filter(r => r.stockAlert === 'out_of_stock').length,
        warningAlerts: report.filter(r => r.stockAlert === 'warning').length,
        goodStock: report.filter(r => r.stockAlert === 'good').length
      }
    });

  } catch (error) {
    console.error('Get main dashboard report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get daily stock report
const getDailyStockReport = async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? new Date(date) : new Date();

    const warehouses = await Warehouse.find({});
    const report = [];

    for (const warehouse of warehouses) {
      const warehouseReport = {
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        warehouseLocation: warehouse.location,
        capacity: warehouse.capacity,
        products: []
      };

      for (const stockItem of warehouse.currentStock) {
        const product = await Product.findById(stockItem.productId);
        if (product) {
          // Get stock movements for this product today
          const startOfDay = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate());
          const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

          const movements = await StockMovement.find({
            productId: stockItem.productId,
            warehouseId: warehouse._id,
            movementDate: { $gte: startOfDay, $lt: endOfDay }
          }).sort({ movementDate: -1 });

          const movementsIn = movements.filter(m => m.movementType === 'in').reduce((sum, m) => sum + m.quantity, 0);
          const movementsOut = movements.filter(m => m.movementType === 'out').reduce((sum, m) => sum + m.quantity, 0);

          warehouseReport.products.push({
            productId: stockItem.productId,
            productName: product.name,
            productSku: product.sku,
            openingStock: stockItem.quantity + movementsOut - movementsIn,
            stockIn: movementsIn,
            stockOut: movementsOut,
            closingStock: stockItem.quantity,
            tags: stockItem.tags || []
          });
        }
      }

      const totalStock = warehouse.currentStock.reduce((sum, item) => sum + item.quantity, 0);
      warehouseReport.totalStock = totalStock;
      warehouseReport.utilization = Math.round((totalStock / warehouse.capacity) * 100);

      report.push(warehouseReport);
    }

    res.json({
      date: reportDate,
      report
    });

  } catch (error) {
    console.error('Get daily stock report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get weekly sales report - Enhanced with detailed product and variant information
const getWeeklySalesReport = async (req, res) => {
  try {
    const { weekOffset = 0 } = req.query; // 0 = current week, -1 = last week, etc.
    
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (weekOffset * 7));
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    console.log('Weekly Sales Report - Period:', { startOfWeek, endOfWeek });

    // Get all sales orders for the week (not just dispatched/delivered)
    const salesOrders = await SalesOrder.find({
      orderDate: { $gte: startOfWeek, $lte: endOfWeek }
    })
    .populate('items.productId', 'name sku category sellingPrice unit')
    .populate('customerId', 'name email phone')
    .sort({ orderDate: -1 });

    console.log('Found sales orders:', salesOrders.length);

    // Calculate summary
    const totalRevenue = salesOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalOrders = salesOrders.length;
    const totalItems = salesOrders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );

    // Get detailed product sales with variants
    const productSales = {};
    
    salesOrders.forEach(order => {
      order.items.forEach(item => {
        if (!item.productId) return; // Skip items without product reference
        
        const productId = item.productId._id.toString();
        const variantKey = item.variantName ? `${productId}-${item.variantName}` : productId;
        
        if (!productSales[variantKey]) {
          productSales[variantKey] = {
            productId: item.productId._id,
            productName: item.productId.name,
            productSku: item.productId.sku,
            category: item.productId.category || 'Uncategorized',
            unit: item.productId.unit || 'pcs',
            variantName: item.variantName || 'No Variant',
            sellingPrice: item.productId.sellingPrice || 0,
            totalQuantity: 0,
            totalRevenue: 0,
            averagePrice: 0,
            orderCount: 0,
            orders: [] // Store individual orders for details
          };
        }
        
        productSales[variantKey].totalQuantity += item.quantity || 0;
        productSales[variantKey].totalRevenue += item.totalPrice || 0;
        productSales[variantKey].orderCount += 1;
        productSales[variantKey].orders.push({
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          customerName: order.customerId?.name || 'Unknown',
          customerPhone: order.customerId?.phone || 'N/A',
          status: order.status,
          paymentStatus: order.paymentStatus
        });
      });
    });

    // Calculate average prices and sort
    Object.values(productSales).forEach(product => {
      product.averagePrice = product.totalQuantity > 0 ? product.totalRevenue / product.totalQuantity : 0;
    });

    // Sort by total quantity sold (most selling products first)
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 50); // Show top 50 products

    // Calculate category breakdown
    const categoryStats = {};
    Object.values(productSales).forEach(product => {
      if (!categoryStats[product.category]) {
        categoryStats[product.category] = {
          category: product.category,
          totalQuantity: 0,
          totalRevenue: 0,
          productCount: 0,
          variants: 0
        };
      }
      categoryStats[product.category].totalQuantity += product.totalQuantity;
      categoryStats[product.category].totalRevenue += product.totalRevenue;
      categoryStats[product.category].productCount += 1;
      categoryStats[product.category].variants += product.variantName !== 'No Variant' ? 1 : 0;
    });

    // Calculate daily sales breakdown
    const dailySales = {};
    salesOrders.forEach(order => {
      const day = new Date(order.orderDate).toISOString().split('T')[0];
      if (!dailySales[day]) {
        dailySales[day] = {
          date: day,
          orders: 0,
          revenue: 0,
          items: 0
        };
      }
      dailySales[day].orders += 1;
      dailySales[day].revenue += order.totalAmount || 0;
      dailySales[day].items += order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    });

    const response = {
      period: {
        start: startOfWeek,
        end: endOfWeek,
        weekOffset,
        weekName: `Week ${weekOffset === 0 ? 'Current' : weekOffset > 0 ? `+${weekOffset}` : weekOffset}`
      },
      summary: {
        totalRevenue,
        totalOrders,
        totalItems,
        uniqueProducts: Object.keys(productSales).length,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
      },
      topProducts,
      categoryBreakdown: Object.values(categoryStats).sort((a, b) => b.totalRevenue - a.totalRevenue),
      dailyBreakdown: Object.values(dailySales).sort((a, b) => new Date(a.date) - new Date(b.date))
    };

    console.log('Weekly Sales Report - Response:', {
      totalProducts: topProducts.length,
      totalRevenue,
      totalOrders
    });

    res.json(response);

  } catch (error) {
    console.error('Get weekly sales report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get monthly sales report - Enhanced with detailed product and variant information
const getMonthlySalesReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    const reportMonth = month ? parseInt(month) - 1 : new Date().getMonth(); // 0-based month
    const reportYear = year ? parseInt(year) : new Date().getFullYear();

    const startOfMonth = new Date(reportYear, reportMonth, 1);
    const endOfMonth = new Date(reportYear, reportMonth + 1, 0, 23, 59, 59, 999);

    console.log('Monthly Sales Report - Period:', { startOfMonth, endOfMonth });

    // Get all sales orders for the month
    const salesOrders = await SalesOrder.find({
      orderDate: { $gte: startOfMonth, $lte: endOfMonth }
    })
    .populate('items.productId', 'name sku category sellingPrice unit')
    .populate('customerId', 'name email phone')
    .sort({ orderDate: -1 });

    console.log('Found sales orders:', salesOrders.length);

    // Calculate summary
    const totalRevenue = salesOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalOrders = salesOrders.length;
    const totalItems = salesOrders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );

    // Get detailed product sales with variants
    const productSales = {};
    
    salesOrders.forEach(order => {
      order.items.forEach(item => {
        if (!item.productId) return; // Skip items without product reference
        
        const productId = item.productId._id.toString();
        const variantKey = item.variantName ? `${productId}-${item.variantName}` : productId;
        
        if (!productSales[variantKey]) {
          productSales[variantKey] = {
            productId: item.productId._id,
            productName: item.productId.name,
            productSku: item.productId.sku,
            category: item.productId.category || 'Uncategorized',
            unit: item.productId.unit || 'pcs',
            variantName: item.variantName || 'No Variant',
            sellingPrice: item.productId.sellingPrice || 0,
            totalQuantity: 0,
            totalRevenue: 0,
            averagePrice: 0,
            orderCount: 0,
            orders: [] // Store individual orders for details
          };
        }
        
        productSales[variantKey].totalQuantity += item.quantity || 0;
        productSales[variantKey].totalRevenue += item.totalPrice || 0;
        productSales[variantKey].orderCount += 1;
        productSales[variantKey].orders.push({
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          customerName: order.customerId?.name || 'Unknown',
          customerPhone: order.customerId?.phone || 'N/A',
          status: order.status,
          paymentStatus: order.paymentStatus
        });
      });
    });

    // Calculate average prices and sort
    Object.values(productSales).forEach(product => {
      product.averagePrice = product.totalQuantity > 0 ? product.totalRevenue / product.totalQuantity : 0;
    });

    // Sort by total quantity sold (most selling products first)
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 100); // Show top 100 products for monthly

    // Calculate category breakdown
    const categoryStats = {};
    Object.values(productSales).forEach(product => {
      if (!categoryStats[product.category]) {
        categoryStats[product.category] = {
          category: product.category,
          totalQuantity: 0,
          totalRevenue: 0,
          productCount: 0,
          variants: 0
        };
      }
      categoryStats[product.category].totalQuantity += product.totalQuantity;
      categoryStats[product.category].totalRevenue += product.totalRevenue;
      categoryStats[product.category].productCount += 1;
      categoryStats[product.category].variants += product.variantName !== 'No Variant' ? 1 : 0;
    });

    // Calculate weekly breakdown within the month
    const weeklySales = {};
    salesOrders.forEach(order => {
      const orderDate = new Date(order.orderDate);
      const weekStart = new Date(orderDate);
      weekStart.setDate(orderDate.getDate() - orderDate.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklySales[weekKey]) {
        weeklySales[weekKey] = {
          weekStart: weekKey,
          orders: 0,
          revenue: 0,
          items: 0
        };
      }
      weeklySales[weekKey].orders += 1;
      weeklySales[weekKey].revenue += order.totalAmount || 0;
      weeklySales[weekKey].items += order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    });

    const response = {
      period: {
        month: reportMonth + 1,
        year: reportYear,
        start: startOfMonth,
        end: endOfMonth,
        monthName: new Date(reportYear, reportMonth).toLocaleString('default', { month: 'long' })
      },
      summary: {
        totalRevenue,
        totalOrders,
        totalItems,
        uniqueProducts: Object.keys(productSales).length,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
      },
      topProducts,
      categoryBreakdown: Object.values(categoryStats).sort((a, b) => b.totalRevenue - a.totalRevenue),
      weeklyBreakdown: Object.values(weeklySales).sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart))
    };

    console.log('Monthly Sales Report - Response:', {
      totalProducts: topProducts.length,
      totalRevenue,
      totalOrders
    });

    res.json(response);

  } catch (error) {
    console.error('Get monthly sales report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get monthly inventory report
const getMonthlyInventoryReport = async (req, res) => {
  try {
    console.log('Monthly inventory report requested');
    const { month, year } = req.query;
    const reportMonth = month ? parseInt(month) - 1 : new Date().getMonth(); // 0-based month
    const reportYear = year ? parseInt(year) : new Date().getFullYear();

    const startOfMonth = new Date(reportYear, reportMonth, 1);
    const endOfMonth = new Date(reportYear, reportMonth + 1, 0, 23, 59, 59, 999);

    console.log('Date range:', { startOfMonth, endOfMonth });

    // Get opening stock (stock at beginning of month)
    console.log('Getting opening stock...');
    const openingStock = await getStockSnapshot(startOfMonth);
    console.log('Opening stock:', openingStock);
    
    // Get closing stock (current stock)
    console.log('Getting closing stock...');
    const closingStock = await getStockSnapshot(endOfMonth);
    console.log('Closing stock:', closingStock);

    // Get stock movements for the month
    console.log('Getting stock movements...');
    const movements = await StockMovement.find({
      movementDate: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('productId', 'name sku unit sellingPrice') // costPrice removed
      .populate('warehouseId', 'name location');
    
    console.log('Found movements:', movements.length);

    // Aggregate movements by product
    const productMovements = {};
    
    if (movements && movements.length > 0) {
      movements.forEach(movement => {
        if (!movement.productId || !movement.warehouseId) {
          console.log('Skipping movement with missing references:', movement);
          return;
        }
        
        const productId = movement.productId._id.toString();
        if (!productMovements[productId]) {
          productMovements[productId] = {
            productId: movement.productId._id,
            productName: movement.productId.name,
            productSku: movement.productId.sku,
            unit: movement.productId.unit,
            // costPrice: movement.productId.costPrice, // Commented out
            sellingPrice: movement.productId.sellingPrice,
            openingStock: 0,
            stockIn: 0,
            stockOut: 0,
            closingStock: 0,
            movements: []
          };
        }

        if (movement.movementType === 'in' || movement.movementType === 'transfer_in') {
          productMovements[productId].stockIn += movement.quantity;
        } else if (movement.movementType === 'out' || movement.movementType === 'transfer_out') {
          productMovements[productId].stockOut += movement.quantity;
        }

        productMovements[productId].movements.push({
          date: movement.movementDate,
          type: movement.movementType,
          quantity: movement.quantity,
          warehouse: movement.warehouseId.name,
          reference: movement.referenceType,
          notes: movement.notes
        });
      });
    }

    // Calculate opening and closing stock for each product
    for (const productId in productMovements) {
      const opening = openingStock[productId] || 0;
      const closing = closingStock[productId] || 0;
      
      productMovements[productId].openingStock = opening;
      productMovements[productId].closingStock = closing;
      
      // Sort movements by date
      productMovements[productId].movements.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    const report = Object.values(productMovements).sort((a, b) => a.productName.localeCompare(b.productName));

    console.log('Report generated with', report.length, 'products');

    // Calculate totals
    const totalOpeningValue = report.reduce((sum, item) => sum + (item.openingStock * (item.sellingPrice || 0)), 0);
    const totalClosingValue = report.reduce((sum, item) => sum + (item.closingStock * (item.sellingPrice || 0)), 0);
    const totalStockIn = report.reduce((sum, item) => sum + item.stockIn, 0);
    const totalStockOut = report.reduce((sum, item) => sum + item.stockOut, 0);

    const response = {
      period: {
        month: reportMonth + 1,
        year: reportYear,
        start: startOfMonth,
        end: endOfMonth
      },
      summary: {
        totalProducts: report.length,
        totalOpeningValue,
        totalClosingValue,
        totalStockIn,
        totalStockOut,
        netChange: totalStockIn - totalStockOut
      },
      inventory: report
    };

    console.log('Sending response:', response);
    res.json(response);

  } catch (error) {
    console.error('Get monthly inventory report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function to get stock snapshot at a specific date
const getStockSnapshot = async (date) => {
  try {
    const warehouses = await Warehouse.find({});
    const stockSnapshot = {};

    for (const warehouse of warehouses) {
      for (const stockItem of warehouse.currentStock) {
        const productId = stockItem.productId.toString();
        
        // Get movements after this date to calculate what the stock was at that time
        const movementsAfter = await StockMovement.find({
          productId: stockItem.productId,
          warehouseId: warehouse._id,
          movementDate: { $gt: date }
        });

        let stockAtDate = stockItem.quantity;
        movementsAfter.forEach(movement => {
          if (movement.movementType === 'in' || movement.movementType === 'transfer_in') {
            stockAtDate -= movement.quantity;
          } else if (movement.movementType === 'out' || movement.movementType === 'transfer_out') {
            stockAtDate += movement.quantity;
          }
        });

        if (!stockSnapshot[productId]) {
          stockSnapshot[productId] = 0;
        }
        stockSnapshot[productId] += Math.max(0, stockAtDate);
      }
    }

    return stockSnapshot;
  } catch (error) {
    console.error('Error in getStockSnapshot:', error);
    return {};
  }
};

// Get supplier performance report
const getSupplierPerformanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.purchaseDate = {};
      if (startDate) dateFilter.purchaseDate.$gte = new Date(startDate);
      if (endDate) dateFilter.purchaseDate.$lte = new Date(endDate);
    }

    const suppliers = await Supplier.find({});
    const report = [];

    for (const supplier of suppliers) {
      const purchases = await Purchase.find({
        supplierId: supplier._id,
        ...dateFilter
      });

      const totalPurchases = purchases.length;
      const totalAmount = purchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
      const averageOrderValue = totalPurchases > 0 ? totalAmount / totalPurchases : 0;

      // Calculate delivery performance
      const orderedPurchases = purchases.filter(p => p.status === 'ordered');
      const receivedPurchases = purchases.filter(p => p.status === 'received');
      const onTimeDeliveries = receivedPurchases.filter(purchase => {
        if (!purchase.expectedDeliveryDate) return false;
        return purchase.receivedDate && purchase.receivedDate <= purchase.expectedDeliveryDate;
      });

      const deliveryPerformance = orderedPurchases.length > 0 ? 
        (receivedPurchases.length / orderedPurchases.length) * 100 : 0;
      
      const onTimePerformance = receivedPurchases.length > 0 ? 
        (onTimeDeliveries.length / receivedPurchases.length) * 100 : 0;

      report.push({
        supplierId: supplier._id,
        supplierName: supplier.name,
        supplierCode: supplier.supplierCode,
        totalPurchases,
        totalAmount,
        averageOrderValue,
        deliveryPerformance: Math.round(deliveryPerformance * 100) / 100,
        onTimePerformance: Math.round(onTimePerformance * 100) / 100,
        rating: calculateSupplierRating(deliveryPerformance, onTimePerformance)
      });
    }

    // Sort by total amount (highest first)
    report.sort((a, b) => b.totalAmount - a.totalAmount);

    res.json({
      period: {
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      },
      summary: {
        totalSuppliers: report.length,
        totalPurchases: report.reduce((sum, s) => sum + s.totalPurchases, 0),
        totalAmount: report.reduce((sum, s) => sum + s.totalAmount, 0)
      },
      suppliers: report
    });

  } catch (error) {
    console.error('Get supplier performance report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function to calculate supplier rating
const calculateSupplierRating = (deliveryPerformance, onTimePerformance) => {
  const avgPerformance = (deliveryPerformance + onTimePerformance) / 2;
  if (avgPerformance >= 95) return 'A';
  if (avgPerformance >= 85) return 'B';
  if (avgPerformance >= 70) return 'C';
  if (avgPerformance >= 50) return 'D';
  return 'F';
};

// Get return analysis report
const getReturnAnalysisReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.returnDate = {};
      if (startDate) dateFilter.returnDate.$gte = new Date(startDate);
      if (endDate) dateFilter.returnDate.$lte = new Date(endDate);
    }

    const returns = await Return.find({ ...dateFilter })
      .populate('salesOrderId', 'orderNumber customerInfo')
      .populate('items.productId', 'name sku')
      .populate('items.warehouseId', 'name location');

    // Analyze return reasons
    const returnReasons = {};
    const productReturns = {};
    const monthlyReturns = {};

    returns.forEach(returnOrder => {
      returnOrder.items.forEach(item => {
        // Count return reasons
        if (!returnReasons[item.returnReason]) {
          returnReasons[item.returnReason] = { count: 0, quantity: 0 };
        }
        returnReasons[item.returnReason].count += 1;
        returnReasons[item.returnReason].quantity += item.quantity;

        // Count product returns
        const productId = item.productId._id.toString();
        if (!productReturns[productId]) {
          productReturns[productId] = {
            productId: item.productId._id,
            productName: item.productId.name,
            productSku: item.productId.sku,
            returnCount: 0,
            returnQuantity: 0,
            conditions: {}
          };
        }
        productReturns[productId].returnCount += 1;
        productReturns[productId].returnQuantity += item.quantity;

        // Count conditions
        if (!productReturns[productId].conditions[item.condition]) {
          productReturns[productId].conditions[item.condition] = 0;
        }
        productReturns[productId].conditions[item.condition] += item.quantity;

        // Monthly analysis
        const month = returnOrder.returnDate.toISOString().substring(0, 7); // YYYY-MM
        if (!monthlyReturns[month]) {
          monthlyReturns[month] = { count: 0, quantity: 0 };
        }
        monthlyReturns[month].count += 1;
        monthlyReturns[month].quantity += item.quantity;
      });
    });

    // Calculate return rates
    const totalReturns = returns.length;
    const totalReturnQuantity = returns.reduce((sum, r) => 
      sum + r.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );

    // Get total sales for comparison (same period)
    const totalSales = await SalesOrder.countDocuments({
      orderDate: dateFilter.returnDate || {},
      status: 'delivered'
    });

    const returnRate = totalSales > 0 ? (totalReturns / totalSales) * 100 : 0;

    res.json({
      period: {
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      },
      summary: {
        totalReturns,
        totalReturnQuantity,
        totalSales,
        returnRate: Math.round(returnRate * 100) / 100
      },
      returnReasons: Object.entries(returnReasons).map(([reason, data]) => ({
        reason,
        count: data.count,
        quantity: data.quantity,
        percentage: totalReturns > 0 ? Math.round((data.count / totalReturns) * 100 * 100) / 100 : 0
      })),
      productReturns: Object.values(productReturns).sort((a, b) => b.returnQuantity - a.returnQuantity),
      monthlyTrend: Object.entries(monthlyReturns).map(([month, data]) => ({
        month,
        count: data.count,
        quantity: data.quantity
      })).sort((a, b) => a.month.localeCompare(b.month))
    });

  } catch (error) {
    console.error('Get return analysis report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getDashboardSummary,
  getMainDashboardReport,
  getDailyStockReport,
  getWeeklySalesReport,
  getMonthlySalesReport,
  getMonthlyInventoryReport,
  getSupplierPerformanceReport,
  getReturnAnalysisReport
};