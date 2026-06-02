// Payment service (provider-agnostic).
// PAYMENT_MODE = mock | paysolutions | omise
const MODE = process.env.PAYMENT_MODE || 'mock';
let paysol = null;
try { paysol = require('./paysolutions'); } catch (_) {}

function fakePromptPayPayload(amountTHB, ref) { return `MOCK-PROMPTPAY|amount=${amountTHB.toFixed(2)}|ref=${ref}`; }

async function createPayment({ method, amountTHB, orderRef, orderId, email, productName }) {
  if (MODE === 'mock') {
    if (method === 'promptpay')
      return { provider: 'mock', status: 'requires_confirmation', promptpay: fakePromptPayPayload(amountTHB, orderRef), message: 'MOCK mode: confirm via /api/orders/:id/confirm.' };
    return { provider: 'mock', status: 'requires_confirmation', message: 'MOCK mode: card not charged. Confirm via /api/orders/:id/confirm.' };
  }

  if (MODE === 'paysolutions') {
    // PromptPay: create QR, show in-app, frontend polls /api/orders/:id/poll until paid.
    const pp = await paysol.createPromptPay({ orderId, amountTHB, productName, email });
    return { provider: 'paysolutions', status: 'awaiting_payment',
      qrImage: pp.qrImage, referenceNo: pp.referenceNo, orderNo: pp.orderNo, expire: pp.expire,
      message: 'Scan PromptPay QR; poll /api/orders/:id/poll to confirm.' };
  }

  if (MODE === 'omise') throw new Error('PAYMENT_MODE=omise not enabled.');
  throw new Error('Unknown PAYMENT_MODE: ' + MODE);
}

// mock auto-succeeds. paysolutions is confirmed via inquiry poll (see server poll route).
async function confirmPayment({ provider }) {
  if (provider === 'mock') return { status: 'paid' };
  throw new Error('confirmPayment not implemented for provider: ' + provider);
}

module.exports = { createPayment, confirmPayment, MODE, paysol };
