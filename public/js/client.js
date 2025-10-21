const socket = io();

socket.on('connect', () => console.log('connected to socket'));

// basic auth UI handlers (very small)
document.addEventListener('DOMContentLoaded', ()=>{
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const authArea = document.getElementById('auth-area');

  btnLogin && btnLogin.addEventListener('click', async ()=>{
    const email = prompt('email');
    const password = prompt('password');
    if (!email || !password) return alert('cancelled');
    const res = await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    if (res.ok) {
      const data = await res.json();
      alert('Logged in');
      // join socket room
      socket.emit('joinRoom', { userId: data.user.id });
      btnLogin.style.display='none';
      btnLogout.style.display='inline-block';
      if (typeof refreshCart === 'function') refreshCart();
    } else {
      const e = await res.json(); alert(e.message || 'Login failed');
    }
  });

  btnLogout && btnLogout.addEventListener('click', async ()=>{
    await fetch('/auth/logout',{method:'POST'});
    alert('Logged out');
    btnLogin.style.display='inline-block';
    btnLogout.style.display='none';
  });
});
