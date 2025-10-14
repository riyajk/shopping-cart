require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

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
connectDB();

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
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);

// simple pages
app.get('/', (req, res) => res.redirect('/products'));
app.get('/products', async (req, res) => res.render('products'));
app.get('/cart', async (req, res) => res.render('cart'));

// socket handling: basic example
io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);
  socket.on('joinRoom', ({ userId }) => {
    if (userId) socket.join(userId.toString());
  });
  socket.on('disconnect', () => console.log('socket disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
