// PaySolutions (Payso) integration — REAL API per https://api-docs.payso.co
//   PromptPay API:  POST /tep/api/v2/promptpaynew  -> returns QR base64 image
//   Inquiry API:    POST /order/orderdetailpost    -> check payment status (Status "CP"=complete)
//
// Required env (set in Railway Variables — NEVER commit):
//   PAYSOLUTIONS_MERCHANT_ID   8-digit merchant id (e.g. 12345678)
//   PAYSOLUTIONS_BEARER        Bearer token for PromptPay API (auth header)
//   PAYSOLUTIONS_API_KEY       apikey for Inquiry API (contact Payso staff)
//   PAYSOLUTIONS_SECRET_KEY    secretkey for Inquiry API (contact Payso staff)
//   PAYSOLUTIONS_BASE          default https://apis.paysolutions.asia

const BASE     = (process.env.PAYSOLUTIONS_BASE || 'https://apis.paysolutions.asia').replace(/\/$/, '');
const MERCHANT = process.env.PAYSOLUTIONS_MERCHANT_ID || '';
const BEARER   = process.env.PAYSOLUTIONS_BEARER || '';
const API_KEY  = process.env.PAYSOLUTIONS_API_KEY || '';
const SECRET   = process.env.PAYSOLUTIONS_SECRET_KEY || '';

function configured() { return !!(MERCHANT && BEARER); }

// PaySolutions requires a unique 12-digit numeric referenceNo.
// Our order ref is "ORD-000001"; derive a stable 12-digit number from the order id.
function refToNumeric(orderId) {
  return String(orderId).replace(/\D/g, '').padStart(12, '0').slice(-12);
}

// Create a PromptPay QR for an order. Returns { referenceNo, qrImage(dataURL), orderNo, expire }.
async function createPromptPay({ orderId, amountTHB, productName, email, customerName }) {
  if (!configured())
    throw new Error('PaySolutions not configured: set PAYSOLUTIONS_MERCHANT_ID + PAYSOLUTIONS_BEARER');
  const referenceNo = refToNumeric(orderId);
  const params = new URLSearchParams({
    merchantID: MERCHANT,
    productDetail: (productName || 'REC Token').replace(/[<>&]/g, '').slice(0, 1024),
    customerEmail: email || 'customer@rectokenasean.com',
    customerName: (customerName || (email || 'customer').split('@')[0]).replace(/[<>&]/g, '').slice(0, 100),
    total: Number(amountTHB).toFixed(2),   // min 6 baht
    referenceNo
  });
  const res = await fetch(`${BASE}/tep/api/v2/promptpaynew?${params.toString()}`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${BEARER}` }
  });
  const data = await res.json().catch(() => ({}));
  if (data.status !== 'success' || !data.data || !data.data.image) {
    throw new Error('PaySolutions promptpay error: ' + (data.message || JSON.stringify(data).slice(0, 200)));
  }
  return {
    referenceNo,
    qrImage: data.data.image,        // "data:image/png;base64,...."
    orderNo: data.data.orderNo,
    total: data.data.total,
    expire: data.data.expiredate || null
  };
}

// Poll payment status via Inquiry API. Returns { paid, status, raw }.
// CAUTION (per docs): if payment not successful, Payso returns NO body.
async function inquire({ referenceNo, orderNo }) {
  if (!API_KEY || !SECRET)
    throw new Error('Inquiry not configured: set PAYSOLUTIONS_API_KEY + PAYSOLUTIONS_SECRET_KEY');
  const merchant5 = MERCHANT.slice(-5);
  const res = await fetch(`${BASE}/order/orderdetailpost`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      merchantID: merchant5,
      merchantSecretKey: SECRET,
      apikey: API_KEY
    },
    body: JSON.stringify({
      merchantID: merchant5,
      orderNo: orderNo || 'X',
      refno: referenceNo || 'X',
      productDetail: 'QWERTY'
    })
  });
  const text = await res.text();
  if (!text || text.trim()==='[]') return { paid: false, status: 'PENDING', raw: null }; // no record yet = not paid
  let data; try { data = JSON.parse(text); } catch { return { paid: false, status: 'UNKNOWN', raw: text }; }
  // Inquiry returns an ARRAY of order records; take the first
  const rec = Array.isArray(data) ? data[0] : data;
  if (!rec) return { paid: false, status: 'PENDING', raw: data };
  const status = String(rec.Status || '').toUpperCase();
  const statusName = String(rec.StatusName || '').toUpperCase();
  // Paid signals seen from PaySolutions: Status "Y" or "CP", StatusName "PAID"/"COMPLETE"
  const paid = ['Y','CP'].includes(status) || ['PAID','COMPLETE'].includes(statusName);
  return { paid, status: rec.StatusName || status, raw: rec };
}

// ---- Credit card / e-Payment hosted redirect (Simple payment) ----
// Docs: POST form -> https://payments.paysolutions.asia/payment
// Customer picks card / installment / internet banking on Payso's page.
// Confirmation is verified the same way as PromptPay: via Inquiry API (poll).
const PAY_PAGE = process.env.PAYSOLUTIONS_PAYMENT_URL || 'https://payments.paysolutions.asia/payment';
function createCheckout({ orderId, amountTHB, productName, email }) {
  if (!MERCHANT) throw new Error('PaySolutions not configured: set PAYSOLUTIONS_MERCHANT_ID');
  const refno = refToNumeric(orderId);
  return {
    action: PAY_PAGE,
    method: 'POST',
    referenceNo: refno,
    fields: {
      merchantid: MERCHANT,
      refno,
      customeremail: email || 'customer@rectokenasean.com',
      productdetail: (productName || 'REC Token').replace(/[<>&"]/g, '').slice(0, 255),
      total: Number(amountTHB).toFixed(2),
      cc: '00',     // THB
      lang: 'TH'
    }
  };
}

module.exports = { configured, createPromptPay, createCheckout, inquire, refToNumeric, BASE };
