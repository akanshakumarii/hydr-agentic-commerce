import { Router } from 'express';
import { wrap } from '../middleware/errors.js';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, sku, name, brand, category, description, price_paise, stock, skin_type, concerns, image_url
     FROM products WHERE is_active = true ORDER BY category, name`
  );
  res.json({
    merchant: 'HYDR',
    currency: 'INR',
    updated_at: new Date().toISOString(),
    products: rows.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description,
      price: p.price_paise / 100,
      currency: 'INR',
      in_stock: p.stock > 0,
      stock: p.stock,
      skin_type: p.skin_type,
      concerns: p.concerns,
      image_url: p.image_url,
    })),
  });
}));

export default router;
