// Client-side cart WebSocket handler + DOM update (no page refresh)

(function () {
  // ensure socket.io client is available
  if (typeof io === 'undefined') {
    console.error('socket.io client not found. Make sure /socket.io/socket.io.js is included in header.');
    return;
  }
  const socket = io();

  // attempt to join user's room when session becomes available
  function tryJoinRoom() {
    const user = window.currentUser;
    if (user && (user._id || user.id)) {
      socket.emit('joinRoom', { userId: user._id || user.id });
      console.debug('cart.js: joinRoom emitted for', user._id || user.id);
    } else {
      // try again shortly (session.js populates window.currentUser on DOMContentLoaded)
      setTimeout(() => {
        if (!window.currentUser) return;
        socket.emit('joinRoom', { userId: window.currentUser._id || window.currentUser.id });
      }, 200);
    }
  }
  tryJoinRoom();

  // helper to render items array into tbody and update total
  function renderCartItems(items) {
    const tbody = document.querySelector('#cart-table tbody');
    if (!tbody) return;
    if (!items || items.length === 0) {
      document.querySelector('.container').innerHTML = '<p>Your cart is empty.</p>';
      return;
    }
    tbody.innerHTML = items.map(i => {
      const qty = i.quantity;
      const price = (i.product && i.product.price) ? i.product.price : 0;
      const disabled = qty <= 1 ? 'disabled' : '';
      return `
        <tr class="cart-item" data-id="${i.product._id}">
          <td class="col-desc">${escapeHtml(i.product.name)}</td>
          <td>
            <div class="input-group" style="max-width:120px;">
              <button class="btn btn-outline-secondary btn-qty" data-action="decrement" ${disabled}>-</button>
              <span class="form-control text-center qty" style="padding:0 0;">${qty}</span>
              <button class="btn btn-outline-secondary btn-qty" data-action="increment">+</button>
            </div>
          </td>
          <td class="col-price">₹${price}</td>
          <td>
            <button class="btn btn-link text-danger btn-remove" title="Remove"><b>&times;</b></button>
          </td>
        </tr>
      `;
    }).join('');
    const total = items.reduce((s, it) => s + ((it.product && it.product.price ? it.product.price : 0) * it.quantity), 0);
    const totalEl = document.getElementById('total-amount');
    if (totalEl) totalEl.textContent = total;
    attachButtons();
  }

  // update single row qty and total without full re-render (used if server returns only changes)
  function updateRowAndTotal(productId, newQty, price) {
    const row = document.querySelector(`.cart-item[data-id="${productId}"]`);
    if (!row) return;
    const qtySpan = row.querySelector('.qty');
    const decBtn = row.querySelector('button[data-action="decrement"]');
    qtySpan.textContent = newQty;
    if (newQty <= 1) decBtn.setAttribute('disabled', 'disabled');
    else decBtn.removeAttribute('disabled');

    // recalc total
    let total = 0;
    document.querySelectorAll('.cart-item').forEach(r => {
      const q = parseInt(r.querySelector('.qty').textContent || '0', 10);
      const p = parseFloat(r.querySelector('.col-price').textContent.replace(/[^\d.]/g, '')) || 0;
      total += q * p;
    });
    const totalEl = document.getElementById('total-amount');
    if (totalEl) totalEl.textContent = total;
  }

  // attach click handlers to current DOM rows
  function attachButtons() {
    document.querySelectorAll('.cart-item').forEach(function (row) {
      const productId = row.dataset.id;
      const qtySpan = row.querySelector('.qty');
      const decrementBtn = row.querySelector('button[data-action="decrement"]');
      const incrementBtn = row.querySelector('button[data-action="increment"]');
      const removeBtn = row.querySelector('.btn-remove');

      if (decrementBtn) {
        decrementBtn.onclick = () => {
          const qty = Math.max(1, parseInt(qtySpan.textContent, 10) - 1);
          socket.emit('cart:updateQty', { productId, qty });
        };
      }

      if (incrementBtn) {
        incrementBtn.onclick = () => {
          const qty = parseInt(qtySpan.textContent, 10) + 1;
          socket.emit('cart:updateQty', { productId, qty });
        };
      }

      if (removeBtn) {
        removeBtn.onclick = () => {
          socket.emit('cart:removeItem', { productId });
        };
      }
    });
  }

  // socket event: receive full updated cart (server emits populated items.product)
  socket.on('cartUpdated', function (updatedCart) {
    console.log('cartUpdated event received:', updatedCart);
    const items = (updatedCart && updatedCart.items) ? updatedCart.items : [];
    renderCartItems(items);
  });

  // optional: handle socket-level errors
  socket.on('error', function (err) {
    console.warn('cart socket error:', err);
  });

  // small utility
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // initialize on DOM ready: attach to buttons already present
  document.addEventListener('DOMContentLoaded', function () {
    attachButtons();
    tryJoinRoom();
  });
})();