import { redisClient } from "../redis/redisClient.js";
import SaleOrderHistory from "../../models/SaleOrderHistory.js";
import SaleOrder from "../../models/SaleOrder.js";
import { emitToAll } from "../sockets/socket.js";
import sequelize from "../../config/db.js";
import { QueryTypes } from "sequelize";

const ENUM_MAPPING = {
  'pending': 'Pending',
  'placed': 'Pending',
  'order accepted': 'Pending',
  'approved': 'Approved',
  'ready to ship': 'Ready_to_Ship',
  'ready_to_ship': 'Ready_to_Ship',
  'dispatched': 'Dispatched',
  'decline order': 'Decline_Order',
  'decline_order': 'Decline_Order',
  'declined': 'Decline_Order',
  'material_procurement': 'material_procurement',
  'material procurement': 'material_procurement',
  'design_approved': 'Design_Approved',
  'design approved': 'Design_Approved',
  'production_started': 'Production_Started',
  'production started': 'Production_Started'
};

const INT_TO_ENUM = {
  0: 'Pending',
  1: 'Approved',
  2: 'Ready_to_Ship',
  3: 'Dispatched',
  4: 'Decline_Order',
  7: 'material_procurement',
  8: 'Design_Approved',
  9: 'Production_Started'
};

const STATUS_TO_INT = {
  'Pending': 0,
  'Approved': 1,
  'Ready_to_Ship': 2,
  'Dispatched': 3,
  'Decline_Order': 4,
  'Delivered': 5,
  'material_procurement': 7,
  'Design_Approved': 8,
  'Production_Started': 9
};

export const resolveOrderHistoryEnum = (status) => {
  if (status === undefined || status === null) {
    return 'Pending';
  }

  // If it's a number or numeric string, map it using INT_TO_ENUM
  if (typeof status === 'number' || (typeof status === 'string' && status.trim() !== '' && !isNaN(Number(status)))) {
    const intVal = Number(status);
    if (INT_TO_ENUM[intVal] !== undefined) {
      return INT_TO_ENUM[intVal];
    }
  }

  // Normalize string
  if (typeof status === 'string') {
    const normalized = status.trim().toLowerCase();
    if (ENUM_MAPPING[normalized] !== undefined) {
      return ENUM_MAPPING[normalized];
    }
  }

  // Fallback
  return 'Pending';
};

export const getOrderById = async (req, res) => {
  const { id } = req.params;

  const order = {
    id,
    amount: 500,
    status: "created",
    time: new Date().toISOString(),
  };

  // publish the order
  await redisClient.publish("order-list", JSON.stringify(order));

  return res.json(order);
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id, order_history, cancel_remark } = req.body;

    if (!id || order_history === undefined) {
      return res.status(400).json({ error: "Missing id or order_status in request body" });
    }

    const resolvedEnum = resolveOrderHistoryEnum(order_history);

    // 1. Create the history record in sale_order_history table
    const newRecord = await SaleOrderHistory.create({
      sale_order_id: id,
      order_history: resolvedEnum,
      remarks: cancel_remark || null
    });

    console.log("Saved status update to DB (history):", newRecord.toJSON());

    // 2. Update the main sale_order table
    const [updatedCount] = await SaleOrder.update(
      {
        order_history: resolvedEnum,
        ...(resolvedEnum === 'Decline_Order' && { cancel_remark: cancel_remark || null })
      },
      {
        where: { id: id }
      }
    );

    console.log(`Updated sale_order status for id ${id} to ${resolvedEnum} (count: ${updatedCount})`);

    // 3. Update the main orders table
    const saleOrderRecord = await SaleOrder.findByPk(id);
    if (saleOrderRecord && saleOrderRecord.order_id) {
      await sequelize.query(
        `UPDATE orders SET order_history = ?, decline_remarks = ? WHERE order_id = ?`,
        {
          replacements: [
            resolvedEnum,
            resolvedEnum === 'Decline_Order' ? (cancel_remark || null) : null,
            String(saleOrderRecord.order_id)
          ],
          type: QueryTypes.UPDATE
        }
      );
      console.log(`Updated orders table status for order_id ${saleOrderRecord.order_id} to ${resolvedEnum}`);
    }

    // Emit socket event to notify all connected clients
    emitToAll("order-status-updated", {
      id: id,
      order_history: resolvedEnum,
      remarks: cancel_remark || null
    });

    return res.json({
      success: true,
      message: "Order status update recorded successfully",
      data: newRecord
    });

  } catch (error) {
    console.error("Error updating order status in DB:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
