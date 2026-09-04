import { Router } from 'express';
import { z } from 'zod';
import { wrap } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/limits.js';
import { getWishlist, addToWishlist, removeFromWishlist, moveWishlistToCart } from '../services/commerce.js';

const router = Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => res.json({ wishlist: await getWishlist(req.user.id) })));

router.post('/items', validateBody(z.object({ product_id: z.string().uuid() })), wrap(async (req, res) => {
  res.json({ wishlist: await addToWishlist(req.user.id, req.body.product_id) });
}));

router.delete('/items/:productId', wrap(async (req, res) => {
  res.json({ wishlist: await removeFromWishlist(req.user.id, req.params.productId) });
}));

router.post('/items/:productId/move-to-cart', wrap(async (req, res) => {
  res.json(await moveWishlistToCart(req.user.id, req.params.productId));
}));

export default router;
