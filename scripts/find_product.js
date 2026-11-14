import db from '../config/db.js';

async function check() {
  const [res] = await db.query("SELECT id, product_name FROM products WHERE product_name LIKE '%Slim-Fit%' OR product_name LIKE '%Black%' LIMIT 5");
  console.log("Matching products:", res);
  process.exit(0);
}

check().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

