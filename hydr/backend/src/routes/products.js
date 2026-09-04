import { Router } from 'express';
import { wrap } from '../middleware/errors.js';
import { searchProducts, getProductById, compareProducts, getRecommendations } from '../services/commerce.js';

const router = Router();

router.get('/', wrap(async (req, res) => {
  const { q, category, skin_type, limit } = req.query;
  const results = await searchProducts({ q, category, skinType: skin_type, limit: limit ? Number(limit) : 24 });
  res.json({ products: results });
}));

router.get('/compare', wrap(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean);
  const results = await compareProducts(ids);
  res.json({ products: results });
}));

router.get('/:id', wrap(async (req, res) => {
  const product = await getProductById(req.params.id);
  const recs = await getRecommendations(req.params.id).catch(() => null);
  res.json({ product, recommendations: recs?.products || [] });
}));

export default router;
