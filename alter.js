import sequelize from "./config/db.js";

async function run() {
  try {
    console.log("Checking columns first...");
    const [results] = await sequelize.query("SHOW COLUMNS FROM sale_order_history");
    const hasOrderStatus = results.some(col => col.Field === 'order_history');
    
    if (!hasOrderStatus) {
      console.log("Adding order_status column...");
      await sequelize.query("ALTER TABLE sale_order_history ADD COLUMN order_status VARCHAR(255) NOT NULL DEFAULT 'Pending'");
      console.log("Column added successfully!");
    } else {
      console.log("order_status column already exists.");
    }
  } catch (err) {
    console.error("Error executing alter query:", err);
  } finally {
    await sequelize.close();
  }
}

run();
