const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Variant = sequelize.define('Variant', {
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
  sku: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  attributes: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  priceOverride: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  }
});

module.exports = Variant;
