const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductLifecycle = sequelize.define('ProductLifecycle', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Products',
      key: 'id'
    }
  },
  stage: {
    type: DataTypes.ENUM('Created', 'Purchased', 'Stored', 'Sold', 'Returned', 'Current Stock'),
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  referenceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to PurchaseOrder, SalesOrder, or other related record'
  },
  referenceType: {
    type: DataTypes.ENUM('PurchaseOrder', 'SalesOrder', 'Return', 'Adjustment'),
    allowNull: true
  },
  warehouseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Warehouses',
      key: 'id'
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  createdAt: 'createdDateTime',
  updatedAt: 'updatedDateTime'
});

module.exports = ProductLifecycle;
