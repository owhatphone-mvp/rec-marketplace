// Payment service (provider-agnostic).
// PAYMENT_MODE = mock | omise | paysolutions
const MODE = process.env.PAYMENT_MODE || 'mock';
let paysol = null;
try { paysol = require('./paysolutions'); } catch (_) {}

function fakePromptPayPayload(amountTHB, ref) { return `MOCK-PROMPTPAY|amount=${amountTHB.toFixed(2)}|ref=${ref}`; }

async function createPayment({ method, amountTHB, orderRef, email, productName }) {
  if (MODE === 'mock') {
    if (method === 'promptpay')
      return { provider: 'mock', status: 'requires_confirmation', promptpay: fakePromptPayPayload(amountTHB, orderRef), message: 'MOCK mode: confirm via /api/orders/:id/confirm.' };
    return { provider: 'mock', status: 'requires_confirmation', message: 'MOCK mode: card not charged. Confirm via /api/orders/:id/confirm.' };
  }

  if (MODE === 'paysolutions') {
    // Hosted redirect — frontend auto-submits a form to PaySolutions.
    const checkout = paysol.createCheckout({ orderRef, amountTHB, email, productName });
    return { provider: 'paysolutions', status: 'redirect', checkout,
      message: 'Redirect user to PaySolutions hosted page; order confirmed via postback.' };
  }

  if (MODE === 'omise') {
    // OMISE (real) — npm i omise, then implement here.
    throw new Error('PAYMENT_MODE=omise selected but integration not enabled. See src/payment.js.');
  }

  throw new Error('Unknown PAYMENT_MODE: ' + MODE);
}

// mock auto-succeeds; paysolutions/omise are confirmed by their postback/webhook handlers.
async function confirmPayment({ provider }) {
  if (provider === 'mock') return { status: 'paid' };
  throw new Error('confirmPayment not implemented for provider: ' + provider);
}

module.exports = { createPayment, confirmPayment, MODE, paysol };
