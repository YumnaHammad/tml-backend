const express = require('express');
const { Customer } = require('../models');

const router = express.Router();

// Public routes (no auth required for testing)

// Get all customers
const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    
    // Show all customers by default, allow filtering by isActive
    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { customerCode: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Customer.countDocuments(query);

    res.json({
      customers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get customer by ID
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);

  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create new customer
const createCustomer = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      creditLimit,
      paymentTerms
    } = req.body;

    // Check if customer with email already exists
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this email already exists' });
    }

    const customer = new Customer({
      firstName,
      lastName,
      email,
      phone,
      address,
      creditLimit: creditLimit || 0,
      paymentTerms: paymentTerms || 'net_30',
      createdBy: req.user._id
    });

    await customer.save();

    res.status(201).json({
      message: 'Customer created successfully',
      customer
    });

  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update customer
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check email uniqueness if email is being updated
    if (updateData.email && updateData.email !== customer.email) {
      const existingCustomer = await Customer.findOne({ email: updateData.email });
      if (existingCustomer) {
        return res.status(400).json({ error: 'Customer with this email already exists' });
      }
    }

    Object.assign(customer, updateData);
    await customer.save();

    res.json({
      message: 'Customer updated successfully',
      customer
    });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete customer (hard delete)
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer has any sales orders
    const { SalesOrder } = require('../models');
    const salesCount = await SalesOrder.countDocuments({ 'customerInfo.email': customer.email });
    if (salesCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete customer with existing sales history' 
      });
    }

    // Hard delete
    await Customer.findByIdAndDelete(id);

    res.json({ message: 'Customer deleted successfully' });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Public routes (authenticated users)
router.get('/', getAllCustomers);
router.get('/:id', getCustomerById);

// Public routes (no auth required for testing)
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

module.exports = router;
