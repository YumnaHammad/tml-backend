const { Product, Warehouse, AuditLog } = require('../models');
const { createAuditLog } = require('../middleware/audit');
// Dynamic import for nanoid (ES module)
let nanoid;

// Initialize nanoid
const initNanoid = async () => {
  if (!nanoid) {
    const { nanoid: nanoidImport } = await import('nanoid');
    nanoid = nanoidImport;
  }
  return nanoid;
};

// Generate unique SKU based on product name with guaranteed uniqueness
const generateUniqueSKU = async (productName) => {
  if (!productName) {
    throw new Error('Product name is required to generate SKU');
  }
  
  // Clean product name: remove special characters, convert to uppercase, replace spaces
  const cleanName = productName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '') // Remove spaces
    .substring(0, 6); // Limit to 6 characters for better readability
  
  // Ensure we have at least some characters
  if (cleanName.length === 0) {
    throw new Error('Product name must contain at least one alphanumeric character');
  }
  
  // Generate unique SKU with multiple fallback strategies
  let sku;
  let attempts = 0;
  const maxAttempts = 50;
  
  while (attempts < maxAttempts) {
    // Strategy 1: Use product name + nanoid (most unique)
    const nanoidFunc = await initNanoid();
    const uniqueId = nanoidFunc(6).toUpperCase();
    sku = `${cleanName}${uniqueId}`;
    
    // Check if SKU already exists
    const existingProduct = await Product.findOne({ sku });
    
    if (!existingProduct) {
      return sku; // Found unique SKU!
    }
    
    attempts++;
    
    // If we've tried many times, add a counter
    if (attempts > 10) {
      const counter = (attempts - 10).toString().padStart(3, '0');
      sku = `${cleanName}${uniqueId}${counter}`;
      const existingProduct2 = await Product.findOne({ sku });
      if (!existingProduct2) {
        return sku;
      }
    }
  }
  
  // Last resort: completely random SKU
  const nanoidFunc = await initNanoid();
  const randomSuffix = nanoidFunc(8).toUpperCase();
  sku = `${cleanName}${randomSuffix}`;
  
  // Final check
  const existingProduct = await Product.findOne({ sku });
  if (existingProduct) {
    // If still exists, add timestamp
    const nanoidFunc = await initNanoid();
    const timestamp = Date.now().toString().slice(-6);
    sku = `${cleanName}${timestamp}${nanoidFunc(4).toUpperCase()}`;
  }
  
  return sku;
};

