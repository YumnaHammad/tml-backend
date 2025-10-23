const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SalesOrderItem = sequelize.define('SalesOrderItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  salesOrderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'SalesOrders',
      key: 'id'
    }
  },
  variantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Variants',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
});

module.exports = SalesOrderItem;
