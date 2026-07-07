import sequelize from "./config/db.js";
import { QueryTypes } from "sequelize";

async function forceSync() {
  try {
    console.log("🧹 Clearing non-JSON values from deletedmsges...");
    await sequelize.query("UPDATE messages SET deletedmsges = NULL", { type: QueryTypes.UPDATE });
    console.log("✅ Cleared.");

    // Now import models/index.js which will execute Message.sync({ alter: true })
    console.log("🔄 Importing model to trigger sync...");
    const { default: Message } = await import("./models/index.js");
    
    const columns = await sequelize.query("DESCRIBE messages", { type: QueryTypes.SELECT });
    console.log("Columns in messages table:");
    console.table(columns);
  } catch (err) {
    console.error("❌ Error during forced sync:", err);
  } finally {
    await sequelize.close();
  }
}

forceSync();
