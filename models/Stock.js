const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Stock = sequelize.define('Stock', {
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
  warehouseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Warehouses',
      key: 'id'
    }
  },
  actualStock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  reservedStock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  projectedStock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['productId', 'warehouseId']
    }
  ]
});

module.exports = Stock;
