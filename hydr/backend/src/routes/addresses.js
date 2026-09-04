import { Router } from 'express';
import { z } from 'zod';
import { wrap } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/limits.js';
import { listAddresses, addAddress, updateAddress, removeAddress, setDefaultAddress } from '../services/commerce.js';

const router = Router();
router.use(requireAuth);

const addressBody = z.object({
  label: z.string().max(40).optional(),
  full_name: z.string().min(1).max(120),
  phone: z.string().min(6).max(20),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().min(3).max(12),
  is_default: z.boolean().optional(),
});

router.get('/', wrap(async (req, res) => {
  res.json({ addresses: await listAddresses(req.user.id) });
}));

router.post('/', validateBody(addressBody), wrap(async (req, res) => {
  res.status(201).json({ addresses: await addAddress(req.user.id, req.body) });
}));

router.patch('/:id', validateBody(addressBody.partial()), wrap(async (req, res) => {
  res.json({ addresses: await updateAddress(req.user.id, req.params.id, req.body) });
}));

router.delete('/:id', wrap(async (req, res) => {
  res.json({ addresses: await removeAddress(req.user.id, req.params.id) });
}));

router.post('/:id/default', wrap(async (req, res) => {
  res.json({ addresses: await setDefaultAddress(req.user.id, req.params.id) });
}));

export default router;
