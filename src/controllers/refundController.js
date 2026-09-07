import sequelize from "../../config/db.js";
import { QueryTypes } from "sequelize";
import { processRefund } from "../services/refundService.js";

export const refundOrder = async (req, res) => {
    try {
        console.log("Refund request received body:", req.body);

        const incomingId = req.body.order_id || req.body.id || req.body.sale_order_id;
        const reason = req.body.reason || req.body.cancel_remark || "Vendor initiated refund";
        console.log(incomingId);

        if (!incomingId) {
            return res.status(400).json({
                status: "failed",
                message: "order_id is required in request body",
            });
        }

        let sale_order_id;
        let order_id;
        let refundAmount;
        let paymentId;
        let user_id;

       
        const saleOrders = await sequelize.query(
            `
            SELECT
                id,
                order_id,
                amount,
                total_amount,
                vendor_id
            FROM sale_order
            WHERE  id = ? 
            LIMIT 1
            `,
            {
                replacements: [incomingId, incomingId, incomingId],
                type: QueryTypes.SELECT,
            }
        );


        if (!saleOrders || saleOrders.length === 0) {
            return res.status(404).json({
                status: "failed",
                message: `Sale order not found for id: ${incomingId}`,
            });
        }

        const saleOrder = saleOrders[0];
        console.log("Sale Order found:", saleOrder);


        sale_order_id = saleOrder.id;
        order_id = saleOrder.order_id;
        const rawAmount = req.body.amount || saleOrder.total_amount || saleOrder.amount || 0;
        refundAmount = Number(rawAmount);

       
        if (!refundAmount || refundAmount <= 0) {
            return res.status(400).json({
                status: "failed",
                message: "Refund amount not found or invalid in sale_order",
            });
        }


        
        const orders = await sequelize.query(
            `
            SELECT
                id,
                order_id,
                payment_id,
                transaction_id,
                user_id
            FROM orders
            WHERE id = ? 
            LIMIT 1
            `,
            {
                replacements: [order_id, String(order_id)],
                type: QueryTypes.SELECT,
            }
        );

        if (!orders || orders.length === 0) {
            return res.status(404).json({
                status: "failed",
                message: `Order not found in orders table for id: ${order_id}`,
            });
        }

        const order = orders[0];
        console.log("Orders record found:", order);

       
        paymentId = order.payment_id || order.transaction_id || null;
        user_id = order.user_id || null;

        if (!paymentId) {
            return res.status(400).json({
                status: "failed",
                message: `Payment ID not found for order: ${order_id}`,
            });
        }


        const razorpayRefund = await processRefund({
            paymentId,
            amount: refundAmount,
            orderId: order_id,
        });

        console.log("Razorpay refund response:", razorpayRefund);

        const [insertId] = await sequelize.query(
            `
            INSERT INTO refunds
            (
                sale_order_id,
                order_id,
                user_id,
                amount,
                refund_status,
                reason,
                transaction_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            {
                replacements: [
                    sale_order_id,
                    order_id,
                    user_id,
                    refundAmount,
                    razorpayRefund.status || "processed",
                    reason,
                    razorpayRefund.id || null,
                ],
                type: QueryTypes.INSERT,
            }
        );

        await sequelize.query(
            `
            UPDATE sale_order
            SET
                order_history = 'Decline_Order',
                cancel_remark = ?,
                cancelled_at = NOW()
            WHERE id = ?
            `,
            {
                replacements: [reason, sale_order_id],
                type: QueryTypes.UPDATE,
            }
        );

        await sequelize.query(
            `
            UPDATE orders
            SET
                order_history = 'Decline_Order',
                decline_remarks = ?
            WHERE id = ? OR order_id = ?
            `,
            {
                replacements: [reason, order_id, String(order_id)],
                type: QueryTypes.UPDATE,
            }
        );

        return res.status(200).json({
            status: "success",
            message: "Refund processed successfully",
            data: {
                refund_id: insertId,
                sale_order_id,
                order_id,
                payment_id: razorpayRefund.payment_id,
                razorpay_refund_id: razorpayRefund.id,
                amount: refundAmount,
                refund_status: razorpayRefund.status,
            },
        });

    } catch (error) {
        console.error("Refund error full details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        const detailedMessage = error?.error?.description || error?.description || error?.message || "Refund failed";

        return res.status(500).json({
            status: "failed",
            message: detailedMessage,
            error: error?.error || error,
        });
    }
};