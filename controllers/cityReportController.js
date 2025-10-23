const { SalesOrder, Product } = require('../models');

// Get city-wise sales report
const getCitySalesReport = async (req, res) => {
  try {
    const { startDate, endDate, city } = req.query;
    
    // Build filter criteria
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (city) {
      filter['customerInfo.address.city'] = new RegExp(city, 'i');
    }

    // Get sales orders with city information
    const salesOrders = await SalesOrder.find(filter)
      .populate('items.productId', 'name sku')
      .sort({ createdAt: -1 });

    // Process data for city-wise analysis
    const cityStats = {};
    const productStats = {};
    const cityProductStats = {};

    salesOrders.forEach(order => {
      const orderCity = order.customerInfo?.address?.city || 'Unknown';
      
      // Initialize city stats
      if (!cityStats[orderCity]) {
        cityStats[orderCity] = {
          totalOrders: 0,
          totalRevenue: 0,
          totalQuantity: 0,
          orders: []
        };
      }

      // Update city stats
      cityStats[orderCity].totalOrders += 1;
      cityStats[orderCity].totalRevenue += order.totalAmount || 0;
      cityStats[orderCity].orders.push({
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        status: order.status
      });

      // Process items for product analysis
      order.items.forEach(item => {
        const productName = item.productId?.name || 'Unknown Product';
        const quantity = item.quantity || 0;
        
        // Initialize city-product stats
        const cityProductKey = `${orderCity}-${productName}`;
        if (!cityProductStats[cityProductKey]) {
          cityProductStats[cityProductKey] = {
            city: orderCity,
            product: productName,
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0
          };
        }
        
        cityProductStats[cityProductKey].totalQuantity += quantity;
        cityProductStats[cityProductKey].totalRevenue += (item.unitPrice || 0) * quantity;
        cityProductStats[cityProductKey].orderCount += 1;
        
        // Update overall product stats
        if (!productStats[productName]) {
          productStats[productName] = {
            totalQuantity: 0,
            totalRevenue: 0,
            cities: new Set(),
            orderCount: 0
          };
        }
        
        productStats[productName].totalQuantity += quantity;
        productStats[productName].totalRevenue += (item.unitPrice || 0) * quantity;
        productStats[productName].cities.add(orderCity);
        productStats[productName].orderCount += 1;
      });

      // Update city total quantity
      cityStats[orderCity].totalQuantity += order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    });

    // Convert sets to arrays for JSON response
    Object.keys(productStats).forEach(product => {
      productStats[product].cities = Array.from(productStats[product].cities);
    });

    // Convert cityProductStats to array and sort by quantity
    const cityProductArray = Object.values(cityProductStats)
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    // Convert cityStats to array and sort by revenue
    const cityArray = Object.entries(cityStats)
      .map(([city, stats]) => ({ city, ...stats }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Convert productStats to array and sort by quantity
    const productArray = Object.entries(productStats)
      .map(([product, stats]) => ({ product, ...stats }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    res.json({
      success: true,
      data: {
        cityStats: cityArray,
        productStats: productArray,
        cityProductStats: cityProductArray,
        summary: {
          totalOrders: salesOrders.length,
          totalRevenue: salesOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
          totalCities: cityArray.length,
          totalProducts: productArray.length
        }
      }
    });

  } catch (error) {
    console.error('Error getting city sales report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get city sales report',
      details: error.message
    });
  }
};

// Get popular products by city
const getPopularProductsByCity = async (req, res) => {
  try {
    const { city } = req.params;
    const { startDate, endDate } = req.query;
    
    const filter = {
      'customerInfo.address.city': new RegExp(city, 'i')
    };
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const salesOrders = await SalesOrder.find(filter)
      .populate('items.productId', 'name sku')
      .sort({ createdAt: -1 });

    const productStats = {};
    
    salesOrders.forEach(order => {
      order.items.forEach(item => {
        const productName = item.productId?.name || 'Unknown Product';
        
        if (!productStats[productName]) {
          productStats[productName] = {
            product: productName,
            sku: item.productId?.sku || 'N/A',
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0,
            averageOrderValue: 0
          };
        }
        
        const itemRevenue = (item.unitPrice || 0) * (item.quantity || 0);
        productStats[productName].totalQuantity += item.quantity || 0;
        productStats[productName].totalRevenue += itemRevenue;
        productStats[productName].orderCount += 1;
      });
    });

    // Calculate average order value
    Object.values(productStats).forEach(stats => {
      stats.averageOrderValue = stats.orderCount > 0 ? stats.totalRevenue / stats.orderCount : 0;
    });

    const productArray = Object.values(productStats)
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    res.json({
      success: true,
      data: {
        city: city,
        products: productArray,
        summary: {
          totalOrders: salesOrders.length,
          totalProducts: productArray.length,
          totalRevenue: productArray.reduce((sum, product) => sum + product.totalRevenue, 0)
        }
      }
    });

  } catch (error) {
    console.error('Error getting popular products by city:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get popular products by city',
      details: error.message
    });
  }
};

// Get cities list
const getCitiesList = async (req, res) => {
  try {
    const cities = await SalesOrder.distinct('customerInfo.address.city', {
      'customerInfo.address.city': { $exists: true, $ne: null, $ne: '' }
    });

    // Get order count for each city
    const cityStats = await SalesOrder.aggregate([
      {
        $match: {
          'customerInfo.address.city': { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$customerInfo.address.city',
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { orderCount: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        cities: cities.sort(),
        cityStats: cityStats
      }
    });

  } catch (error) {
    console.error('Error getting cities list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cities list',
      details: error.message
    });
  }
};

// Get product deliveries by city
const getProductDeliveries = async (req, res) => {
  try {
    const { productId, startDate, endDate } = req.query;
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required'
      });
    }

    // Build filter criteria
    const filter = {
      'items.productId': productId,
      status: { $in: ['delivered', 'dispatched'] } // Only delivered/dispatched orders
    };
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Get sales orders with the specific product
    const salesOrders = await SalesOrder.find(filter)
      .populate('items.productId', 'name sku')
      .sort({ createdAt: -1 });

    // Get product name
    const product = await Product.findById(productId);
    const productName = product?.name || 'Unknown Product';

    // Process data for city-wise analysis
    const cityStats = {};
    let totalQuantity = 0;
    let totalRevenue = 0;

    salesOrders.forEach(order => {
      const orderCity = order.customerInfo?.address?.city || 'Unknown';
      
      // Find the specific product in this order
      const productItem = order.items.find(item => 
        item.productId._id.toString() === productId
      );

      if (productItem) {
        const quantity = productItem.quantity || 0;
        const revenue = (productItem.unitPrice || 0) * quantity;

        // Initialize city stats
        if (!cityStats[orderCity]) {
          cityStats[orderCity] = {
            city: orderCity,
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0,
            lastDelivery: null
          };
        }

        // Update city stats
        cityStats[orderCity].totalQuantity += quantity;
        cityStats[orderCity].totalRevenue += revenue;
        cityStats[orderCity].orderCount += 1;
        
        // Update last delivery date
        if (!cityStats[orderCity].lastDelivery || order.createdAt > cityStats[orderCity].lastDelivery) {
          cityStats[orderCity].lastDelivery = order.createdAt;
        }

        // Update totals
        totalQuantity += quantity;
        totalRevenue += revenue;
      }
    });

    // Convert cityStats to array and sort by quantity
    const cityArray = Object.values(cityStats)
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    res.json({
      success: true,
      data: {
        productId: productId,
        productName: productName,
        cityStats: cityArray,
        totalQuantity: totalQuantity,
        totalRevenue: totalRevenue,
        totalOrders: salesOrders.length
      }
    });

  } catch (error) {
    console.error('Error getting product deliveries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get product deliveries',
      details: error.message
    });
  }
};

module.exports = {
  getCitySalesReport,
  getPopularProductsByCity,
  getCitiesList,
  getProductDeliveries
};
