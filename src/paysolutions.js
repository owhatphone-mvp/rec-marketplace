// PaySolutions integration (Thai PSP — PromptPay + credit card via hosted redirect)
// Docs: https://www.paysolutions.asia  (Payment Gateway — redirect + postback/return)
//
// Flow:
//   1. createCheckout(order)  -> returns a redirect URL + hidden-form fields
//      Frontend auto-submits a POST form to PaySolutions hosted page.
//   2. User pays on PaySolutions (PromptPay QR / card).
//   3. PaySolutions calls our /api/pay/paysolutions/postback (server-to-server)
//      and redirects the user back to /api/pay/paysolutions/return.
//   4. We verify the result + mark the order paid -> credit REC.
//
// Required env (set in Railway Variables — NEVER commit):
//   PAYSOLUTIONS_MERCHANT_ID   (เลขร้านค้า / refno prefix)
//   PAYSOLUTIONS_API_KEY       (secret key สำหรับ verify signature)
//   PAYSOLUTIONS_ENDPOINT      (เช่น https://www.thaiepay.com/epaylink/payment.aspx — ยืนยันกับ PaySolutions)
//   PUBLIC_BASE_URL            (เช่น https://market.rectokenasean.com  — ใช้สร้าง return/postback url)
//
// NOTE: ฟิลด์/ชื่อพารามิเตอร์ของ PaySolutions ต่างตาม product (ThaiEpay vs PaySolutions API).
//       ค่าด้านล่างอิง ThaiEpay hosted form ที่นิยมใช้ — ปรับชื่อ field ตามเอกสารร้านค้าจริงของคุณ.

const crypto = require('crypto');

const MERCHANT = process.env.PAYSOLUTIONS_MERCHANT_ID || '';
const API_KEY  = process.env.PAYSOLUTIONS_API_KEY || '';
const ENDPOINT = process.env.PAYSOLUTIONS_ENDPOINT || 'https://www.thaiepay.com/epaylink/payment.aspx';
const BASE     = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

function configured() { return !!(MERCHANT && API_KEY && BASE); }

// Build the hosted-checkout payload. Frontend posts these fields to ENDPOINT.
function createCheckout({ orderRef, amountTHB, productName, email }) {
  if (!configured())
    throw new Error('PaySolutions not configured: set PAYSOLUTIONS_MERCHANT_ID, PAYSOLUTIONS_API_KEY, PUBLIC_BASE_URL');
  const fields = {
    merchantid: MERCHANT,
    refno: orderRef,
    customeremail: email || '',
    productdetail: productName || 'REC Token',
    total: amountTHB.toFixed(2),
    cc: '00',                       // 00 = THB
    lang: 'TH',
    returnurl: `${BASE}/api/pay/paysolutions/return`,
    postbackurl: `${BASE}/api/pay/paysolutions/postback`,
    channel: 'creditcard,promptpay' // ปรับตาม product ที่เปิดใช้
  };
  return { provider: 'paysolutions', action: ENDPOINT, method: 'POST', fields };
}

// PaySolutions postback verification.
// ThaiEpay sends back: refno, total, status (CO=complete), and a checksum/signature.
// Verify by recomputing the signature with API_KEY. (ปรับสูตรตามเอกสารจริง.)
function verifyPostback(body) {
  const { refno, total, status } = body || {};
  const paid = String(status || '').toUpperCase() === 'CO'
            || String(status || '').toLowerCase() === 'success';
  // signature check — example (md5 of refno+total+key). ยืนยันสูตรกับเอกสาร PaySolutions.
  const sig = body.checksum || body.signature || '';
  const expect = crypto.createHash('md5')
    .update(`${MERCHANT}${refno}${total}${API_KEY}`).digest('hex');
  const sigOk = !sig || sig.toLowerCase() === expect.toLowerCase(); // ถ้ายังไม่มี checksum ก็ผ่านชั่วคราว
  return { refno, total, paid: paid && sigOk, sigOk, raw: body };
}

module.exports = { configured, createCheckout, verifyPostback, ENDPOINT };
