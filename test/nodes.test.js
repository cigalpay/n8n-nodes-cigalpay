// Unit tests: node --test test/  (after npm run build)
const { test } = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');
const { CigalPay } = require('../dist/nodes/CigalPay/CigalPay.node.js');
const { CigalPayTrigger, verifySignature } = require('../dist/nodes/CigalPay/CigalPayTrigger.node.js');

const SECRET = 'test-secret';
const sign = (payload, secret = SECRET) => createHmac('sha512', secret).update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex');
const CREDS = { accountId: 'acc_1', apiKey: 'key_1', notificationSecret: SECRET };

function execContext(params, calls) {
  return {
    getInputData: () => [{ json: {} }],
    getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
    getCredentials: async () => CREDS,
    getNode: () => ({ name: 'CigalPay', type: 'cigalPay', typeVersion: 1, parameters: {} }),
    continueOnFail: () => false,
    helpers: {
      httpRequest: async (o) => { calls.push({ auth: false, ...o }); return { id: 'chk_1', chargeLink: 'https://x' }; },
      httpRequestWithAuthentication: async function (cred, o) { calls.push({ auth: cred, ...o }); return [{ id: 'p1' }, { id: 'p2' }]; },
    },
  };
}

test('signature: valid, tampered, wrong secret, missing', () => {
  const p = { id: 'pay_1', status: 'CONFIRMED', extraId: '42', amount: 0.001 };
  assert.equal(verifySignature(p, sign(p), SECRET), true);
  assert.equal(verifySignature({ ...p, amount: 9 }, sign(p), SECRET), false);
  assert.equal(verifySignature(p, sign(p, 'other'), SECRET), false);
  assert.equal(verifySignature(p, '', SECRET), false);
  assert.equal(verifySignature(p, sign(p), ''), false);
});

test('checkout create sends the pre-invoice with the account id, unauthenticated', async () => {
  const calls = [];
  const out = await new CigalPay().execute.call(execContext({ resource: 'checkout', operation: 'create', amount: 49.9, currency: 'EUR', orderId: 1042, checkoutDescription: 'Plan', returnUrl: 'https://r', notifyUrl: 'https://n', lang: 'fr' }, calls));
  assert.equal(calls[0].url, 'https://coins-api.cigalpay.com/api/pre-invoice');
  assert.equal(calls[0].auth, false);
  assert.deepEqual(calls[0].body, { accountId: 'acc_1', amount: 49.9, currency: 'EUR', extraId: '1042', description: 'Plan', lang: 'fr', callback: 'https://r', ipn: 'https://n' });
  assert.equal(out[0][0].json.chargeLink, 'https://x');
});

test('checkout over 5,000 is refused before any request', async () => {
  const calls = [];
  await assert.rejects(new CigalPay().execute.call(execContext({ resource: 'checkout', operation: 'create', amount: 6000, currency: 'USD', orderId: '1', checkoutDescription: 'x', returnUrl: 'r', notifyUrl: 'n', lang: 'en' }, calls)), /between 0.01 and 5000/);
  assert.equal(calls.length, 0);
});

test('refund in checkout currency uses checkoutAmount, with the API key credential', async () => {
  const calls = [];
  await new CigalPay().execute.call(execContext({ resource: 'refund', operation: 'create', paymentId: 'pay_1', amountIn: 'checkout', amount: 10, additionalFields: { customerEmail: 'c@x.com' } }, calls));
  assert.equal(calls[0].auth, 'cigalPayApi');
  assert.equal(calls[0].url, 'https://merchant-api.cigalpay.com/api/refunds');
  assert.deepEqual(calls[0].body, { paymentId: 'pay_1', checkoutAmount: 10, customerEmail: 'c@x.com' });
});

test('payments by order: one output item per payment', async () => {
  const calls = [];
  const out = await new CigalPay().execute.call(execContext({ resource: 'payment', operation: 'getByOrder', orderId: 'A 1' }, calls));
  assert.equal(calls[0].url, 'https://core-api.cigalpay.com/getPaymentsByExtraId?extraId=A%201');
  assert.equal(out[0].length, 2);
});

function hookContext(body, signature, params) {
  const res = { code: 200, payload: null, status(c) { this.code = c; return this; }, json(p) { this.payload = p; return this; } };
  return {
    res,
    ctx: {
      getRequestObject: () => ({ headers: {} }),
      getResponseObject: () => res,
      getCredentials: async () => CREDS,
      getBodyData: () => body,
      getHeaderData: () => ({ 'x-cigalpay-sig': signature }),
      getNodeParameter: (n) => params[n],
      helpers: { returnJsonArray: (o) => [{ json: o }] },
    },
  };
}

test('trigger: bad signature is refused with 401 and runs nothing', async () => {
  const body = { id: 'p', status: 'CONFIRMED' };
  const { ctx, res } = hookContext(body, 'nope', { statuses: 'all', ignoreTests: false });
  const r = await new CigalPayTrigger().webhook.call(ctx);
  assert.equal(res.code, 401);
  assert.equal(r.noWebhookResponse, true);
  assert.equal(r.workflowData, undefined);
});

test('trigger: paid-only mode runs on CONFIRMED and skips WAITING', async () => {
  const paid = { id: 'p', status: 'CONFIRMED', extraId: '1' };
  const a = await new CigalPayTrigger().webhook.call(hookContext(paid, sign(paid), { statuses: 'paid', ignoreTests: false }).ctx);
  assert.equal(a.workflowData[0][0].json.isPaid, true);
  const waiting = { id: 'p', status: 'WAITING' };
  const b = await new CigalPayTrigger().webhook.call(hookContext(waiting, sign(waiting), { statuses: 'paid', ignoreTests: false }).ctx);
  assert.equal(b.workflowData, undefined);
});

test('trigger: test notifications can be ignored', async () => {
  const t = { id: 'x', status: 'CONFIRMED', test: true, extraId: 'cigalpay-test' };
  const r = await new CigalPayTrigger().webhook.call(hookContext(t, sign(t), { statuses: 'paid', ignoreTests: true }).ctx);
  assert.equal(r.workflowData, undefined);
});
