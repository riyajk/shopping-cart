require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const connectDB = require('./config/db');

const products = [
  { name: 'Red T-Shirt', image: '/images/placeholder.png', price: 299, quantity: 10 },
  { name: 'Blue Jeans', image: '/images/placeholder.png', price: 999, quantity: 5 },
  { name: 'Sneakers', image: '/images/placeholder.png', price: 2499, quantity: 7 },
];

const seed = async () => {
  await connectDB();
  await Product.deleteMany({});
  await Product.insertMany(products);
  console.log('Seeded products');
  process.exit(0);
};

seed();
