import db from "./src/db.js";

async function testConnection() {
    try {
        const connection = await db.getConnection();
        console.log("✅ MySQL Connected successfully to", connection.config.database);
        connection.release();
    } catch (err) {
        console.error("❌ MySQL Connection Failed:", err);
    } finally {
        process.exit();
    }
}

testConnection();
