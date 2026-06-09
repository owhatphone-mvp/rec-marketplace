// src/email.js
// ส่งอีเมลรีเซ็ตรหัสผ่านผ่าน Gmail SMTP (Google Workspace ของ info@rectokenasean.com)
// env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// ถ้าไม่มี SMTP_USER/SMTP_PASS -> ไม่ส่งจริง แต่ log ลิงก์ออก console (เทสได้โดยไม่ต้องมีเมล)

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'info@rectokenasean.com';

// 465 = SSL/TLS ตรง (secure), 587 = STARTTLS (secure=false แล้ว upgrade)
const secure = SMTP_PORT === 465;

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure,
    requireTLS: !secure, // บังคับ STARTTLS เมื่อใช้ 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

function resetEmailHtml(resetLink) {
  return `<!DOCTYPE html>
<html lang="th">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#0b5d3b;padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;">REC Marketplace</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;color:#13231b;font-size:20px;">ตั้งรหัสผ่านใหม่</h2>
          <p style="margin:0 0 20px;color:#445;line-height:1.6;font-size:15px;">
            เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชีนี้ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่
            <strong>ลิงก์นี้ใช้ได้ภายใน 30 นาที</strong> และใช้ได้เพียงครั้งเดียว
          </p>
          <p style="margin:0 0 28px;">
            <a href="${resetLink}" style="display:inline-block;background:#0b5d3b;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:600;">ตั้งรหัสผ่านใหม่</a>
          </p>
          <p style="margin:0 0 8px;color:#889;font-size:13px;">หากปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:</p>
          <p style="margin:0 0 24px;word-break:break-all;font-size:13px;"><a href="${resetLink}" style="color:#0b5d3b;">${resetLink}</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;">
          <p style="margin:0;color:#99a;font-size:12px;line-height:1.5;">
            ถ้าคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน ไม่ต้องดำเนินการใดๆ บัญชีของคุณยังปลอดภัยดี
          </p>
        </td></tr>
        <tr><td style="background:#fafbfc;padding:16px 32px;text-align:center;color:#aab;font-size:12px;">
          © REC Marketplace · rectokenasean.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * ส่งอีเมลลิงก์รีเซ็ตรหัสผ่าน
 * @param {string} to - อีเมลผู้รับ
 * @param {string} resetLink - URL เต็ม market.rectokenasean.com/reset.html?token=...
 * @returns {Promise<{sent:boolean, logged?:boolean}>}
 */
async function sendResetEmail(to, resetLink) {
  if (!SMTP_USER || !SMTP_PASS) {
    // โหมด dev/ไม่มี SMTP: log ลิงก์แทนการส่งจริง
    console.log('[email] SMTP ไม่ได้ตั้งค่า — log ลิงก์รีเซ็ตแทน:');
    console.log(`[email] -> ${to}: ${resetLink}`);
    return { sent: false, logged: true };
  }
  await getTransporter().sendMail({
    from: `REC Marketplace <${SMTP_FROM}>`,
    to,
    subject: 'ตั้งรหัสผ่านใหม่ — REC Marketplace',
    html: resetEmailHtml(resetLink),
    text: `ตั้งรหัสผ่านใหม่สำหรับ REC Marketplace (ลิงก์ใช้ได้ 30 นาที ครั้งเดียว):\n${resetLink}\n\nหากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน ไม่ต้องดำเนินการใดๆ`,
  });
  console.log(`[email] ส่งลิงก์รีเซ็ตไปที่ ${to} แล้ว`);
  return { sent: true };
}

module.exports = { sendResetEmail };
