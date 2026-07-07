'use strict';

export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn("messages", "chatType", {
    type: Sequelize.ENUM("vendor", "customer", "admin"),
    allowNull: false,
    defaultValue: "vendor",
  });
}

// export async function down(queryInterface) {
//   await queryInterface.removeColumn("messages", "chatType");
// }