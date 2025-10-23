const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Dispatch = sequelize.define('Dispatch', {
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
  status: {
    type: DataTypes.ENUM('pending', 'dispatched', 'delivered', 'returned'),
    defaultValue: 'pending'
  },
  dispatchedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  returnedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = Dispatch;