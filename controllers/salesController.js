const {
  SalesOrder,
  Product,
  Customer,
  Warehouse,
  StockMovement,
  SalesShipment,
} = require("../models");
const { createAuditLog } = require("../middleware/audit");

const normalizeId = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();

  let current = value;
  const visited = new Set();
  let depth = 0;
  const MAX_DEPTH = 6;

  while (
    current &&
    typeof current === "object" &&
    depth < MAX_DEPTH &&
    !visited.has(current)
  ) {
    visited.add(current);

    if (typeof current === "string") return current;
    if (typeof current === "number") return current.toString();

    if (current._id) {
      current = current._id;
      depth += 1;
      continue;
    }

    if (current.id) {
      const idValue = current.id;
      if (typeof idValue === "string") return idValue;
      current = idValue;
      depth += 1;
      continue;
    }

    break;
  }

  if (
    current &&
    typeof current === "object" &&
    typeof current.toString === "function" &&
    current.toString !== Object.prototype.toString
  ) {
    return current.toString();
  }

  return String(current);
};

const parseDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Create a new sales order
const createSalesOrder = async (req, res) => {
  try {
    const {
      customerInfo,
      items,
      deliveryAddress,
      expectedDeliveryDate,
      notes,
      agentName,
      timestamp,
      orderDate,
    } = req.body;

    // Validate required fields
    if (!customerInfo?.address?.city) {
      return res.status(400).json({
        error: "Customer city is required",
        field: "customerInfo.address.city",
      });
    }

    // User authentication is optional - use system user if not authenticated
    let userId = req.user?._id || null;

    // If no user, try to find a default admin user
    if (!userId) {
      const User = require("../models/User");
      const adminUser = await User.findOne({ role: "admin", isActive: true });
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
        return res
          .status(404)
          .json({ error: `Product with ID ${item.productId} not found` });
      }

      const requestedProductId = normalizeId(item.productId);
      const requestedVariantId = normalizeId(item.variantId || "");
      const requestedVariantName = item.variantName || null;

      // Get variant info if provided
      let variantName = requestedVariantName;
      if (
        !variantName &&
        requestedVariantId &&
        product.hasVariants &&
        Array.isArray(product.variants)
      ) {
        const variant = product.variants.find((v) => {
          const variantId = normalizeId(v._id);
          const variantSku = normalizeId(v.sku);
          return (
            variantId === requestedVariantId ||
            (variantSku && variantSku === requestedVariantId)
          );
        });
        if (variant) {
          variantName = variant.name;
        }
      }

      const normalizedVariantName = (variantName || "")
        .toString()
        .toLowerCase()
        .trim();

      // Check stock availability across all warehouses (MATCH BY PRODUCT + VARIANT)
      const warehouses = await Warehouse.find({ isActive: true });
      let totalAvailableStock = 0;

      for (const warehouse of warehouses) {
        const stockItem = warehouse.currentStock.find((stock) => {
          const stockProductId = normalizeId(
            stock.productId?._id || stock.productId
          );
          const stockVariantId = normalizeId(
            stock.variantId ||
              stock.variantDetails?._id ||
              stock.variantDetails?.sku ||
              ""
          );
          const stockVariantName = (
            stock.variantDetails?.name ||
            stock.variantName ||
            ""
          )
            .toString()
            .toLowerCase()
            .trim();

          const productMatches = stockProductId === requestedProductId;
          const variantMatches = requestedVariantId
            ? stockVariantId === requestedVariantId ||
              (normalizedVariantName &&
                stockVariantName &&
                stockVariantName === normalizedVariantName)
            : !stockVariantId ||
              (normalizedVariantName &&
                stockVariantName &&
                stockVariantName === normalizedVariantName);

          return productMatches && variantMatches;
        });
        if (stockItem) {
          const reserved = stockItem.reservedQuantity || 0;
          const delivered = stockItem.deliveredQuantity || 0;
          const confirmedDelivered = stockItem.confirmedDeliveredQuantity || 0;
          const available =
            (stockItem.quantity || 0) -
            reserved -
            delivered -
            confirmedDelivered;
          totalAvailableStock += Math.max(0, available);
        }
      }

      if (totalAvailableStock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for product ${product.name}${
            variantName ? ` (${variantName})` : ""
          }. Available: ${totalAvailableStock}, Required: ${item.quantity}`,
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
        totalPrice: itemTotal,
      });

      stockChecks.push({
        productId: item.productId,
        variantId: item.variantId || null,
        variantName: variantName,
        availableStock: totalAvailableStock,
        requiredStock: item.quantity,
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
                  1,
                ],
              },
            },
          },
        },
        { $group: { _id: null, maxOrder: { $max: "$orderNum" } } },
      ]);

      if (
        result &&
        result.length > 0 &&
        result[0].maxOrder !== null &&
        result[0].maxOrder !== undefined
      ) {
        startNumber = result[0].maxOrder;
      }
    } catch (aggError) {
      // Fallback: use findOne with sort
      console.warn(
        "Aggregation failed, using fallback method:",
        aggError.message
      );
      const lastOrder = await SalesOrder.findOne({}, { orderNumber: 1 }).sort({
        orderNumber: -1,
      });
      if (lastOrder && lastOrder.orderNumber) {
        const match = lastOrder.orderNumber.match(/SO-(\d+)/);
        if (match) {
          startNumber = parseInt(match[1]) || 0;
        }
      }
    }

    let candidateNumber = startNumber + 1;
    console.log(
      `Starting order number generation from: ${startNumber}, next candidate: ${candidateNumber}`
    );

    // Retry loop with database checks
    while (attempts < maxAttempts) {
      orderNumber = `SO-${String(candidateNumber).padStart(4, "0")}`;

      try {
        // Check if exists
        const exists = await SalesOrder.findOne({ orderNumber: orderNumber });
        if (exists) {
          candidateNumber++;
          attempts++;
          continue;
        }

        // Try to create with this order number
        const parsedTimestamp = parseDateValue(timestamp) || new Date();
        const parsedOrderDate = parseDateValue(orderDate) || parsedTimestamp;

        salesOrder = new SalesOrder({
          orderNumber,
          customerInfo,
          items: validatedItems,
          totalAmount,
          deliveryAddress,
          expectedDeliveryDate,
          notes,
          agentName: agentName || null,
          timestamp: parsedTimestamp,
          orderDate: parsedOrderDate,
          createdBy: userId,
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
            throw new Error(
              "Failed to generate unique order number after 100 attempts. Please try again."
            );
          }
          // Small delay
          await new Promise((resolve) => setTimeout(resolve, 10));
          continue;
        }
        // Other errors should be thrown
        throw saveError;
      }
    }

    if (!salesOrder) {
      throw new Error(
        "Failed to create sales order: Could not generate unique order number."
      );
    }

    // Reservation will occur on dispatch; keep empty array for response compatibility
    const reservedStock = [];

    // Create audit log (only if user is authenticated)
    if (req.user && userId) {
      await createAuditLog(
        userId,
        req.user.role || "admin",
        "sales_order_created",
        "SalesOrder",
        salesOrder._id,
        null,
        {
          orderNumber: salesOrder.orderNumber,
          totalAmount,
          customerName: customerInfo.name,
        },
        req
      );
    }

    // Populate items for response
    await salesOrder.populate([
      { path: "items.productId", select: "name sku" },
      { path: "createdBy", select: "firstName lastName" },
    ]);

    res.status(201).json({
      message: "Sales order created successfully.",
      salesOrder,
      stockChecks,
      reservedStock,
    });
  } catch (error) {
    // Log full error for debugging
    console.error("Error creating sales order:", error);
    console.error("Error stack:", error.stack);
    console.error("Error code:", error.code);
    console.error("Error keyPattern:", error.keyPattern);

    // Provide detailed error message to help debugging
    const errorMessage = error.message || "Internal server error";
    const errorDetails = {
      error: "Failed to create sales order",
      details: errorMessage,
      code: error.code,
      keyPattern: error.keyPattern,
    };

    // If it's a duplicate key error, provide specific message
    if (error.code === 11000) {
      errorDetails.error = "Duplicate order number detected";
      errorDetails.details = `Order number already exists. ${errorMessage}`;
      errorDetails.suggestion =
        "Please try again - the system will generate a new number automatically";
    } else {
      errorDetails.suggestion =
        "Please check your data and try again. If the problem persists, contact support.";
    }

    res.status(500).json(errorDetails);
  }
};

// Get all sales orders
const getAllSalesOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      isActive,
      search,
    } = req.query;

    // Show all sales orders by default, allow filtering by isActive
    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (status) query.status = status;
    if (startDate || endDate) {
      // Filter STRICTLY by orderDate (actual sales date) ONLY
      // Do NOT use timestamp or createdAt - they are not sales dates
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Ensure dates are properly set (handle timezone issues)
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        // Only filter by orderDate - the actual sales date
        query.orderDate = { $gte: start, $lte: end };
      } else if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.orderDate = { $gte: start };
      } else if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.orderDate = { $lte: end };
      }
    }

    // Add search functionality for phone number, CN number, and agent name
    const isSearching = search && search.trim();
    if (isSearching) {
      const trimmedSearch = search.trim();
      const searchRegex = new RegExp(trimmedSearch, "i"); // Case-insensitive search
      const searchConditions = [
        { "customerInfo.phone": searchRegex },
        { "customerInfo.cnNumber": searchRegex },
        { agentName: searchRegex },
        { orderNumber: searchRegex },
        { notes: searchRegex },
        { "items.variantName": searchRegex },
      ];

      // Include product name / SKU matches
      const matchingProducts = await Product.find(
        {
          $or: [{ name: searchRegex }, { sku: searchRegex }],
        },
        { _id: 1 }
      );
      if (matchingProducts.length > 0) {
        const productIds = matchingProducts.map((product) => product._id);
        searchConditions.push({ "items.productId": { $in: productIds } });
      }

      // If both search and date filter (orderDate) are present, combine them with $and
      if (query.orderDate) {
        query.$and = [
          { $or: searchConditions },
          { orderDate: query.orderDate },
        ];
        delete query.orderDate; // Remove from root level since it's now in $and
      } else {
        query.$or = searchConditions;
      }
    }
    // If no search but date filter exists, query.orderDate is already set above

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
      .populate("items.productId", "name sku")
      .populate("createdBy", "firstName lastName")
      .sort(sortOrder)
      .limit(limitNum)
      .skip(isSearching || isHighLimit ? 0 : (pageNum - 1) * limitNum); // Skip pagination when searching or "All Time"

    const total = await SalesOrder.countDocuments(query);

    res.json({
      salesOrders,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
    });
  } catch (error) {
    console.error("Get sales orders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get Post Office orders (sales orders with CN numbers)
const getPostOfficeOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate, search, status, city } = req.query;

    // Fetch sales orders with CN numbers AND Post Office QC approved
    // This ensures only Post Office QC approved sales appear in Post Office Orders module
    let query = { 
      "customerInfo.cnNumber": { $exists: true, $ne: null, $ne: "" },
      qcStatus: "approved",
      qcType: "postoffice"
    };

    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    // Filter by city if provided
    if (city) {
      query["customerInfo.address.city"] = new RegExp(city, "i");
    }

    // Add date filtering by orderDate
    if (startDate || endDate) {
      console.log("Date filter received:", { startDate, endDate });
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        start.setUTCHours(0, 0, 0, 0);
        end.setUTCHours(23, 59, 59, 999);
        query.orderDate = { $gte: start, $lte: end };
      } else if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        query.orderDate = { $gte: start };
      } else if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.orderDate = { $lte: end };
      }
    }

    // Add search functionality
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      const searchConditions = [
        { "customerInfo.cnNumber": searchRegex },
        { "customerInfo.phone": searchRegex },
        { "customerInfo.name": searchRegex },
        { orderNumber: searchRegex },
      ];
      query.$and = query.$and || [];
      query.$and.push({ $or: searchConditions });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const requestedLimit = parseInt(limit) || 10;
    const isDateFiltered = startDate || endDate;
    
    let limitNum;
    if (isDateFiltered) {
      limitNum = Math.min(10000, Math.max(1, requestedLimit));
    } else {
      limitNum = Math.min(1000, Math.max(1, requestedLimit));
    }

    let sortOrder = { orderDate: -1 };

    const salesOrders = await SalesOrder.find(query)
      .populate("items.productId", "name sku")
      .populate("createdBy", "firstName lastName")
      .sort(sortOrder)
      .limit(limitNum)
      .skip(isDateFiltered ? 0 : (pageNum - 1) * limitNum);

    const total = await SalesOrder.countDocuments(query);

    res.json({
      salesOrders,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
    });
  } catch (error) {
    console.error("Get Post Office orders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all sales orders
const getApprovedSalesOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    // Only fetch sales orders with qcStatus = "approved" and qcType = "postex" (or null for backward compatibility)
    // This ensures only PostEx QC approved sales appear in Approved Sales module
    // CRITICAL: Explicitly exclude Post Office QC approved sales (qcType: "postoffice")
    // Approved Sales module is ONLY for PostEx QC approved - NO connection with Post Office
    let query = { 
      qcStatus: "approved",
      // Explicitly exclude Post Office QC approved sales
      qcType: { $ne: "postoffice" },
      // Include only PostEx QC approved or legacy approved (null/undefined for backward compatibility)
      $or: [
        { qcType: "postex" },
        { qcType: null }, // Backward compatibility for existing approved sales (before qcType was added)
        { qcType: { $exists: false } } // Backward compatibility for existing approved sales
      ]
    };
    
    console.log("🔍 Approved Sales Query - Excluding Post Office QC approved:", JSON.stringify(query, null, 2));

    // Add date filtering by orderDate (actual sales date)
    if (startDate || endDate) {
      console.log("Date filter received:", { startDate, endDate });
      // Filter STRICTLY by orderDate (actual sales date) ONLY
      // Do NOT use timestamp or createdAt - they are not sales dates
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Ensure dates are properly set (handle timezone issues)
        // Use UTC to avoid timezone problems
        start.setUTCHours(0, 0, 0, 0);
        end.setUTCHours(23, 59, 59, 999);
        // Only filter by orderDate - the actual sales date
        query.orderDate = { $gte: start, $lte: end };
        console.log("Date range query:", { start: start.toISOString(), end: end.toISOString() });
      } else if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        query.orderDate = { $gte: start };
        console.log("Start date query:", { start: start.toISOString() });
      } else if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.orderDate = { $lte: end };
        console.log("End date query:", { end: end.toISOString() });
      }
    }

    // Convert limit and page to numbers, with safety limits
    const pageNum = Math.max(1, parseInt(page) || 1);
    const requestedLimit = parseInt(limit) || 10;

    // When date filtering is applied, show all results (no pagination limit)
    const isDateFiltered = startDate || endDate;
    let limitNum;
    if (isDateFiltered) {
      // When date filtered, show all results (up to 10000 for safety)
      limitNum = Math.min(10000, Math.max(1, requestedLimit));
    } else {
      // Normal pagination when not date filtered
      limitNum = Math.min(1000, Math.max(1, requestedLimit));
    }

    // Determine sort order - default to newest first (orderDate descending)
    let sortOrder = { orderDate: -1 }; // Default: newest first

    const salesOrders = await SalesOrder.find(query)
      .populate("items.productId", "name sku")
      .populate("createdBy", "firstName lastName")
      .sort(sortOrder)
      .limit(limitNum)
      .skip(isDateFiltered ? 0 : (pageNum - 1) * limitNum); // Skip pagination when date filtered

    // CRITICAL: Additional safety filter to ensure NO Post Office QC approved sales slip through
    // This is a double-check to ensure complete separation between PostEx and Post Office modules
    const filteredOrders = salesOrders.filter(order => {
      // Only include if it's PostEx QC approved or legacy (null/undefined)
      // Explicitly exclude Post Office QC approved
      const isPostEx = order.qcType === "postex";
      const isLegacy = order.qcType === null || order.qcType === undefined;
      const isNotPostOffice = order.qcType !== "postoffice";
      
      const shouldInclude = (isPostEx || isLegacy) && isNotPostOffice;
      
      if (!shouldInclude) {
        console.log(`⚠️ FILTERED OUT from Approved Sales: Order ${order.orderNumber} - qcType: ${order.qcType}, qcStatus: ${order.qcStatus}`);
      }
      
      return shouldInclude;
    });
    
    console.log(`✅ Approved Sales: Found ${salesOrders.length} orders from DB, filtered to ${filteredOrders.length} PostEx QC approved orders`);
    console.log(`📊 Orders filtered out: ${salesOrders.length - filteredOrders.length}`);

    // Count only PostEx QC approved sales (excluding Post Office)
    const totalQuery = { 
      qcStatus: "approved",
      qcType: { $ne: "postoffice" },
      $or: [
        { qcType: "postex" },
        { qcType: null },
        { qcType: { $exists: false } }
      ]
    };
    const total = await SalesOrder.countDocuments(totalQuery);

    console.log("Final query for approved sales:", JSON.stringify(query, null, 2));
    console.log("Total PostEx QC approved sales found:", total);

    res.json({
      salesOrders: filteredOrders, // Use filtered orders - ONLY PostEx QC approved
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
    });
  } catch (error) {
    console.error("Get approved sales orders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get sales order by ID
const getSalesOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const salesOrder = await SalesOrder.findById(id)
      .populate("items.productId", "name sku description unit")
      .populate("createdBy", "firstName lastName email");

    if (!salesOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    res.json(salesOrder);
  } catch (error) {
    console.error("Get sales order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update sales order (full update)
const updateSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    const oldStatus = salesOrder.status;
    const newStatus = updateData.status;

    // Update allowed fields
    if (updateData.customerInfo)
      salesOrder.customerInfo = {
        ...salesOrder.customerInfo,
        ...updateData.customerInfo,
      };
    if (updateData.deliveryAddress)
      salesOrder.deliveryAddress = {
        ...salesOrder.deliveryAddress,
        ...updateData.deliveryAddress,
      };
    if (updateData.agentName !== undefined)
      salesOrder.agentName = updateData.agentName;
    if (updateData.notes !== undefined) salesOrder.notes = updateData.notes;
    if (updateData.orderDate) {
      const parsedOrderDate = parseDateValue(updateData.orderDate);
      if (parsedOrderDate) {
        salesOrder.orderDate = parsedOrderDate;
      }
    }
    if (updateData.timestamp) {
      const parsedTimestamp = parseDateValue(updateData.timestamp);
      if (parsedTimestamp) {
        salesOrder.timestamp = parsedTimestamp;
      }
    }
    if (updateData.items) {
      salesOrder.items = updateData.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId || null,
        variantName: item.variantName || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        isOutOfStock: item.isOutOfStock || false,
      }));
      // Recalculate total amount
      salesOrder.totalAmount = salesOrder.items.reduce(
        (sum, item) => sum + item.totalPrice,
        0
      );
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
      const Warehouse = require("../models/Warehouse");
      const StockMovement = require("../models/StockMovement");

      // Handle DISPATCH status - reserve stock
      if (newStatus === "dispatch" || newStatus === "dispatched") {
        const warehouses = await Warehouse.find({ isActive: true });

        for (const item of salesOrder.items) {
          const itemProductId =
            item.productId && item.productId._id
              ? item.productId._id.toString()
              : item.productId.toString();
          let quantityToReserve = item.quantity;

          for (const warehouse of warehouses) {
            if (quantityToReserve <= 0) break;

            const stockItem = warehouse.currentStock.find(
              (stock) =>
                stock.productId.toString() === itemProductId &&
                (stock.variantId || null) === (item.variantId || null)
            );

            if (stockItem) {
              const availableQty =
                (stockItem.quantity || 0) - (stockItem.reservedQuantity || 0);
              const reserveQty = Math.min(availableQty, quantityToReserve);

              if (reserveQty > 0) {
                stockItem.reservedQuantity =
                  (stockItem.reservedQuantity || 0) + reserveQty;
                quantityToReserve -= reserveQty;
                await warehouse.save();

                const stockMovement = new StockMovement({
                  productId: item.productId,
                  warehouseId: warehouse._id,
                  movementType: "reserved",
                  quantity: reserveQty,
                  previousQuantity:
                    stockItem.quantity -
                    stockItem.reservedQuantity +
                    reserveQty,
                  newQuantity: stockItem.quantity - stockItem.reservedQuantity,
                  referenceType: "sales_order",
                  referenceId: salesOrder._id,
                  notes: `Reserved for sales order ${salesOrder.orderNumber} (status change)`,
                  createdBy: req.user?._id || salesOrder.createdBy,
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
      message: "Sales order updated successfully",
      salesOrder,
    });
  } catch (error) {
    console.error("Update sales order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateSalesOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    console.log("Status update request:", { id, status, notes });

    const salesOrder = await SalesOrder.findById(id).populate(
      "items.productId"
    );
    if (!salesOrder) {
      console.error("Sales order not found:", id);
      return res.status(404).json({ error: "Sales order not found" });
    }

    const oldStatus = salesOrder.status;
    let returnWarehouse = null;

    // Handle UNBOOKED status - move stock to Unbooked column
    if (status === "Unbooked") {
      console.log("Processing Unbooked - moving stock to Unbooked column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToUnbook = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToUnbook <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            const availableQty = stockItem.quantity || 0;
            if (availableQty > 0) {
              const unbookQty = Math.min(availableQty, quantityToUnbook);

              // Decrease main quantity and increase Unbooked
              // stockItem.quantity -= unbookQty;

              if (!stockItem.Unbooked) {
                stockItem.Unbooked = 0;
              }
              stockItem.Unbooked += unbookQty;

              quantityToUnbook -= unbookQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "unbooked",
                quantity: unbookQty,
                previousQuantity: stockItem.quantity + unbookQty,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock moved to Unbooked for order ${
                  salesOrder.orderNumber
                }${item.variantName ? " - " + item.variantName : ""}`,
                createdBy: req.user?._id || salesOrder.createdBy,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle BOOKED status - move from Unbooked to Booked
    if (status === "Booked") {
      console.log("Processing Booked - moving from Unbooked to Booked");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToBook = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToBook <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Unbooked > 0) {
            const bookQty = Math.min(stockItem.Unbooked, quantityToBook);

            // Move from Unbooked to Booked
            stockItem.Unbooked -= bookQty;

            if (!stockItem.Booked) {
              stockItem.Booked = 0;
            }
            stockItem.Booked += bookQty;

            quantityToBook -= bookQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "booked",
              quantity: bookQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to Booked for order ${
                salesOrder.orderNumber
              }${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle DELIVERED status - move from appropriate previous status to Delivered
    if (status === "Delivered") {
      console.log("Processing Delivered - moving to Delivered column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToDeliver = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToDeliver <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from OutForDelivery first, then Booked as fallback
            let sourceQty = stockItem.OutForDelivery || 0;
            let sourceField = "OutForDelivery";

            if (sourceQty === 0) {
              sourceQty = stockItem.Booked || 0;
              sourceField = "Booked";
            }

            if (sourceQty > 0) {
              const deliverQty = Math.min(sourceQty, quantityToDeliver);

              // Remove from source field
              stockItem[sourceField] -= deliverQty;

              // Add to Delivered
              if (!stockItem.Delivered) {
                stockItem.Delivered = 0;
              }
              stockItem.Delivered += deliverQty;

              quantityToDeliver -= deliverQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "delivered",
                quantity: deliverQty,
                previousQuantity: stockItem.quantity,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock delivered for order ${salesOrder.orderNumber}${
                  item.variantName ? " - " + item.variantName : ""
                } (from ${sourceField})`,
                createdBy: req.user?._id || salesOrder.createdBy,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle OUT FOR DELIVERY status - move from Booked to OutForDelivery
    if (status === "Out For Delivery" || status === "OutForDelivery") {
      console.log("Processing OutForDelivery - moving from Booked to OutForDelivery");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.OutForDelivery) {
              stockItem.OutForDelivery = 0;
            }
            stockItem.OutForDelivery += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "out",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to OutForDelivery for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle POSTEX WAREHOUSE status - move from Booked to PostExWareHouse
    if (status === "PostEx WareHouse" || status === "PostExWareHouse") {
      console.log("Processing PostExWareHouse - moving from Booked to PostExWareHouse");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.PostExWareHouse) {
              stockItem.PostExWareHouse = 0;
            }
            stockItem.PostExWareHouse += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "postex_warehouse",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to PostExWareHouse for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle RETURNED status - move from Delivered/OutForDelivery to Returned
    if (status === "Returned") {
      console.log("Processing Returned - moving to Returned column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToReturn = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToReturn <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from any possible status - check in order of priority
            const statusFields = [
              "Delivered",
              "OutForDelivery",
              "PostExWareHouse",
              "Booked",
              "PickedByPostEx",
              "EnRouteToPostExwarehouse",
              "OutForReturn",
              "Attempted",
              "DeliveryUnderReview",
            ];

            for (const field of statusFields) {
              if (quantityToReturn <= 0) break;

              const fieldQty = stockItem[field] || 0;
              if (fieldQty > 0) {
                const returnQty = Math.min(fieldQty, quantityToReturn);

                stockItem[field] -= returnQty;

                if (!stockItem.Returned) {
                  stockItem.Returned = 0;
                }
                stockItem.Returned += returnQty;

                quantityToReturn -= returnQty;

                await warehouse.save();

                const stockMovement = new StockMovement({
                  productId: item.productId,
                  warehouseId: warehouse._id,
                  movementType: "returned",
                  quantity: returnQty,
                  previousQuantity: stockItem.quantity,
                  newQuantity: stockItem.quantity,
                  referenceType: "sales_order",
                  referenceId: salesOrder._id,
                  notes: `Stock returned for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${field})`,
                  createdBy: req.user?._id || salesOrder.createdBy,
                });
                await stockMovement.save();
              }
            }
          }
        }
      }
    }

    // Handle UN-ASSIGNED BY ME status - move from Booked to UnAssignedByMe
    if (status === "Un-Assigned By Me" || status === "UnAssignedByMe") {
      console.log("Processing UnAssignedByMe - moving from Booked to UnAssignedByMe");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.UnAssignedByMe) {
              stockItem.UnAssignedByMe = 0;
            }
            stockItem.UnAssignedByMe += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "unassigned",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to UnAssignedByMe for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle EXPIRED status - move from any status to Expired
    if (status === "Expired") {
      console.log("Processing Expired - moving to Expired column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToExpire = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToExpire <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from OutForDelivery first, then Booked as fallback
            let sourceQty = stockItem.OutForDelivery || 0;
            let sourceField = "OutForDelivery";

            if (sourceQty === 0) {
              sourceQty = stockItem.Booked || 0;
              sourceField = "Booked";
            }

            if (sourceQty > 0) {
              const expireQty = Math.min(sourceQty, quantityToExpire);

              stockItem[sourceField] -= expireQty;

              if (!stockItem.Expired) {
                stockItem.Expired = 0;
              }
              stockItem.Expired += expireQty;

              quantityToExpire -= expireQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "expired",
                quantity: expireQty,
                previousQuantity: stockItem.quantity,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock expired for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${sourceField})`,
                createdBy: req.user?._id || salesOrder.createdBy,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle DELIVERY UNDER REVIEW status - move from OutForDelivery to DeliveryUnderReview
    if (status === "Delivery Under Review" || status === "DeliveryUnderReview") {
      console.log("Processing DeliveryUnderReview - moving from OutForDelivery to DeliveryUnderReview");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.OutForDelivery > 0) {
            const moveQty = Math.min(stockItem.OutForDelivery, quantityToMove);

            stockItem.OutForDelivery -= moveQty;

            if (!stockItem.DeliveryUnderReview) {
              stockItem.DeliveryUnderReview = 0;
            }
            stockItem.DeliveryUnderReview += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "delivery_under_review",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock moved to DeliveryUnderReview for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle PICKED BY POSTEX status - move from Booked to PickedByPostEx
    if (status === "Picked By PostEx" || status === "PickedByPostEx") {
      console.log("Processing PickedByPostEx - moving from Booked to PickedByPostEx");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.PickedByPostEx) {
              stockItem.PickedByPostEx = 0;
            }
            stockItem.PickedByPostEx += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "picked_by_postex",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock picked by PostEx for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle OUT FOR RETURN status - move from Delivered/Returned to OutForReturn
    if (status === "Out For Return" || status === "OutForReturn") {
      console.log("Processing OutForReturn - moving to OutForReturn column");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Try to move from Returned first, then Delivered as fallback
            let sourceQty = stockItem.Returned || 0;
            let sourceField = "Returned";

            if (sourceQty === 0) {
              sourceQty = stockItem.Delivered || 0;
              sourceField = "Delivered";
            }

            if (sourceQty > 0) {
              const moveQty = Math.min(sourceQty, quantityToMove);

              stockItem[sourceField] -= moveQty;

              if (!stockItem.OutForReturn) {
                stockItem.OutForReturn = 0;
              }
              stockItem.OutForReturn += moveQty;

              quantityToMove -= moveQty;

              await warehouse.save();

              const stockMovement = new StockMovement({
                productId: item.productId,
                warehouseId: warehouse._id,
                movementType: "out_for_return",
                quantity: moveQty,
                previousQuantity: stockItem.quantity,
                newQuantity: stockItem.quantity,
                referenceType: "sales_order",
                referenceId: salesOrder._id,
                notes: `Stock moved to OutForReturn for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""} (from ${sourceField})`,
                createdBy: req.user?._id || salesOrder.createdBy,
              });
              await stockMovement.save();
            }
          }
        }
      }
    }

    // Handle ATTEMPTED status - move from OutForDelivery to Attempted
    if (status === "Attempted") {
      console.log("Processing Attempted - moving from OutForDelivery to Attempted");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.OutForDelivery > 0) {
            const moveQty = Math.min(stockItem.OutForDelivery, quantityToMove);

            stockItem.OutForDelivery -= moveQty;

            if (!stockItem.Attempted) {
              stockItem.Attempted = 0;
            }
            stockItem.Attempted += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "attempted",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock attempted delivery for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle EN-ROUTE TO POSTEX WAREHOUSE status - move from Booked to EnRouteToPostExwarehouse
    if (status === "En-Route to PostEx warehouse" || status === "EnRouteToPostExwarehouse") {
      console.log("Processing EnRouteToPostExwarehouse - moving from Booked to EnRouteToPostExwarehouse");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToMove = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem && stockItem.Booked > 0) {
            const moveQty = Math.min(stockItem.Booked, quantityToMove);

            stockItem.Booked -= moveQty;

            if (!stockItem.EnRouteToPostExwarehouse) {
              stockItem.EnRouteToPostExwarehouse = 0;
            }
            stockItem.EnRouteToPostExwarehouse += moveQty;

            quantityToMove -= moveQty;

            await warehouse.save();

            const stockMovement = new StockMovement({
              productId: item.productId,
              warehouseId: warehouse._id,
              movementType: "en_route_to_postex",
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: "sales_order",
              referenceId: salesOrder._id,
              notes: `Stock en-route to PostEx warehouse for order ${salesOrder.orderNumber}${item.variantName ? " - " + item.variantName : ""}`,
              createdBy: req.user?._id || salesOrder.createdBy,
            });
            await stockMovement.save();
          }
        }
      }
    }

    // Handle CANCELLED status - move back to main quantity from any status
    if (status === "cancelled") {
      console.log("Processing cancellation - returning stock to main quantity");

      const warehouses = await Warehouse.find({ isActive: true });

      for (const item of salesOrder.items) {
        const itemProductId =
          item.productId && item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString();
        let quantityToReturn = item.quantity;

        for (const warehouse of warehouses) {
          if (quantityToReturn <= 0) break;

          const stockItem = warehouse.currentStock.find(
            (stock) =>
              stock.productId.toString() === itemProductId &&
              (stock.variantId || null) === (item.variantId || null)
          );

          if (stockItem) {
            // Check all status fields and return to main quantity
            const statusFields = [
              "Unbooked",
              "Booked",
              "PostExWareHouse",
              "OutForDelivery",
              "Delivered",
              "Returned",
              "UnAssignedByMe",
              "Expired",
              "DeliveryUnderReview",
              "PickedByPostEx",
              "OutForReturn",
              "Attempted",
              "EnRouteToPostExwarehouse",
            ];

            for (const field of statusFields) {
              if (quantityToReturn <= 0) break;

              const fieldQty = stockItem[field] || 0;
              if (fieldQty > 0) {
                const returnQty = Math.min(fieldQty, quantityToReturn);

                stockItem[field] -= returnQty;
                stockItem.quantity += returnQty;
                quantityToReturn -= returnQty;

                await warehouse.save();

                const stockMovement = new StockMovement({
                  productId: item.productId,
                  warehouseId: warehouse._id,
                  movementType: "cancelled_return",
                  quantity: returnQty,
                  previousQuantity: stockItem.quantity - returnQty,
                  newQuantity: stockItem.quantity,
                  referenceType: "sales_order",
                  referenceId: salesOrder._id,
                  notes: `Stock returned to main quantity due to cancellation ${
                    salesOrder.orderNumber
                  }${
                    item.variantName ? " - " + item.variantName : ""
                  } (from ${field})`,
                  createdBy: req.user?._id || salesOrder.createdBy,
                });
                await stockMovement.save();
              }
            }
          }
        }
      }
    }

    // KEEP ALL YOUR EXISTING LOGIC FOR OTHER STATUSES (expected_return, confirmed_delivered, etc.)
    // ... [rest of your existing code for other status handlers]

    salesOrder.status = status;
    if (notes) salesOrder.notes = notes;

    await salesOrder.save();

    console.log("Status updated successfully to:", salesOrder.status);

    // Create audit log
    if (req.user) {
      await createAuditLog(
        req.user._id,
        req.user.role,
        "sales_order_status_updated",
        "SalesOrder",
        salesOrder._id,
        { status: oldStatus },
        { status: salesOrder.status },
        { orderNumber: salesOrder.orderNumber },
        req
      );
    }

    res.json({
      message: `Sales order status updated to ${status} successfully`,
      salesOrder,
      warehouseName: returnWarehouse ? returnWarehouse.name : null,
    });
  } catch (error) {
    console.error("Update sales order status error:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: error.name,
    });
  }
};

