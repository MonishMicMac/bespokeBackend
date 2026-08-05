import sequelize from "./config/db.js";
import { QueryTypes } from "sequelize";
import { updateOrderStatus } from "./src/controllers/orderController.js";
import { saleOrderController } from "./src/controllers/saleOrderController.js";

async function verify() {
  try {
    console.log("🔍 Checking initial state of sale_order 391 and corresponding orders row:");
    const initialSaleOrder = await sequelize.query("SELECT id, order_id, order_history FROM sale_order WHERE id = 391", { type: QueryTypes.SELECT });
    console.log("Initial sale_order 391:", initialSaleOrder);

    const initialOrder = await sequelize.query("SELECT id, order_id, order_history, decline_remarks FROM orders WHERE order_id = '264'", { type: QueryTypes.SELECT });
    console.log("Initial orders status (order_id 264):", initialOrder);

    console.log("\n🚀 Testing updateOrderStatus (from orderController)...");
    const reqMock = {
      body: {
        id: 391,
        order_history: "Approved",
        cancel_remark: "Approved testing remark"
      }
    };
    
    let resJsonData = null;
    const resMock = {
      status: function(code) {
        console.log("res.status called with:", code);
        return this;
      },
      json: function(data) {
        resJsonData = data;
        return this;
      }
    };

    await updateOrderStatus(reqMock, resMock);
    console.log("Response from updateOrderStatus:", resJsonData);

    console.log("\n🔍 Checking DB state after updateOrderStatus:");
    const updatedSaleOrder1 = await sequelize.query("SELECT id, order_id, order_history FROM sale_order WHERE id = 391", { type: QueryTypes.SELECT });
    console.log("Updated sale_order 391:", updatedSaleOrder1);

    const updatedOrder1 = await sequelize.query("SELECT id, order_id, order_history, decline_remarks FROM orders WHERE order_id = '264'", { type: QueryTypes.SELECT });
    console.log("Updated orders status (order_id 264):", updatedOrder1);

    console.log("\n🚀 Testing saleOrderController (from saleOrderController)...");
    const reqMock2 = {
      body: {
        id: 391,
        order_history: "Ready_to_Ship"
      }
    };
    let resJsonData2 = null;
    const resMock2 = {
      status: function(code) {
        console.log("res2.status called with:", code);
        return this;
      },
      json: function(data) {
        resJsonData2 = data;
        return this;
      }
    };

    await saleOrderController(reqMock2, resMock2);
    console.log("Response from saleOrderController:", resJsonData2);

    console.log("\n🔍 Checking DB state after saleOrderController:");
    const updatedSaleOrder2 = await sequelize.query("SELECT id, order_id, order_history FROM sale_order WHERE id = 391", { type: QueryTypes.SELECT });
    console.log("Updated sale_order 391:", updatedSaleOrder2);

    const updatedOrder2 = await sequelize.query("SELECT id, order_id, order_history, decline_remarks FROM orders WHERE order_id = '264'", { type: QueryTypes.SELECT });
    console.log("Updated orders status (order_id 264):", updatedOrder2);

    // Clean up/Reset back to original status if needed (we'll set it back to Dispatched)
    console.log("\n🧹 Resetting DB state back to original status ('Dispatched')...");
    await sequelize.query("UPDATE sale_order SET order_history = 'Dispatched' WHERE id = 391");
    await sequelize.query("UPDATE orders SET order_history = 'Dispatched' WHERE order_id = '264'");
    console.log("✅ DB reset completed.");

  } catch (err) {
    console.error("❌ Verification Failed with error:", err);
  } finally {
    await sequelize.close();
  }
}

verify();
