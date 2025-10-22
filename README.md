# Node Shopping Cart - Starter

This project is a starter for a shopping cart app with:
- JWT Authentication
- Cart persistence with MongoDB
- Realtime updates via Socket.io
- EJS frontend templates

## Quick start

1. use.env update environment values.
2. Install dependencies:
   ```
   npm install
   ```
3. Seed sample products (optional):
   ```
   node seed.js
   ```
4. Run in development:
   ```
   npm run dev
   ```
5. Visit http://localhost:3000

## Tests

The repo includes a skeleton for tests using jest + mongodb-memory-server. Expand tests under `tests/` and make the server exportable for proper integration tests.

