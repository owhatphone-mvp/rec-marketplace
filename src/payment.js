// Payment service. PAYMENT_MODE=mock (no real charge) | omise (real: PromptPay + card).
// Go-live: real charging needs an Omise account + legal entity + keys in .env. See README.
const MODE = process.env.PAYMENT_MODE || 'mock';
function fakePromptPayPayload(amountTHB, ref) { return `MOCK-PROMPTPAY|amount=${amountTHB.toFixed(2)}|ref=${ref}`; }
async function createPayment({ method, amountTHB, orderRef }) {
  if (MODE === 'mock') {
    if (method === 'promptpay')
      return { provider: 'mock', status: 'requires_confirmation', promptpay: fakePromptPayPayload(amountTHB, orderRef), message: 'MOCK mode: confirm via /api/orders/:id/confirm.' };
    return { provider: 'mock', status: 'requires_confirmation', message: 'MOCK mode: card not charged. Confirm via /api/orders/:id/confirm.' };
  }
  // OMISE (real) — enable: set PAYMENT_MODE=omise + keys, npm i omise, uncomment below.
  // const omise = require('omise')({ publicKey: process.env.OMISE_PUBLIC_KEY, secretKey: process.env.OMISE_SECRET_KEY });
  // if (method === 'promptpay') { const source = await omise.sources.create({type:'promptpay',amount:Math.round(amountTHB*100),currency:'thb'}); const charge = await omise.charges.create({amount:Math.round(amountTHB*100),currency:'thb',source:source.id}); return {provider:'omise',status:'pending',chargeId:charge.id,promptpay:charge.source.scannable_code.image.download_uri}; }
  // else { const charge = await omise.charges.create({amount:Math.round(amountTHB*100),currency:'thb',card:cardToken}); return {provider:'omise',status:charge.paid?'paid':'failed',chargeId:charge.id}; }
  throw new Error('PAYMENT_MODE=omise selected but integration not enabled. See src/payment.js / README.');
}
async function confirmPayment({ provider }) {
  if (provider === 'mock') return { status: 'paid' };
  throw new Error('confirmPayment not implemented for provider: ' + provider);
}
module.exports = { createPayment, confirmPayment, MODE };
