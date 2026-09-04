import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { pool } from './pool.js';
dotenv.config();

const PRODUCTS = [
  { sku: 'HYDR-HA-SERUM-30', name: 'HYDR Hyaluronic Acid Serum', category: 'Serum', description: 'Lightweight multi-molecular hyaluronic acid serum that pulls moisture into skin and plumps fine lines. Fragrance-free.', price: 599, cost: 210, stock: 40, skin_type: 'all', concerns: ['hydration', 'fine lines'] },
  { sku: 'HYDR-VITC-SERUM-30', name: 'HYDR Vitamin C Serum 15%', category: 'Serum', description: '15% stabilized vitamin C with ferulic acid to brighten dullness and fade dark spots. Best used in the morning.', price: 699, cost: 260, stock: 35, skin_type: 'all', concerns: ['dullness', 'dark spots', 'brightening'] },
  { sku: 'HYDR-NIACIN-SERUM-30', name: 'HYDR Niacinamide 10% + Zinc Serum', category: 'Serum', description: '10% niacinamide with zinc to control oil, minimize the look of pores, and calm breakouts.', price: 549, cost: 190, stock: 50, skin_type: 'oily', concerns: ['acne', 'oil control', 'pores'] },
  { sku: 'HYDR-RETINOL-SERUM-30', name: 'HYDR Retinol 0.3% Renewal Serum', category: 'Serum', description: 'Encapsulated retinol for gentler nightly renewal, smoother texture and reduced fine lines over time.', price: 899, cost: 340, stock: 20, skin_type: 'all', concerns: ['fine lines', 'texture', 'anti-aging'] },
  { sku: 'HYDR-CICA-CREAM-50', name: 'HYDR Cica Repair Moisturizer', category: 'Moisturizer', description: 'Centella asiatica rich barrier-repair cream for sensitive, irritated or post-procedure skin.', price: 649, cost: 230, stock: 45, skin_type: 'sensitive', concerns: ['redness', 'barrier repair', 'hydration'] },
  { sku: 'HYDR-GEL-MOIST-50', name: 'HYDR Oil-Free Gel Moisturizer', category: 'Moisturizer', description: 'Water-based, non-comedogenic gel moisturizer that hydrates without adding shine.', price: 499, cost: 170, stock: 60, skin_type: 'oily', concerns: ['hydration', 'oil control'] },
  { sku: 'HYDR-RICH-CREAM-50', name: 'HYDR Deep Nourish Rich Cream', category: 'Moisturizer', description: 'Ceramide-rich, heavier cream for very dry or mature skin, locks in moisture overnight.', price: 749, cost: 280, stock: 30, skin_type: 'dry', concerns: ['dryness', 'barrier repair'] },
  { sku: 'HYDR-CLEANSER-GEL-100', name: 'HYDR Gentle Foaming Cleanser', category: 'Cleanser', description: 'Sulfate-free foaming cleanser that removes oil and makeup without stripping the skin barrier.', price: 399, cost: 130, stock: 70, skin_type: 'all', concerns: ['cleansing'] },
  { sku: 'HYDR-CLEANSER-OIL-100', name: 'HYDR Cleansing Balm', category: 'Cleanser', description: 'Melting balm-to-oil cleanser for the first step of double cleansing, dissolves SPF and makeup.', price: 549, cost: 200, stock: 25, skin_type: 'all', concerns: ['cleansing', 'makeup removal'] },
  { sku: 'HYDR-SPF50-50', name: 'HYDR Daily Defense SPF 50 PA++++', description: 'Lightweight, no-white-cast broad-spectrum sunscreen for daily wear under makeup.', category: 'Sunscreen', price: 549, cost: 200, stock: 55, skin_type: 'all', concerns: ['sun protection'] },
  { sku: 'HYDR-EXFOL-AHA-100', name: 'HYDR AHA/BHA Exfoliating Toner', category: 'Exfoliant', description: 'Glycolic and salicylic acid toner to smooth texture and unclog pores, use 2-3x weekly.', price: 599, cost: 210, stock: 28, skin_type: 'all', concerns: ['texture', 'pores', 'acne'] },
  { sku: 'HYDR-EYE-CREAM-15', name: 'HYDR Bright Eye Cream with Caffeine', category: 'Eye Care', description: 'Caffeine and peptide eye cream to reduce the look of puffiness and dark circles.', price: 449, cost: 160, stock: 38, skin_type: 'all', concerns: ['dark circles', 'puffiness'] },
].map((p) => ({
  
  ...p,
  image_url: `/images/${p.sku.toLowerCase()}.jpg`,
}));

