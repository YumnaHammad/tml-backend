const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Inventory = sequelize.define('Inventory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
    allowNull: false,
    defaultValue: 0
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['variantId']
    }
  ]
});

module.exports = Inventory;
