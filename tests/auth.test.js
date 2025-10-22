const request = require('supertest');
const setup = require('./setup');
let app;

beforeAll(async () => {
  // start in-memory mongo and connect mongoose
  await setup.connect();
  // require server AFTER DB is ready so routes/models operate against test DB
  const serverModule = require('../server');
  app = serverModule.app;
});

afterAll(async () => {
  // close mongoose & stop memory server
  await setup.closeDatabase();
  // close HTTP server if started by tests (not started here) to be safe
  try {
    const serverModule = require('../server');
    if (serverModule.server && serverModule.server.close) serverModule.server.close();
  } catch (e) { /* ignore */ }
});

afterEach(async () => {
  await setup.clearDatabase();
});

test('register -> login (JSON API)', async () => {
  const user = { name: 'Test User', email: 'test@example.com', password: 'password123' };

  // register via form (route redirects on success)
  const regRes = await request(app)
    .post('/auth/register')
    .type('form')
    .send(user);
  expect([200, 302]).toContain(regRes.status); // allow redirect or ok

  // login with JSON accept header to receive JSON response
  const loginRes = await request(app)
    .post('/auth/login')
    .set('Accept', 'application/json')
    .send({ email: user.email, password: user.password });

  expect(loginRes.status).toBe(200);
  expect(loginRes.body).toHaveProperty('user');
  expect(loginRes.body.user).toHaveProperty('email', user.email);

  // server should set httpOnly cookie 'token'
  const setCookie = loginRes.headers['set-cookie'];
  expect(setCookie).toBeDefined();
  expect(setCookie.some(c => /token=/.test(c))).toBe(true);
});
