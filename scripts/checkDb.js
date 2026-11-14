import sequelize from '../config/db.js';

async function check() {
  const [cats] = await sequelize.query("SELECT * FROM categories WHERE name LIKE '%women%' OR name LIKE '%All%'");
  console.log('Categories matching:', cats);

  const [subs] = await sequelize.query("SELECT * FROM subcategories WHERE name LIKE '%women%' OR name LIKE '%All%'");
  console.log('Subcategories matching:', subs);

  const [allSubs] = await sequelize.query("SELECT id, name, category_type, category_id, action FROM subcategories WHERE action = '0'");
  console.log('Active subcategories count:', allSubs.length);
  const womenSubs = allSubs.filter(s => String(s.category_type) === '2');
  console.log('Active category_type=2 count:', womenSubs.length);
  console.log('Active category_type=2 names:', womenSubs.map(s => s.name));
}
check().then(() => sequelize.close()).catch(console.error);
