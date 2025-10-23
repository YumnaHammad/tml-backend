const { Dispatch, SalesOrder, SalesOrderItem, Variant, Inventory, Warehouse, StockMovement } = require('../models');

// Update dispatch status
const updateDispatchStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const dispatch = await Dispatch.findByPk(id, {
      include: [
        {
          model: SalesOrder,
          as: 'salesOrder',
          include: [
            {
              model: SalesOrderItem,
              as: 'items',
              include: [
                {
                  model: Variant,
                  as: 'variant'
                }
              ]
            }
          ]
        }
      ]
    });

    if (!dispatch) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    const validStatuses = ['pending', 'dispatched', 'delivered', 'returned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Update dispatch status
    const updateData = { status };
    
    if (status === 'dispatched' && dispatch.status === 'pending') {
      updateData.dispatchedAt = new Date();
      
      // Move items from reserved to delivered in warehouse
      const warehouses = await Warehouse.find({ isActive: true });
      
      for (const item of dispatch.salesOrder.items) {
        const itemProductId = item.productId;
        let quantityToMove = item.quantity;
        
        for (const warehouse of warehouses) {
          if (quantityToMove <= 0) break;
          
          const stockItem = warehouse.currentStock.find(stock => 
            stock.productId.toString() === itemProductId.toString() &&
            (stock.variantId || null) === (item.variantId || null)
          );
          
          if (stockItem && stockItem.reservedQuantity > 0) {
            const moveQty = Math.min(stockItem.reservedQuantity, quantityToMove);
            
            // Move from reserved to delivered
            stockItem.reservedQuantity -= moveQty;
            
            // Add to delivered quantity
            if (!stockItem.deliveredQuantity) {
              stockItem.deliveredQuantity = 0;
            }
            stockItem.deliveredQuantity += moveQty;
            
            quantityToMove -= moveQty;
            
            await warehouse.save();
            
            // Create stock movement record
            const stockMovement = new StockMovement({
              productId: itemProductId,
              warehouseId: warehouse._id,
              movementType: 'out',
              quantity: moveQty,
              previousQuantity: stockItem.quantity,
              newQuantity: stockItem.quantity,
              referenceType: 'sales_order',
              referenceId: dispatch.salesOrder.id,
              notes: `Dispatched via dispatch ${dispatch._id} - moved from reserved to delivered`,
              createdBy: req.user?._id
            });
            await stockMovement.save();
          }
        }
      }
    } else if (status === 'delivered' && dispatch.status === 'dispatched') {
      updateData.deliveredAt = new Date();
    } else if (status === 'returned') {
      updateData.returnedAt = new Date();
      
      // Increase inventory for returned items
      for (const item of dispatch.salesOrder.items) {
        const inventory = await Inventory.findOne({
          where: { variantId: item.variantId }
        });

        if (inventory) {
          inventory.quantity += item.quantity;
          await inventory.save();
        } else {
          await Inventory.create({
            variantId: item.variantId,
            quantity: item.quantity
          });
        }
      }
    }

    await dispatch.update(updateData);

    res.json({
      message: 'Dispatch status updated successfully',
      dispatch
    });
  } catch (error) {
    console.error('Error updating dispatch status:', error);
    res.status(500).json({ error: 'Failed to update dispatch status' });
  }
};

// Get all dispatches
const getAllDispatches = async (req, res) => {
  try {
    const dispatches = await Dispatch.findAll({
      include: [
        {
          model: SalesOrder,
          as: 'salesOrder',
          include: [
            {
              model: require('../models').User,
              as: 'creator',
              attributes: ['id', 'name', 'email']
            },
            {
              model: SalesOrderItem,
              as: 'items',
              include: [
                {
                  model: Variant,
                  as: 'variant',
                  include: [
                    {
                      model: require('../models').Product,
                      as: 'product'
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(dispatches);
  } catch (error) {
    console.error('Error fetching dispatches:', error);
    res.status(500).json({ error: 'Failed to fetch dispatches' });
  }
};

// Get dispatch by ID
const getDispatchById = async (req, res) => {
  const { id } = req.params;

  try {
    const dispatch = await Dispatch.findByPk(id, {
      include: [
        {
          model: SalesOrder,
          as: 'salesOrder',
          include: [
            {
              model: require('../models').User,
              as: 'creator',
              attributes: ['id', 'name', 'email']
            },
            {
              model: SalesOrderItem,
              as: 'items',
              include: [
                {
                  model: Variant,
                  as: 'variant',
                  include: [
                    {
                      model: require('../models').Product,
                      as: 'product'
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    if (!dispatch) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    res.json(dispatch);
  } catch (error) {
    console.error('Error fetching dispatch:', error);
    res.status(500).json({ error: 'Failed to fetch dispatch' });
  }
};

module.exports = {
  updateDispatchStatus,
  getAllDispatches,
  getDispatchById
};