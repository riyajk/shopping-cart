require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const jwt = require('jsonwebtoken'); // added for socket auth parsing
const auth = require('./middleware/auth');
const Cart = require('./models/Cart');
const Product = require('./models/Product');
const authMiddleware = require('./middleware/auth');

// routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// make io available to routes via app.locals
app.locals.io = io;

// connect DB
connectDB().then(() => {
  console.log('✅ MongoDB connected');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// routes
app.use('/auth', authRoutes);
console.log('📌 Mounted route: /auth');
app.use('/api/products', productRoutes);
console.log('📌 Mounted route: /api/products');
app.use('/cart', cartRoutes);
console.log('📌 Mounted route: /cart');

// simple pages
app.get('/', (req, res) => res.redirect('/products'));
app.get('/products', async (req, res) => res.render('products'));

// socket handlers
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // join user's room (client should emit this after connecting)
  socket.on('joinRoom', ({ userId }) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`👥 Socket ${socket.id} joined room for user ${userId}`);
    } else {
      console.log(`⚠️ joinRoom received without userId from socket ${socket.id}`);
    }
  });

  // helper to read JWT token from cookie (simple parser)
  function getUserIdFromSocket(sock) {
    try {
      const cookie = sock.handshake.headers.cookie || '';
      const match = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('token='));
      if (!match) return null;
      const token = match.split('=')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.id;
    } catch (err) {
      console.warn(`⚠️ Failed to parse JWT from socket ${sock.id}:`, err.message);
      return null;
    }
  }

  socket.on('cart:updateQty', async ({ productId, qty }) => {
    const userId = getUserIdFromSocket(socket);
    if (!userId) {
      console.warn(`🚫 cart:updateQty attempted by unauthenticated socket ${socket.id}`);
      return socket.emit('error', { message: 'Not authenticated' });
    }
    try {
      const newQty = Number(qty);
      if (Number.isNaN(newQty) || newQty < 0) {
        return socket.emit('error', { message: 'Invalid quantity' });
      }

      const product = await Product.findById(productId);
      if (!product) return socket.emit('error', { message: 'Product not found' });

      let cart = await Cart.findOne({ user: userId });
      if (!cart) return socket.emit('error', { message: 'Cart not found' });

      const item = cart.items.find(i => i.product.toString() === productId);
      if (!item) return socket.emit('error', { message: 'Item not in cart' });

      // compute how many are available for this user: remaining stock + currently reserved by this user's cart item
      const available = product.quantity;

      if (newQty > available) {
        return socket.emit('error', { message: 'Requested quantity exceeds stock' });
      }

      // update product.quantity to reflect the new reserved amount
      // new remaining stock = available - newQty
      product.quantity = available - newQty;

      if (newQty <= 0) {
        cart.items = cart.items.filter(i => i.product.toString() !== productId);
      } else {
        item.quantity = newQty;
      }

      await product.save();
      await cart.save();

      cart = await Cart.findOne({ user: userId }).populate('items.product');
      io.to(userId.toString()).emit('cartUpdated', cart);
      if (socket) socket.emit('cart:updateAck', { ok: true, cart });
    } catch (err) {
      console.error('❌ cart:updateQty error:', err);
      socket.emit('error', { message: 'Server error' });
    }
  });

  socket.on('cart:removeItem', async ({ productId }) => {
    const userId = getUserIdFromSocket(socket);
    if (!userId) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    try {
      let cart = await Cart.findOne({ user: userId });
      if (!cart) return socket.emit('error', { message: 'Cart not found' });

      const item = cart.items.find(i => i.product.toString() === productId);
      if (!item) return socket.emit('error', { message: 'Item not in cart' });

      // restore inventory
      const product = await Product.findById(productId);
      if (product) {
        product.quantity += item.quantity;
        await product.save();
      }

      cart.items = cart.items.filter(i => i.product.toString() !== productId);
      await cart.save();

      cart = await Cart.findOne({ user: userId }).populate('items.product');
      io.to(userId.toString()).emit('cartUpdated', cart);
      if (socket) socket.emit('cart:removeAck', { ok: true, cart });
    } catch (err) {
      console.error('❌ cart:removeItem error:', err);
      socket.emit('error', { message: 'Server error' });
    }
  });

  // handle add-to-cart via socket (with inventory update)
  socket.on('cart:add', async ({ productId, qty = 1 }, callback) => {
    const userId = getUserIdFromSocket(socket);
    if (!userId) {
      const errMsg = 'Not authenticated';
      if (typeof callback === 'function') return callback({ ok: false, error: errMsg });
      return socket.emit('error', { message: errMsg });
    }

    try {
      const addQty = Number(qty) || 1;
      const product = await Product.findById(productId);
      if (!product) {
        const errMsg = 'Product not found';
        if (typeof callback === 'function') callback({ ok: false, error: errMsg });
        return;
      }

      // check inventory
      if (product.quantity < addQty) {
        const errMsg = 'Not enough stock';
        if (typeof callback === 'function') return callback({ ok: false, error: errMsg });
        return socket.emit('error', { message: errMsg });
      }

      let cart = await Cart.findOne({ user: userId });
      if (!cart) cart = new Cart({ user: userId, items: [] });

      const existing = cart.items.find(i => i.product.toString() === productId);
      if (existing) existing.quantity += addQty;
      else cart.items.push({ product: productId, quantity: addQty });

      // decrement product inventory
      product.quantity -= addQty;
      await product.save();

      await cart.save();

      // populate and emit updated cart to user's room
      cart = await Cart.findOne({ user: userId }).populate('items.product');
      io.to(userId.toString()).emit('cartUpdated', cart);

      if (typeof callback === 'function') callback({ ok: true, cart });
    } catch (err) {
      console.error('❌ cart:add error:', err);
      if (typeof callback === 'function') callback({ ok: false, error: 'Server error' });
      else socket.emit('error', { message: 'Server error' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