const USERS = [
  { email: 'amit@gmail.com', password: 'amit123', name: 'amit sharma' },
  { email: 'monika@gmail.com', password: 'monika123', name: 'monika singh' },
];

const COUPONS = [
  { code: 'HYDR10', percent_off: 10, days: 30 },
  { code: 'WELCOME15', percent_off: 15, days: 60 },
];

async function main() {
  console.log('Seeding HYDR demo data...');

  const productIdBySku = {};
  for (const p of PRODUCTS) {
    const { rows } = await pool.query(
      `INSERT INTO products (sku, name, category, description, price_paise, cost_paise, stock, skin_type, concerns, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
         price_paise = EXCLUDED.price_paise, cost_paise = EXCLUDED.cost_paise, stock = EXCLUDED.stock, image_url = EXCLUDED.image_url
       RETURNING id, sku`,
      [p.sku, p.name, p.category, p.description, p.price * 100, p.cost * 100, p.stock, p.skin_type, p.concerns, p.image_url]
    );
    productIdBySku[rows[0].sku] = rows[0].id;
  }
  console.log(`  ${Object.keys(productIdBySku).length} products seeded.`);

  // Also-bought pairs for upsell logic: cleanser -> serum -> moisturizer -> SPF is a natural routine.
  const alsoBoughtPairs = [
    ['HYDR-HA-SERUM-30', 'HYDR-GEL-MOIST-50'],
    ['HYDR-VITC-SERUM-30', 'HYDR-SPF50-50'],
    ['HYDR-NIACIN-SERUM-30', 'HYDR-GEL-MOIST-50'],
    ['HYDR-RETINOL-SERUM-30', 'HYDR-CICA-CREAM-50'],
    ['HYDR-CLEANSER-GEL-100', 'HYDR-HA-SERUM-30'],
    ['HYDR-CLEANSER-OIL-100', 'HYDR-CLEANSER-GEL-100'],
    ['HYDR-EXFOL-AHA-100', 'HYDR-CICA-CREAM-50'],
  ];
  for (const [a, b] of alsoBoughtPairs) {
    await pool.query(
      `INSERT INTO also_bought (product_id, also_product_id, weight) VALUES ($1,$2,3)
       ON CONFLICT (product_id, also_product_id) DO NOTHING`,
      [productIdBySku[a], productIdBySku[b]]
    );
  }

  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, hash, u.name]
    );
  }
  console.log(`  ${USERS.length} demo users seeded (password: hidden).`);

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminHash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,'Admin',$3)
     ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
    [adminEmail, adminHash, 'admin']
  );
  console.log(`  Admin user ready: ${adminEmail}`);

  for (const c of COUPONS) {
    await pool.query(
      `INSERT INTO coupons (code, percent_off, expires_at) VALUES ($1,$2, now() + interval '${c.days} days')
       ON CONFLICT (code) DO UPDATE SET percent_off = EXCLUDED.percent_off, active = true`,
      [c.code, c.percent_off]
    );
  }
  console.log(`  ${COUPONS.length} coupons seeded.`);

  const demoAgentKey = `hydr_ext_${crypto.randomBytes(24).toString('hex')}`;
  const existingAgent = await pool.query(`SELECT api_key FROM external_agent_clients WHERE name = 'Demo Buying Agent'`);
  if (!existingAgent.rows.length) {
    await pool.query(`INSERT INTO external_agent_clients (name, api_key) VALUES ($1,$2)`, ['Demo Buying Agent', demoAgentKey]);
    console.log(`  Demo external agent client created. API key: ${demoAgentKey}`);
    console.log('  (save this — it will not be printed again by this script; used by scripts/mock-external-agent.js)');
  } else {
    console.log(`  Demo external agent client already exists. Key: ${existingAgent.rows[0].api_key}`);
  }

  console.log('Seeding complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
