const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Render cart page server-side and pass user id for socket room
router.get('/', auth, async (req, res) => {
  let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  if (!cart) cart = { items: [] };
  res.render('cart', { cart, user: req.user }); // pass user to template
});

// add to cart
router.post('/add', auth, async (req, res) => {
  const { productId, qty = 1 } = req.body;
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  // load or create user's cart before validating against it
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) cart = new Cart({ user: req.user._id, items: [] });

  const existing = cart.items.find(i => i.product.toString() === productId);
  const currentQty = existing ? existing.quantity : 0;
  const requestedTotal = currentQty + Number(qty);

  // check stock against what user already has in cart
  if (requestedTotal > product.quantity) {
    return res.status(400).json({ message: 'Request would exceed available stock' });
  }

  if (existing) {
    existing.quantity = requestedTotal;
  } else {
    cart.items.push({ product: productId, quantity: Number(qty) });
  }

  await cart.save();

  // emit socket event to notify clients (e.g., cartUpdated)
  const io = req.app.locals.io;
  const populated = await Cart.findOne({ user: req.user._id }).populate('items.product');
  io.to(req.user._id.toString()).emit('cartUpdated', populated);

  res.json(populated);
});

// update quantity
router.post('/update', auth, async (req, res) => {
  const { productId, qty } = req.body;
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  if (Number(qty) > product.quantity) {
    return res.status(400).json({ message: 'Requested quantity exceeds stock' });
  }

  let userCart = await Cart.findOne({ user: req.user._id });
  if (!userCart) return res.status(404).json({ message: 'Cart not found' });
  const item = userCart.items.find(i => i.product.toString() === productId);
  if (!item) return res.status(404).json({ message: 'Item not in cart' });
  item.quantity = Number(qty);
  if (item.quantity <= 0) userCart.items = userCart.items.filter(i => i.product.toString() !== productId);
  await userCart.save();

  const io = req.app.locals.io;
  const populated = await Cart.findOne({ user: req.user._id }).populate('items.product');
  io.to(req.user._id.toString()).emit('cartUpdated', populated);

  res.json(populated);
});

// remove item
router.post('/remove', auth, async (req, res) => {
  const { productId } = req.body;
  let userCart = await Cart.findOne({ user: req.user._id });
  if (!userCart) return res.status(404).json({ message: 'Cart not found' });
  userCart.items = userCart.items.filter(i => i.product.toString() !== productId);
  await userCart.save();

  const io = req.app.locals.io;
  const populated = await Cart.findOne({ user: req.user._id }).populate('items.product');
  io.to(req.user._id.toString()).emit('cartUpdated', populated);

  res.json(populated);
});

module.exports = router;