const getAllProducts = async (req, res) => {
  try {
    const { category, search, page = 1, limit, isActive } = req.query;
    
    // Show all products by default, allow filtering by isActive
    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (category) {
      query.category = new RegExp(category, 'i');
    }
    
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { sku: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    let queryBuilder = Product.find(query).sort({ createdAt: -1 });
    
    // Only apply limit and skip if limit is provided
    if (limit) {
      queryBuilder = queryBuilder.limit(limit * 1).skip((page - 1) * limit);
    }
    
    const products = await queryBuilder;

    const total = await Product.countDocuments(query);

    // Get stock information for each product
    const productsWithStock = await Promise.all(
      products.map(async (product) => {
        const warehouses = await Warehouse.find({ 'currentStock.productId': product._id });
        let totalStock = 0;
        
        warehouses.forEach(warehouse => {
          const stockItem = warehouse.currentStock.find(item => 
            item.productId.toString() === product._id.toString()
          );
          if (stockItem) {
            totalStock += stockItem.quantity;
          }
        });

        return {
          ...product.toObject(),
          totalStock,
          warehouses: warehouses.map(w => ({
            id: w._id,
            name: w.name,
            stock: w.currentStock.find(item => 
              item.productId.toString() === product._id.toString()
            )?.quantity || 0
          }))
        };
      })
    );

    res.json({
      products: productsWithStock,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get stock information
    const warehouses = await Warehouse.find({ 'currentStock.productId': id });
    let totalStock = 0;
    
    const warehouseStock = warehouses.map(warehouse => {
      const stockItem = warehouse.currentStock.find(item => 
        item.productId.toString() === id
      );
      const stock = stockItem ? stockItem.quantity : 0;
      totalStock += stock;
      
      return {
        id: warehouse._id,
        name: warehouse.name,
        location: warehouse.location,
        stock,
        capacity: warehouse.capacity,
        usage: (warehouse.getTotalStock() / warehouse.capacity) * 100
      };
    });

    // Get product timeline/audit logs
    const timeline = await AuditLog.find({
      $or: [
        { resourceType: 'Product', resourceId: id },
        { metadata: { $regex: id } }
      ]
    })
    .sort({ timestampISO: -1 })
    .limit(50)
    .populate('actorId', 'firstName lastName email');

    // Calculate stock alert status
    let stockStatus = 'OK';
    let alertMessage = '';
    
    if (totalStock === 0) {
      stockStatus = 'RED';
      alertMessage = 'Out of Stock';
    } else if (totalStock <= 5) {
      stockStatus = 'YELLOW';
      alertMessage = 'Low Stock';
    }

    res.json({
      ...product.toObject(),
      totalStock,
      warehouseStock,
      timeline,
      stockStatus,
      alertMessage
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createProduct = async (req, res) => {
  try {
    const productData = req.body;
    
    // Determine if product has variants
    const hasVariants = productData.hasVariants === true || 
                       productData.hasVariants === 'true' ||
                       (productData.variants && productData.variants.length > 0);
    
    // Remove empty variants array to avoid index issues
    if (productData.variants && Array.isArray(productData.variants) && productData.variants.length === 0) {
      delete productData.variants;
    }
    
    // If hasVariants is false, ensure variants is not set
    if (!hasVariants) {
      delete productData.variants;
      productData.hasVariants = false;
      
      // ALWAYS generate SKU for non-variant products
      if (!productData.sku) {
        console.log('Generating SKU for product:', productData.name);
        productData.sku = await generateUniqueSKU(productData.name);
        console.log('Generated SKU:', productData.sku);
      }
    } else {
      // Product has variants - no base SKU needed
      productData.hasVariants = true;
      delete productData.sku; // Remove SKU for variant products
    }

    console.log('Creating product with data:', {
      name: productData.name,
      sku: productData.sku,
      hasVariants: productData.hasVariants,
      variantsCount: productData.variants ? productData.variants.length : 0
    });

    // Create the product
    const product = await Product.create(productData);
    
    // Create audit log (only if user is authenticated)
    if (req.user) {
      await createAuditLog(
        req.user._id,
        req.user.role,
        'product_created',
        'Product',
        product._id,
        null,
        product.toObject(),
        { sku: product.sku, name: product.name },
        req
      );
    }

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    
    // Handle duplicate SKU error
    if (error.code === 11000) {
      const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
      return res.status(400).json({ 
        error: `${field === 'sku' ? 'SKU' : field} already exists. This is unexpected - please try again.`,
        details: 'The system will generate a new unique SKU on retry.'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation error',
        details: messages.join(', ')
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create product',
      details: error.message 
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check SKU uniqueness if SKU is being updated
    if (updateData.sku && updateData.sku !== product.sku) {
      const existingProduct = await Product.findOne({ 
        sku: updateData.sku,
        _id: { $ne: id } // Exclude current product
      });
      if (existingProduct) {
        return res.status(400).json({ error: 'SKU already exists' });
      }
    }

    const oldValues = product.toObject();
    const updatedProduct = await Product.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );

    // Create audit log
    await createAuditLog(
      req.user._id,
      req.user.role,
      'product_updated',
      'Product',
      id,
      oldValues,
      updatedProduct.toObject(),
      { sku: updatedProduct.sku, name: updatedProduct.name },
      req
    );

    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if product has stock
    const warehouses = await Warehouse.find({ 'currentStock.productId': id });
    let totalStock = 0;
    
    warehouses.forEach(warehouse => {
      const stockItem = warehouse.currentStock.find(item => 
        item.productId.toString() === id
      );
      if (stockItem) {
        totalStock += stockItem.quantity;
      }
    });

    if (totalStock > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete product with existing stock. Transfer or sell stock first.' 
      });
    }

    // Hard delete - completely remove from database
    await Product.findByIdAndDelete(id);

    // Create audit log (only if user is authenticated)
    if (req.user) {
      await createAuditLog(
        req.user._id,
        req.user.role,
        'product_deleted',
        'Product',
        id,
        product.toObject(),
        null,
        { sku: product.sku, name: product.name },
        req
      );
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Generate SKU endpoint
const generateSKU = async (req, res) => {
  try {
    const { productName } = req.body;
    
    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }
    
    const sku = await generateUniqueSKU(productName);
    res.json({ sku });
  } catch (error) {
    console.error('Generate SKU error:', error);
    res.status(500).json({ error: 'Failed to generate SKU' });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  generateSKU
};