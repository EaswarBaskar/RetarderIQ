import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseUrl = process.env.API_TEST_URL;
const email = process.env.API_TEST_EMAIL;
const password = process.env.API_TEST_PASSWORD;
const enabled = Boolean(baseUrl && email && password);
const options = { skip: !enabled };

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function login() {
  const result = await request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(result.response.status, 200);
  return result.data.token;
}

test('API authentication accepts configured admin credentials', options, async () => {
  const token = await login();
  assert.ok(token);
});

test('diagnostic submission is accepted and idempotent', options, async () => {
  const guest = await request('/api/auth/guest', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'API Test Technician', phone: '9999999999', dealer: 'API Test Dealer' })
  });
  assert.equal(guest.response.status, 201);
  const key = `api-test-${Date.now()}-${Math.random()}`;
  const payload = { 'FSE Name': 'API Test Technician', 'Technician Phone': '9999999999', 'Dealer / Location': 'API Test Dealer', 'Diagnostic Status': 'INCOMPLETE' };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${guest.data.token}`, 'idempotency-key': key };
  const first = await request('/api/diagnostics', { method: 'POST', headers, body: JSON.stringify(payload) });
  const second = await request('/api/diagnostics', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(first.response.status, 202);
  assert.equal(second.response.status, 202);
  assert.equal(second.data.caseId, first.data.caseId);
  assert.equal(second.data.duplicate, true);
});

test('admin report pagination and filters are server-side', options, async () => {
  const token = await login();
  const result = await request('/api/diagnostics?page=1&pageSize=1&status=INCOMPLETE', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.ok(Array.isArray(result.data.cases));
  assert.equal(result.data.pageSize, 1);
  assert.equal(typeof result.data.total, 'number');
  assert.equal(typeof result.data.totalPages, 'number');
});

test('forwarding status exposes retry state for monitoring', options, async () => {
  const token = await login();
  const result = await request('/api/diagnostics?page=1&pageSize=1', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  if (result.data.cases[0]) {
    assert.ok(['pending', 'sent', 'failed'].includes(result.data.cases[0].forward_status));
    assert.equal(typeof result.data.cases[0].forward_attempts, 'number');
    assert.equal(typeof result.data.cases[0].forward_error === 'string' || result.data.cases[0].forward_error === null, true);
  }
});
