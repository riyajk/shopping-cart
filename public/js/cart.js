// Client-side cart WebSocket handler + DOM update (no page refresh)

(function () {
  // create or reuse socket
  let socket = (window.sharedSocket && window.sharedSocket.socket) || null;
  if (!socket) {
    if (typeof io === 'undefined') {
      console.error('socket.io client not found. Include /socket.io/socket.io.js in header.');
      return;
    }
    socket = io();
    // expose shared socket for other pages/scripts
    window.sharedSocket = { socket };
  }

  // ensure bottom-right toast container exists
  function ensureToastContainer() {
    let container = document.getElementById('toast-container-br');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container-br';
      Object.assign(container.style, {
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 10800,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        alignItems: 'flex-end'
      });
      document.body.appendChild(container);
    }
    return container;
  }

  // show toast helper
  function showToast(message, type = 'success', timeout = 3500) {
    try {
      const container = ensureToastContainer();
      const el = document.createElement('div');
      el.textContent = message;
      Object.assign(el.style, {
        minWidth: '200px',
        maxWidth: '360px',
        padding: '0.6rem 0.9rem',
        borderRadius: '6px',
        color: '#fff',
        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        fontSize: '0.95rem',
        opacity: '0',
        transform: 'translateY(8px)',
        transition: 'opacity .22s ease, transform .22s ease',
      });
      el.style.background = type === 'error' ? '#dc3545' : '#198754';
      container.appendChild(el);
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 300);
      }, timeout);
    } catch (e) {
      console.warn('showToast failed', e);
    }
  }

  // attempt to join user's room if session available
  function tryJoinRoom() {
    const user = window.currentUser;
    if (user && (user._id || user.id)) {
      socket.emit('joinRoom', { userId: user._id || user.id });
      console.debug('cart.js: joinRoom emitted for', user._id || user.id);
    } else {
      // retry shortly in case session.js hasn't populated currentUser yet
      setTimeout(() => {
        if (window.currentUser && (window.currentUser._id || window.currentUser.id)) {
          socket.emit('joinRoom', { userId: window.currentUser._id || window.currentUser.id });
          console.debug('cart.js: joinRoom emitted on retry for', window.currentUser._id || window.currentUser.id);
        }
      }, 250);
    }
  }

  // render helpers
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderCartItems(items) {
    // ensure container exists
    const container = document.querySelector('.cart-table-container');

    // if table not present, construct table (matching views/cart.ejs)
    if (!document.getElementById('cart-table')) {
      container.innerHTML = `
        <table class="table table-bordered align-middle" id="cart-table">
          <thead>
            <tr>
              <th>Item Description</th>
              <th style="width:180px;">Quantity</th>
              <th>Price</th>
              <th style="width:100px;">Actions</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        <div class="text-end" id="cart-total"><strong>
          Total: ₹<span id="total-amount">0</span>
        </strong></div>
      `;
    }

    const tbody = document.querySelector('#cart-table tbody');
    if (!tbody) return;

    // if no items, remove table and show "empty" message (keeps behavior consistent)
    if (!items || items.length === 0) {
      if (container) container.innerHTML = '<p>Your cart is empty.</p>';
      return;
    }

    // render rows
    tbody.innerHTML = items.map(i => {
      const qty = i.quantity;
      const price = (i.product && i.product.price) ? i.product.price : 0;
      const disabled = qty <= 1 ? 'disabled' : '';
      return `
        <tr class="cart-item" data-id="${escapeHtml(i.product._id)}">
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

    updateTotal();
    attachButtons();
  }

  function updateTotal() {
    let total = 0;
    document.querySelectorAll('.cart-item').forEach(r => {
      const q = parseInt(r.querySelector('.qty').textContent || '0', 10);
      const p = parseFloat(r.querySelector('.col-price').textContent.replace(/[^\d.]/g, '')) || 0;
      total += q * p;
    });
    const totalEl = document.getElementById('total-amount');
    if (totalEl) totalEl.textContent = total;
  }

  // attach handlers to current DOM
  function attachButtons() {
    document.querySelectorAll('.cart-item').forEach(row => {
      const productId = row.dataset.id;
      const qtySpan = row.querySelector('.qty');
      const decrementBtn = row.querySelector('button[data-action="decrement"]');
      const incrementBtn = row.querySelector('button[data-action="increment"]');
      const removeBtn = row.querySelector('.btn-remove');

      if (decrementBtn) {
        decrementBtn.onclick = () => {
          const qty = Math.max(1, parseInt(qtySpan.textContent, 10) - 1);
          socket.emit('cart:updateQty', { productId, qty }, (ack) => {
            if (ack && !ack.ok) showToast(ack.error || 'Update failed', 'error', 3500);
          });
        };
      }

      if (incrementBtn) {
        incrementBtn.onclick = () => {
          const qty = parseInt(qtySpan.textContent, 10) + 1;
          socket.emit('cart:updateQty', { productId, qty }, (ack) => {
            if (ack && !ack.ok) showToast(ack.error || 'Update failed', 'error', 3500);
          });
        };
      }

      if (removeBtn) {
        removeBtn.onclick = () => {
          socket.emit('cart:removeItem', { productId }, (ack) => {
            if (ack && !ack.ok) showToast(ack.error || 'Remove failed', 'error', 3500);
          });
        };
      }
    });
  }

  // socket listeners
  socket.on('cartUpdated', function (updatedCart) {
    try {
      const items = (updatedCart && updatedCart.items) ? updatedCart.items : [];
      renderCartItems(items);
      // optional success toast
      // showToast('Cart updated', 'success', 1500);
    } catch (e) {
      console.warn('cartUpdated handler error', e);
    }
  });

  // handle socket error events and show bottom-right toast
  socket.on('error', function (err) {
    try {
      const msg = (err && err.message) ? err.message : (typeof err === 'string' ? err : 'Socket error');
      showToast(msg, 'error', 5000);
      console.warn('Socket error event:', err);
    } catch (e) {
      console.warn('Socket error handler failed', e);
    }
  });

  // acknowledgement event listeners (server may also emit)
  socket.on('cart:updateAck', function (resp) {
    if (!resp || !resp.ok) {
      const m = resp && resp.error ? resp.error : 'Failed to update cart';
      showToast(m, 'error', 3500);
    } else {
      showToast('Quantity updated', 'success', 1400);
    }
  });

  socket.on('cart:removeAck', function (resp) {
    if (!resp || !resp.ok) {
      const m = resp && resp.error ? resp.error : 'Failed to remove item';
      showToast(m, 'error', 3500);
    } else {
      showToast('Item removed', 'success', 1400);
    }
  });

  // init on DOM ready
  document.addEventListener('DOMContentLoaded', function () {
    attachButtons();
    tryJoinRoom();
  });
})();