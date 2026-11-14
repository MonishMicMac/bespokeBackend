import db from '../config/db.js';
import { SaleOrder, Order } from '../models/setupAssociations.js';

async function testResolution() {
  for (const uid of [26, 76]) {
    const matching = await SaleOrder.findOne({
      where: { product_id: 417 },
      include: [
        {
          association: 'order',
          where: { user_id: uid },
        },
      ],
      order: [['id', 'DESC']],
    });
    console.log(`Resolution for user ${uid} and product 417:`, matching ? `Found sale_order_id: ${matching.id}` : 'NOT FOUND');
  }
  process.exit(0);
}

testResolution().catch(e => {
  console.error(e);
  process.exit(1);
});

