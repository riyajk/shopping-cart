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
    console.log(`🔄 cart:updateQty by user ${userId}: product=${productId}, qty=${qty}`);
    try {
      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        console.log(`ℹ️ No cart found for user ${userId}`);
        return;
      }
      const item = cart.items.find(i => i.product.toString() === productId);
      if (!item) {
        console.log(`ℹ️ Item ${productId} not found in cart for user ${userId}`);
        return;
      }
      item.quantity = Number(qty);
      if (item.quantity <= 0) {
        cart.items = cart.items.filter(i => i.product.toString() !== productId);
        console.log(`🗑️ Removed item ${productId} from cart for user ${userId} (qty <= 0)`);
      }
      await cart.save();
      cart = await Cart.findOne({ user: userId }).populate('items.product');
      io.to(userId.toString()).emit('cartUpdated', cart);
      console.log(`✅ cartUpdated emitted to room ${userId}`);
    } catch (err) {
      console.error('❌ cart:updateQty error:', err);
    }
  });

  socket.on('cart:removeItem', async ({ productId }) => {
    const userId = getUserIdFromSocket(socket);
    if (!userId) {
      console.warn(`🚫 cart:removeItem attempted by unauthenticated socket ${socket.id}`);
      return socket.emit('error', { message: 'Not authenticated' });
    }
    console.log(`🗑️ cart:removeItem by user ${userId}: product=${productId}`);
    try {
      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        console.log(`ℹ️ No cart found for user ${userId}`);
        return;
      }
      cart.items = cart.items.filter(i => i.product.toString() !== productId);
      await cart.save();
      cart = await Cart.findOne({ user: userId }).populate('items.product');
      io.to(userId.toString()).emit('cartUpdated', cart);
      console.log(`✅ cartUpdated emitted to room ${userId} after removal`);
    } catch (err) {
      console.error('❌ cart:removeItem error:', err);
    }
  });

  // NEW: handle add-to-cart via socket
  socket.on('cart:add', async ({ productId, qty = 1 }, callback) => {
    const userId = getUserIdFromSocket(socket);
    if (!userId) {
      const errMsg = 'Not authenticated';
      console.warn(`🚫 cart:add attempted by unauthenticated socket ${socket.id}`);
      if (typeof callback === 'function') return callback({ ok: false, error: errMsg });
      return socket.emit('error', { message: errMsg });
    }

    try {
      const product = await Product.findById(productId);
      if (!product) {
        const errMsg = 'Product not found';
        if (typeof callback === 'function') callback({ ok: false, error: errMsg });
        return;
      }

      let cart = await Cart.findOne({ user: userId });
      if (!cart) cart = new Cart({ user: userId, items: [] });

      const existing = cart.items.find(i => i.product.toString() === productId);
      if (existing) existing.quantity += Number(qty);
      else cart.items.push({ product: productId, quantity: Number(qty) });

      await cart.save();

      // populate and emit updated cart to user's room
      cart = await Cart.findOne({ user: userId }).populate('items.product');
      io.to(userId.toString()).emit('cartUpdated', cart);

      if (typeof callback === 'function') callback({ ok: true, cart });

    } catch (err) {
      console.error('❌ cart:add error:', err);
      if (typeof callback === 'function') callback({ ok: false, error: 'Server error' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
