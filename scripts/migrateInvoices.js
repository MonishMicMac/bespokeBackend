import sequelize from '../config/db.js';

async function runMigration() {
  console.log('📦 Starting invoice system database migration...');

  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database.');

    // 1. Create invoices table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`invoices\` (
        \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`invoice_number\` VARCHAR(100) NOT NULL,
        \`order_id\` BIGINT UNSIGNED NOT NULL,
        \`sale_order_id\` BIGINT UNSIGNED NULL,
        \`seller_id\` BIGINT UNSIGNED NULL,
        \`seller_type\` ENUM('vendor', 'platform') NOT NULL DEFAULT 'vendor',
        \`invoice_type\` VARCHAR(50) NOT NULL DEFAULT 'TAX_INVOICE',
        \`document_title\` VARCHAR(100) NOT NULL DEFAULT 'TAX INVOICE',
        \`invoice_date\` DATETIME NOT NULL,
        \`financial_year\` VARCHAR(20) NOT NULL,
        \`place_of_supply\` VARCHAR(100) NOT NULL,
        \`reverse_charge\` TINYINT(1) NOT NULL DEFAULT 0,
        
        \`seller_name_snapshot\` VARCHAR(255) NOT NULL,
        \`seller_shop_name_snapshot\` VARCHAR(255) NULL,
        \`seller_gstin_snapshot\` VARCHAR(50) NULL,
        \`seller_pan_snapshot\` VARCHAR(50) NULL,
        \`seller_email_snapshot\` VARCHAR(255) NULL,
        \`seller_phone_snapshot\` VARCHAR(50) NULL,
        \`seller_state_snapshot\` VARCHAR(100) NULL,
        \`seller_state_code_snapshot\` VARCHAR(10) NULL,
        \`shipping_from_snapshot\` JSON NOT NULL,
        
        \`customer_name_snapshot\` VARCHAR(255) NOT NULL,
        \`delivered_to_snapshot\` JSON NOT NULL,
        \`billing_address_snapshot\` JSON NOT NULL,
        
        \`payment_method\` VARCHAR(100) NULL,
        \`payment_transaction_id\` VARCHAR(255) NULL,
        \`payment_id\` VARCHAR(255) NULL,
        \`payment_status\` VARCHAR(50) NOT NULL DEFAULT 'PAID',
        \`payment_date\` DATETIME NULL,
        
        \`subtotal\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`discount_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`coupon_discount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`taxable_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`cgst_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`sgst_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`igst_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`shipping_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`shipping_tax_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`rounding_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`grand_total\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`refund_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        
        \`status\` ENUM('ISSUED', 'CANCELLED', 'ADJUSTED') NOT NULL DEFAULT 'ISSUED',
        \`pdf_path\` VARCHAR(500) NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE KEY \`uk_invoice_number\` (\`invoice_number\`),
        UNIQUE KEY \`uk_order_seller\` (\`order_id\`, \`seller_id\`, \`seller_type\`),
        INDEX \`idx_invoices_order_id\` (\`order_id\`),
        INDEX \`idx_invoices_seller\` (\`seller_id\`, \`seller_type\`),
        INDEX \`idx_invoices_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ `invoices` table created or already exists.');

    // 2. Create invoice_items table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`invoice_items\` (
        \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`invoice_id\` BIGINT UNSIGNED NOT NULL,
        \`sale_order_id\` BIGINT UNSIGNED NULL,
        \`product_id\` BIGINT UNSIGNED NULL,
        \`product_name_snapshot\` VARCHAR(255) NOT NULL,
        \`hsn_code\` VARCHAR(50) NULL,
        \`variant_snapshot\` VARCHAR(255) NULL,
        \`customization_details\` JSON NULL,
        \`quantity\` INT UNSIGNED NOT NULL DEFAULT 1,
        \`unit_price\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`discount_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`taxable_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`gst_rate\` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        \`cgst_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`sgst_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`igst_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`total_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX \`idx_invoice_items_invoice_id\` (\`invoice_id\`),
        INDEX \`idx_invoice_items_sale_order_id\` (\`sale_order_id\`),
        CONSTRAINT \`fk_invoice_items_invoice\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ `invoice_items` table created or already exists.');

    // 3. Create invoice_adjustments table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`invoice_adjustments\` (
        \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`credit_note_number\` VARCHAR(100) NOT NULL,
        \`invoice_id\` BIGINT UNSIGNED NOT NULL,
        \`sale_order_id\` BIGINT UNSIGNED NULL,
        \`refund_id\` BIGINT UNSIGNED NULL,
        \`adjustment_type\` ENUM('REFUND', 'RETURN', 'CANCELLATION') NOT NULL DEFAULT 'REFUND',
        \`adjustment_date\` DATETIME NOT NULL,
        \`reason\` TEXT NULL,
        \`taxable_adjustment\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`cgst_adjustment\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`sgst_adjustment\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`igst_adjustment\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`total_refund_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`pdf_path\` VARCHAR(500) NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE KEY \`uk_credit_note_number\` (\`credit_note_number\`),
        INDEX \`idx_adjustments_invoice_id\` (\`invoice_id\`),
        CONSTRAINT \`fk_invoice_adjustments_invoice\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ `invoice_adjustments` table created or already exists.');

    console.log('🎉 Invoice system migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

runMigration();

