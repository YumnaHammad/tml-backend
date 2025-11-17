const { PostExOrder } = require("../models");
const { createAuditLog } = require("../middleware/audit");
const axios = require("axios");

// Create a new PostEx order
const createPostExOrder = async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      createdBy: req.user?.id || null
    };

    const postExOrder = new PostExOrder(orderData);
    await postExOrder.save();

    // Create audit log
    if (req.user) {
      await createAuditLog({
        userId: req.user.id,
        action: 'CREATE',
        entityType: 'PostExOrder',
        entityId: postExOrder._id,
        details: `Created PostEx order: ${postExOrder.orderReferenceNumber}`
      });
    }

    res.status(201).json({
      success: true,
      message: 'PostEx order created successfully',
      order: postExOrder
    });
  } catch (error) {
    console.error('Create PostEx order error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
};

// Get all PostEx orders
const getAllPostExOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    // Build query
    let query = {};
    
    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { orderReferenceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerContact: { $regex: search, $options: 'i' } }
      ];
    }

    // Convert limit and page to numbers
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));

    const orders = await PostExOrder.find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await PostExOrder.countDocuments(query);

    res.json({
      success: true,
      orders,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    });
  } catch (error) {
    console.error('Get PostEx orders error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

// Get PostEx order by ID
const getPostExOrderById = async (req, res) => {
  try {
    const order = await PostExOrder.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'PostEx order not found' 
      });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Get PostEx order error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

// Update PostEx order status
const updatePostExOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'submitted', 'in_transit', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid status' 
      });
    }

    const order = await PostExOrder.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('createdBy', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'PostEx order not found' 
      });
    }

    // Create audit log
    if (req.user) {
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE',
        entityType: 'PostExOrder',
        entityId: order._id,
        details: `Updated PostEx order status to: ${status}`
      });
    }

    res.json({
      success: true,
      message: 'PostEx order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update PostEx order status error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

// Delete PostEx order
const deletePostExOrder = async (req, res) => {
  try {
    const order = await PostExOrder.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'PostEx order not found' 
      });
    }

    // Create audit log
    if (req.user) {
      await createAuditLog({
        userId: req.user.id,
        action: 'DELETE',
        entityType: 'PostExOrder',
        entityId: order._id,
        details: `Deleted PostEx order: ${order.orderReferenceNumber}`
      });
    }

    res.json({
      success: true,
      message: 'PostEx order deleted successfully'
    });
  } catch (error) {
    console.error('Delete PostEx order error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

// Fetch orders from PostEx API
const fetchPostExOrdersFromAPI = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "Both startDate and endDate are required (format: YYYY-MM-DD)"
      });
    }

    // PostEx API Configuration
    const POSTEX_API_TOKEN = "ZThkODBkYzg4NjBkNDE0YzgxOWUxZGZkM2U0YjNjYjc6ZDk2ZjE5NjBjNzU2NDk3MThmZDc2MmExYTgyYWY5MmY=";
    const POSTEX_API_BASE_URL = "https://api.postex.pk/services/integration/api/order";

    // Create axios instance for PostEx API
    const postExApi = axios.create({
      baseURL: POSTEX_API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const config = {
      headers: {
        token: POSTEX_API_TOKEN,
        "Content-Type": "application/json",
      },
    };

    console.log("Fetching orders from PostEx API with dates:", { startDate, endDate });

    let response;

    // Try GET first with query parameters
    try {
      const params = new URLSearchParams({
        startDate: startDate,
        endDate: endDate
      });
      response = await postExApi.get(`/v1/get-all-order?${params.toString()}`, config);
      console.log("Success with GET method");
    } catch (getError) {
      console.log("GET failed, trying POST...", getError.response?.status, getError.response?.data);
      
      // If GET fails, try POST with dates in request body
      const requestBody = {
        startDate: startDate,
        endDate: endDate
      };
      response = await postExApi.post("/v1/get-all-order", requestBody, config);
      console.log("Success with POST method");
    }

    // Handle different response formats
    let ordersData = [];
    if (response.data && Array.isArray(response.data)) {
      ordersData = response.data;
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      ordersData = response.data.data;
    } else if (response.data?.orders && Array.isArray(response.data.orders)) {
      ordersData = response.data.orders;
    } else if (response.data?.result && Array.isArray(response.data.result)) {
      ordersData = response.data.result;
    }

    res.json({
      success: true,
      orders: ordersData,
      total: ordersData.length,
      message: "Orders fetched successfully from PostEx API"
    });
  } catch (error) {
    console.error("Error fetching PostEx orders from API:", error);
    
    if (error.response) {
      const errorData = error.response.data;
      const errorMessage = errorData?.statusMessage || 
                         errorData?.message || 
                         errorData?.error ||
                         `PostEx API error: ${error.response.status}`;
      
      return res.status(error.response.status || 500).json({
        success: false,
        error: errorMessage,
        details: errorData
      });
    } else if (error.request) {
      return res.status(503).json({
        success: false,
        error: "No response from PostEx API. Please check your connection."
      });
    } else {
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error"
      });
    }
  }
};

module.exports = {
  createPostExOrder,
  getAllPostExOrders,
  getPostExOrderById,
  updatePostExOrderStatus,
  deletePostExOrder,
  fetchPostExOrdersFromAPI
};



