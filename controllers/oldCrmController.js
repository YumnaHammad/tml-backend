const OldCRM = require('../models/OldCRM');
const Customer = require('../models/Customer');
const SalesOrder = require('../models/SalesOrder');

// Get all Old CRM activities
const getAllOldCRMActivities = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      activityType, 
      status, 
      priority,
      assignedTo,
      customerId,
      startDate,
      endDate,
      isActive
    } = req.query;

    // Build query
    let query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (activityType) {
      query.activityType = activityType;
    }

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    if (customerId) {
      query.customerId = customerId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.activityDate = {};
      if (startDate) {
        query.activityDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.activityDate.$lte = end;
      }
    }

    // Search filter
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const activities = await OldCRM.find(query)
      .populate('customerId', 'customerCode firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('relatedOrderId', 'orderNumber totalAmount status')
      .populate('relatedProductId', 'name sku')
      .sort({ activityDate: -1, createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await OldCRM.countDocuments(query);

    res.json({
      activities,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    });

  } catch (error) {
    console.error('Get Old CRM activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get Old CRM activity by ID
const getOldCRMActivityById = async (req, res) => {
  try {
    const { id } = req.params;

    const activity = await OldCRM.findById(id)
      .populate('customerId', 'customerCode firstName lastName email phone address')
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('relatedOrderId', 'orderNumber totalAmount status')
      .populate('relatedProductId', 'name sku');

    if (!activity) {
      return res.status(404).json({ error: 'Old CRM activity not found' });
    }

    res.json(activity);

  } catch (error) {
    console.error('Get Old CRM activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create new Old CRM activity
const createOldCRMActivity = async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      activityType,
      title,
      description,
      notes,
      status,
      priority,
      activityDate,
      dueDate,
      followUpDate,
      value,
      currency,
      assignedTo,
      tags,
      source,
      relatedOrderId,
      relatedProductId,
      outcome,
      metadata
    } = req.body;

    // Validate required fields
    if (!customerName || !customerPhone || !title || !activityType) {
      return res.status(400).json({ 
        error: 'Customer name, phone, title, and activity type are required' 
      });
    }

    // If customerId is provided, verify it exists
    if (customerId) {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
    }

    const activity = new OldCRM({
      customerId: customerId || null,
      customerName,
      customerEmail: customerEmail || null,
      customerPhone,
      activityType,
      title,
      description: description || null,
      notes: notes || null,
      status: status || 'new',
      priority: priority || 'medium',
      activityDate: activityDate ? new Date(activityDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      value: value || 0,
      currency: currency || 'PKR',
      assignedTo: assignedTo || null,
      tags: tags || [],
      source: source || 'other',
      relatedOrderId: relatedOrderId || null,
      relatedProductId: relatedProductId || null,
      outcome: outcome || 'pending',
      metadata: metadata || {},
      createdBy: req.user?._id || req.user?.id
    });

    await activity.save();

    // Populate before sending response
    await activity.populate([
      { path: 'customerId', select: 'customerCode firstName lastName email phone' },
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName email' }
    ]);

    res.status(201).json({
      message: 'Old CRM activity created successfully',
      activity
    });

  } catch (error) {
    console.error('Create Old CRM activity error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Update Old CRM activity
const updateOldCRMActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const activity = await OldCRM.findById(id);
    if (!activity) {
      return res.status(404).json({ error: 'Old CRM activity not found' });
    }

    // Handle date fields
    if (updateData.activityDate) {
      updateData.activityDate = new Date(updateData.activityDate);
    }
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    if (updateData.followUpDate) {
      updateData.followUpDate = new Date(updateData.followUpDate);
    }

    // If customerId is being updated, verify it exists
    if (updateData.customerId) {
      const customer = await Customer.findById(updateData.customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
    }

    Object.assign(activity, updateData);
    await activity.save();

    // Populate before sending response
    await activity.populate([
      { path: 'customerId', select: 'customerCode firstName lastName email phone' },
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'relatedOrderId', select: 'orderNumber totalAmount status' },
      { path: 'relatedProductId', select: 'name sku' }
    ]);

    res.json({
      message: 'Old CRM activity updated successfully',
      activity
    });

  } catch (error) {
    console.error('Update Old CRM activity error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// Delete Old CRM activity (soft delete by setting isActive to false)
const deleteOldCRMActivity = async (req, res) => {
  try {
    const { id } = req.params;

    const activity = await OldCRM.findById(id);
    if (!activity) {
      return res.status(404).json({ error: 'Old CRM activity not found' });
    }

    // Soft delete
    activity.isActive = false;
    await activity.save();

    res.json({ message: 'Old CRM activity deleted successfully' });

  } catch (error) {
    console.error('Delete Old CRM activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get Old CRM statistics/dashboard data
const getOldCRMStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateQuery = {};
    if (startDate || endDate) {
      dateQuery.activityDate = {};
      if (startDate) {
        dateQuery.activityDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.activityDate.$lte = end;
      }
    }

    const baseQuery = { isActive: true, ...dateQuery };

    // Get counts by activity type
    const activityTypeStats = await OldCRM.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$activityType', count: { $sum: 1 } } }
    ]);

    // Get counts by status
    const statusStats = await OldCRM.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get counts by priority
    const priorityStats = await OldCRM.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Get total value
    const valueStats = await OldCRM.aggregate([
      { $match: baseQuery },
      { $group: { _id: null, totalValue: { $sum: '$value' }, avgValue: { $avg: '$value' } } }
    ]);

    // Get overdue follow-ups
    const overdueCount = await OldCRM.countDocuments({
      ...baseQuery,
      followUpDate: { $lt: new Date() },
      status: { $nin: ['won', 'lost', 'closed', 'resolved'] }
    });

    // Get upcoming follow-ups (next 7 days)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const upcomingCount = await OldCRM.countDocuments({
      ...baseQuery,
      followUpDate: { $gte: new Date(), $lte: nextWeek },
      status: { $nin: ['won', 'lost', 'closed', 'resolved'] }
    });

    res.json({
      activityTypeStats: activityTypeStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      statusStats: statusStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      priorityStats: priorityStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      totalValue: valueStats[0]?.totalValue || 0,
      avgValue: valueStats[0]?.avgValue || 0,
      overdueFollowUps: overdueCount,
      upcomingFollowUps: upcomingCount
    });

  } catch (error) {
    console.error('Get Old CRM stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get activities by customer
const getOldCRMActivitiesByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const activities = await OldCRM.find({ 
      customerId,
      isActive: true 
    })
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('relatedOrderId', 'orderNumber totalAmount status')
      .sort({ activityDate: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await OldCRM.countDocuments({ customerId, isActive: true });

    res.json({
      activities,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    });

  } catch (error) {
    console.error('Get Old CRM activities by customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllOldCRMActivities,
  getOldCRMActivityById,
  createOldCRMActivity,
  updateOldCRMActivity,
  deleteOldCRMActivity,
  getOldCRMStats,
  getOldCRMActivitiesByCustomer
};

