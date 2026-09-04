import { Router } from 'express';
import { z } from 'zod';
import { wrap } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/limits.js';
import { getCart, addToCart, removeFromCart, updateCartQuantity } from '../services/commerce.js';

const router = Router();
router.use(requireAuth); // cart is per-account; guest checkout uses a different flow (POST /api/orders/guest)

router.get('/', wrap(async (req, res) => res.json(await getCart(req.user.id))));

router.post('/items', validateBody(z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive().optional() })), wrap(async (req, res) => {
  res.json(await addToCart(req.user.id, req.body.product_id, req.body.quantity || 1));
}));

router.patch('/items/:productId', validateBody(z.object({ quantity: z.number().int().min(0) })), wrap(async (req, res) => {
  res.json(await updateCartQuantity(req.user.id, req.params.productId, req.body.quantity));
}));

router.delete('/items/:productId', wrap(async (req, res) => {
  res.json(await removeFromCart(req.user.id, req.params.productId));
}));

export default router;
