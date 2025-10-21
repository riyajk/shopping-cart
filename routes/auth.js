const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// GET register page
router.get('/register', (req, res) => {
  res.render('register');
});

// POST register with validation
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  // Simple server-side validation
  if (!name || !email || !password) {
    return res.status(400).render('register', { error: 'All fields are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).render('register', { error: 'Invalid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).render('register', { error: 'Password must be at least 6 characters.' });
  }
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).render('register', { error: 'User already exists.' });
    user = new User({ name, email, password });
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/products');
  } catch (err) {
    res.status(500).render('register', { error: 'Server error. Please try again.' });
  }
});

// login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.cookie('token', token, { httpOnly: true });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// GET current session (returns user object if logged in, else user: null)
router.get('/session', async (req, res) => {
  try {
    const token = req.cookies && req.cookies.token;
    if (!token) return res.json({ user: null });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.json({ user: null });

    res.json({ user });
  } catch (err) {
    // invalid token or other error -> no session
    res.json({ user: null });
  }
});

module.exports = router;