// Dispatch sales order
const dispatchSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouseId, trackingNumber, carrier, expectedDeliveryDate } =
      req.body;

    const salesOrder = await SalesOrder.findById(id).populate(
      "items.productId"
    );
    if (!salesOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    // Allow dispatching from pending status (not just confirmed)
    if (
      salesOrder.status === "delivered" ||
      salesOrder.status === "cancelled"
    ) {
      return res.status(400).json({ error: "Cannot dispatch this order" });
    }

    // Find warehouses with reserved stock and REMOVE IT
    const warehouses = await Warehouse.find({ isActive: true });

    for (const orderItem of salesOrder.items) {
      let quantityToRemove = orderItem.quantity;

      for (const warehouse of warehouses) {
        if (quantityToRemove <= 0) break;

        // Match by BOTH productId AND variantId
        const stockItem = warehouse.currentStock.find(
          (item) =>
            item.productId.toString() === orderItem.productId.toString() &&
            (item.variantId || null) === (orderItem.variantId || null)
        );

        if (stockItem && stockItem.reservedQuantity > 0) {
          const removeQty = Math.min(
            stockItem.reservedQuantity,
            quantityToRemove
          );

          // REMOVE from both quantity AND reserved
          stockItem.quantity -= removeQty;
          stockItem.reservedQuantity -= removeQty;
          quantityToRemove -= removeQty;

          await warehouse.save();

          // Create stock movement
          const stockMovement = new StockMovement({
            productId: orderItem.productId,
            warehouseId: warehouse._id,
            movementType: "out",
            quantity: removeQty,
            previousQuantity: stockItem.quantity + removeQty,
            newQuantity: stockItem.quantity,
            referenceType: "sales_order",
            referenceId: salesOrder._id,
            notes: `Dispatched for sales order ${salesOrder.orderNumber}${
              orderItem.variantName ? " - " + orderItem.variantName : ""
            }`,
            createdBy: req.user?._id || salesOrder.createdBy,
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
      items: salesOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        warehouseId,
      })),
      trackingNumber,
      carrier,
      expectedDeliveryDate,
      deliveryAddress: salesOrder.deliveryAddress,
      createdBy: userId,
    });

    await shipment.save();

    // Update sales order status
    salesOrder.status = "dispatched";
    await salesOrder.save();

    // Create audit log (only if user is authenticated)
    if (req.user) {
      await createAuditLog(
        req.user._id,
        req.user.role,
        "sales_order_dispatched",
        "SalesOrder",
        salesOrder._id,
        { status: "confirmed" },
        { status: "dispatched" },
        {
          orderNumber: salesOrder.orderNumber,
          shipmentNumber: shipment.shipmentNumber,
        },
        req
      );
    }

    res.json({
      message: "Sales order dispatched successfully",
      salesOrder,
      shipment,
    });
  } catch (error) {
    console.error("Dispatch sales order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Mark delivery as completed
const markDeliveryCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualDeliveryDate } = req.body;

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    if (salesOrder.status !== "dispatched") {
      return res
        .status(400)
        .json({ error: "Sales order must be dispatched to mark as delivered" });
    }

    // Get the shipment
    const shipment = await SalesShipment.findOne({ salesOrderId: id });
    if (!shipment) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    // Stock already removed during dispatch - no need to remove again

    // Update sales order and shipment
    salesOrder.status = "delivered";
    salesOrder.actualDeliveryDate = actualDeliveryDate || new Date();

    shipment.status = "delivered";
    shipment.actualDeliveryDate = actualDeliveryDate || new Date();

    await salesOrder.save();
    await shipment.save();

    // Create audit log (only if user is authenticated)
    if (req.user) {
      await createAuditLog(
        req.user._id,
        req.user.role,
        "sales_order_delivered",
        "SalesOrder",
        salesOrder._id,
        { status: "dispatched" },
        { status: "delivered" },
        { orderNumber: salesOrder.orderNumber },
        req
      );
    }

    res.json({
      message: "Delivery marked as completed successfully",
      salesOrder,
      shipment,
    });
  } catch (error) {
    console.error("Mark delivery completed error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete sales order (hard delete)
const deleteSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const salesOrder = await SalesOrder.findById(id).populate(
      "items.productId"
    );
    if (!salesOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    if (
      salesOrder.status === "dispatched" ||
      salesOrder.status === "delivered"
    ) {
      return res.status(400).json({
        error: "Cannot delete dispatched or delivered sales order",
      });
    }

    // CLEAN UP WAREHOUSE - Release reserved stock and expected returns
    const warehouses = await Warehouse.find({ isActive: true });

    for (const item of salesOrder.items) {
      for (const warehouse of warehouses) {
        const stockItem = warehouse.currentStock.find(
          (stock) =>
            stock.productId.toString() === item.productId._id.toString() &&
            (stock.variantId || null) === (item.variantId || null)
        );

        if (stockItem) {
          // Release reserved quantity
          if (stockItem.reservedQuantity && stockItem.reservedQuantity > 0) {
            const releaseQty = Math.min(
              stockItem.reservedQuantity,
              item.quantity
            );
            stockItem.reservedQuantity -= releaseQty;
          }

          // Remove expected returns
          if (stockItem.expectedReturns && stockItem.expectedReturns > 0) {
            const removeQty = Math.min(
              stockItem.expectedReturns,
              item.quantity
            );
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
        "sales_order_deleted",
        "SalesOrder",
        id,
        salesOrder.toObject(),
        null,
        { orderNumber: salesOrder.orderNumber },
        req
      );
    }

    res.json({
      message: "Sales order deleted successfully",
      warehouseUpdated: true,
    });
  } catch (error) {
    console.error("Delete sales order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update QC status
const updateQCStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { qcStatus, qcType } = req.body;

    if (!qcStatus || !["pending", "approved", "rejected"].includes(qcStatus)) {
      return res.status(400).json({
        error: "Invalid QC status. Must be pending, approved, or rejected",
      });
    }

    if (qcType && !["postex", "postoffice"].includes(qcType)) {
      return res.status(400).json({
        error: "Invalid QC type. Must be postex or postoffice",
      });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({ error: "Sales order not found" });
    }

    salesOrder.qcStatus = qcStatus;
    // Set qcType only when approving (to differentiate PostEx vs Post Office)
    if (qcStatus === "approved" && qcType) {
      salesOrder.qcType = qcType;
      console.log(`✅ QC Approved: Order ${salesOrder.orderNumber} - Set qcType to "${qcType}"`);
      if (qcType === "postoffice") {
        console.log(`📦 Post Office QC Approved: Order ${salesOrder.orderNumber} will appear in Post Office Orders module ONLY`);
      } else if (qcType === "postex") {
        console.log(`📮 PostEx QC Approved: Order ${salesOrder.orderNumber} will appear in Approved Sales module ONLY`);
      }
    } else if (qcStatus === "pending" || qcStatus === "rejected") {
      // Clear qcType when status is pending or rejected
      salesOrder.qcType = null;
      console.log(`🔄 QC ${qcStatus}: Order ${salesOrder.orderNumber} - Cleared qcType`);
    } else if (qcStatus === "approved" && !qcType) {
      // If approved without qcType, clear it to ensure it doesn't appear in either module
      salesOrder.qcType = null;
      console.log(`⚠️ QC Approved without qcType: Order ${salesOrder.orderNumber} - Cleared qcType (will not appear in any module)`);
    }

    await salesOrder.save();
    
    console.log(`💾 Saved: Order ${salesOrder.orderNumber} - qcStatus: ${salesOrder.qcStatus}, qcType: ${salesOrder.qcType}`);

    res.json({
      message: `QC status updated to ${qcStatus}`,
      salesOrder,
    });
  } catch (error) {
    console.error("Update QC status error:", error);
    res.status(500).json({ error: "Internal server error" });
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
      "customerInfo.phone": { $exists: true, $ne: null, $ne: "" },
    })
      .select(
        "orderNumber customerInfo items totalAmount timestamp status agentName"
      )
      .sort({ timestamp: -1 })
      .limit(limitNum);

    // Group orders by normalized phone number
    const phoneGroups = {};

    for (const order of allOrders) {
      const phone = order.customerInfo?.phone;
      if (!phone) continue;

      // Normalize phone number (remove spaces, dashes, convert to lowercase)
      const normalizedPhone = phone.replace(/[\s-]/g, "").toLowerCase();

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
          const customerName =
            order.customerInfo?.name?.trim().toLowerCase() || "Unknown";
          if (!customerGroups[customerName]) {
            customerGroups[customerName] = [];
          }
          customerGroups[customerName].push(order);
        }

        const uniqueCustomers = Object.keys(customerGroups).length;
        const totalOrders = orders.length;

        // Calculate statistics
        const totalAmount = orders.reduce(
          (sum, o) => sum + (o.totalAmount || 0),
          0
        );
        const statusCounts = {};
        orders.forEach((o) => {
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
          orders: orders.map((order) => ({
            orderNumber: order.orderNumber,
            timestamp: order.timestamp,
            customerName: order.customerInfo?.name,
            phone: order.customerInfo?.phone,
            cnNumber: order.customerInfo?.cnNumber,
            totalAmount: order.totalAmount,
            status: order.status,
            agentName: order.agentName,
            itemsCount: order.items?.length || 0,
          })),
          customers: Object.keys(customerGroups).map((name) => ({
            name: name,
            orderCount: customerGroups[name].length,
            orders: customerGroups[name].map((o) => o.orderNumber),
          })),
          isSameCustomer: uniqueCustomers === 1,
          message:
            uniqueCustomers === 1
              ? `Phone number used for ${totalOrders} orders by the same customer`
              : `Phone number used for ${totalOrders} orders by ${uniqueCustomers} different customers`,
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
      phoneNumbersWithMultipleOrders: duplicatePhones.filter(
        (p) => p.totalOrders > 1
      ).length,
      phoneNumbersWithDifferentCustomers: duplicatePhones.filter(
        (p) => !p.isSameCustomer
      ).length,
      totalOrdersWithDuplicates: duplicatePhones.reduce(
        (sum, p) => sum + p.totalOrders,
        0
      ),
    };

    res.json({
      message: `Checked ${allOrders.length} orders for duplicate phone numbers`,
      summary: summary,
      duplicates: duplicatePhones,
    });
  } catch (error) {
    console.error("Check duplicate phone numbers error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

// Check for duplicate phone numbers for a specific phone number
const checkPhoneNumberDuplicates = async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Normalize phone number
    const normalizedPhone = phone.replace(/[\s-]/g, "").toLowerCase();
    const phoneRegex = new RegExp(
      normalizedPhone.replace(/[-\s]/g, "[\\s-]*"),
      "i"
    );

    // Find all orders with this phone number
    const orders = await SalesOrder.find({
      isActive: { $ne: false },
      "customerInfo.phone": phoneRegex,
    })
      .select(
        "orderNumber customerInfo items totalAmount timestamp status agentName"
      )
      .sort({ timestamp: -1 });

    if (orders.length === 0) {
      return res.json({
        message: `No orders found for phone number: ${phone}`,
        phoneNumber: phone,
        orders: [],
      });
    }

    // Group by customer name
    const customerGroups = {};
    for (const order of orders) {
      const customerName =
        order.customerInfo?.name?.trim().toLowerCase() || "Unknown";
      if (!customerGroups[customerName]) {
        customerGroups[customerName] = [];
      }
      customerGroups[customerName].push(order);
    }

    const uniqueCustomers = Object.keys(customerGroups).length;
    const totalAmount = orders.reduce(
      (sum, o) => sum + (o.totalAmount || 0),
      0
    );

    res.json({
      message: `Found ${orders.length} order(s) for phone number: ${phone}`,
      phoneNumber: phone,
      normalizedPhone: normalizedPhone,
      totalOrders: orders.length,
      uniqueCustomers: uniqueCustomers,
      totalAmount: totalAmount,
      averageOrderAmount: totalAmount / orders.length,
      isSameCustomer: uniqueCustomers === 1,
      orders: orders.map((order) => ({
        orderNumber: order.orderNumber,
        timestamp: order.timestamp,
        customerName: order.customerInfo?.name,
        phone: order.customerInfo?.phone,
        cnNumber: order.customerInfo?.cnNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        agentName: order.agentName,
        itemsCount: order.items?.length || 0,
      })),
      customers: Object.keys(customerGroups).map((name) => ({
        name: name,
        orderCount: customerGroups[name].length,
        orders: customerGroups[name].map((o) => o.orderNumber),
      })),
    });
  } catch (error) {
    console.error("Check phone number duplicates error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
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
  checkPhoneNumberDuplicates,
  getApprovedSalesOrders,
  getPostOfficeOrders,
};
