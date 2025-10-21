// ...new file...
// Handles fetching current session, updating header auth-area, join socket room, logout

(async function () {
  const authArea = () => document.getElementById('auth-area');

  // create socket only after script loaded
  let socket;
  function ensureSocket() {
    if (!socket && typeof io !== 'undefined') socket = io();
    return socket;
  }

  async function fetchSession() {
    try {
      const res = await fetch('/auth/session', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.user ? data.user : null;
    } catch (err) {
      console.warn('session fetch error', err);
      return null;
    }
  }

  function renderLoggedIn(user) {
    const area = authArea();
    if (!area) return;
    area.innerHTML = `
      <span class="me-2">Hello, <strong>${escapeHtml(user.name)}</strong></span>
      <a href="/cart" class="btn btn-sm btn-outline-primary me-2">My Cart</a>
      <button id="btn-logout" class="btn btn-sm btn-danger">Logout</button>
    `;
    const logoutBtn = document.getElementById('btn-logout');
    logoutBtn && logoutBtn.addEventListener('click', handleLogout);
    
    const s = ensureSocket();
    if (s) {
      s.emit('joinRoom', { userId: user._id });
      console.debug('socket joinRoom emitted for user', user._id);
    }

    // expose currentUser
    window.currentUser = user;
  }

  function renderLoggedOut() {
    const area = authArea();
    if (!area) return;
    area.innerHTML = `
      <a href="/auth/login" class="btn btn-sm btn-outline-primary me-2">Login</a>
      <a href="/auth/register" class="btn btn-sm btn-outline-secondary">Register</a>
    `;
    window.currentUser = null;
    if (socket) socket.disconnect();
  }

  async function handleLogout() {
    try {
      const res = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (res.ok) {
        renderLoggedOut();
        // reload to clear any user-specific content (optional)
        location.reload();
      } else {
        console.warn('logout failed');
      }
    } catch (err) {
      console.error('logout error', err);
    }
  }

  // simple HTML escaper
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // init
  document.addEventListener('DOMContentLoaded', async () => {
    const user = await fetchSession();
    if (user) renderLoggedIn(user);
    else renderLoggedOut();
  });
})();