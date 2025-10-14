const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// get all products
router.get('/', async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

// add product (admin/demo)
router.post('/', async (req, res) => {
  const { name, image, price, quantity } = req.body;
  const product = new Product({ name, image, price, quantity });
  await product.save();
  res.json(product);
});

module.exports = router;
