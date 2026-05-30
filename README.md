# REC Marketplace (MVP)

ระบบขาย **REC** (Utility Token พร้อมใช้ กลุ่ม 1) แบบทางเดียว ราคาคงที่ 40฿ — สมัครด้วยอีเมล (custodial wallet) หรือเชื่อม MetaMask, ชำระ PromptPay/บัตรเครดิต, แล้ว **retire รับใบ Certificate**
แบรนด์: **REC Marketplace by RECTOKEN ASEAN** (`market.rectokenasean.com`)

> ⚠️ MVP รันได้จริง แต่ payment / on-chain settlement / registry ยังเป็นโหมดทดสอบ ต้องทำตาม Go-live checklist ก่อนรับเงินจริง

## รันบนเครื่อง
```bash
cd rec-marketplace
cp .env.example .env      # แก้ JWT_SECRET / ADMIN_KEY
npm install
npm start
```
- ผู้ใช้: http://localhost:3000
- แอดมิน: http://localhost:3000/admin.html (ADMIN_KEY เริ่มต้น `admin-demo-key`)

ข้อมูลเก็บที่ `data/db.json` (สร้างอัตโนมัติ) · payment เริ่มต้น `mock` (ไม่รับเงินจริง)

## โครงสร้าง
```
server.js            Express API + เสิร์ฟ public/
src/db.js            JSON store (เปลี่ยนเป็น Postgres ตอน production)
src/payment.js       payment: mock | omise (PromptPay + บัตร)
src/certificate.js   ใบ certificate (HTML พิมพ์/เซฟ PDF ได้ รองรับไทย)
public/index.html    เว็บแอปผู้ใช้   public/app.js  เรียก API   public/admin.html  แอดมิน
```

### API
GET /api/market · POST /api/auth/signup|login · POST /api/wallet/metamask · GET /api/wallet
· POST /api/orders · POST /api/orders/:id/confirm · POST /api/retire · GET /api/certificates/:id
· GET|POST /api/admin/* (ต้องมี header x-admin-key)

## เปิดรับเงินจริง (Omise — PSP ไทย: PromptPay + บัตร)
1. สมัคร dashboard.omise.co รับ public/secret key
2. .env: `PAYMENT_MODE=omise` + ใส่ key
3. `npm install omise`
4. uncomment โค้ดใน src/payment.js + ฝั่ง client ใช้ Omise.js สร้าง card token
5. ตั้ง webhook ยืนยันสถานะ charge ก่อนเครดิต REC

## Go-live checklist
กฎหมาย (ให้ Baker & McKenzie ยืนยัน — ไม่ใช่คำแนะนำทางกฎหมาย):
- [x] REC = Utility Token กลุ่ม 1 → ผู้ขายตลาดแรกไม่ต้องขอใบอนุญาต ก.ล.ต. และไม่ติด KYC แบบ exchange
- [ ] AMLA: ธุรกรรม ≥ 5 ล้านบาท / น่าสงสัย รายงาน ปปง. (ระบบมี flag amlReview ให้แล้ว)
- [ ] ใช้คำว่า "Marketplace" ไม่ใช่ "Exchange" และไม่อ้างว่าได้ใบอนุญาต ก.ล.ต.
- [ ] คำเตือนความเสี่ยง + ข้อมูลโทเคนครบ (consumer protection) — มีแบนเนอร์แล้ว
- [ ] ห้ามให้โทเคนถูกใช้เป็นสื่อกลางชำระค่าสินค้า (ธปท.)

เทคนิคก่อน production:
- [ ] เปลี่ยน JWT_SECRET, ADMIN_KEY เป็นค่าสุ่มยาว
- [ ] ย้าย JSON store → PostgreSQL
- [ ] เปิด Omise/2C2P จริง + webhook
- [ ] On-chain settlement: ส่ง REC จริงจาก treasury ไป MetaMask address (REC บน Optimism/CO2E/Kubchain)
- [ ] Registry: sync การ retire กับ I-REC/REDEX กัน double counting
- [ ] HTTPS, rate limit, validation, logging/monitoring
- [ ] เมื่อ REC list บน Bitkub → สลับราคาไปอิง ticker API

## ทดสอบแล้ว (mock)
signup → buy → confirm → wallet balance → retire → certificate → admin (revenue/inventory/AML) · กันซื้อเกิน stock / retire เกินยอด / เรียก API โดยไม่ login
