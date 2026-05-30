# Deploy: GitHub → Railway (backend) → Netlify (frontend)

ระบบนี้ backend เป็น Node/Express (มี state/ไฟล์ DB) → host ที่ **Railway**
frontend (โฟลเดอร์ public/) สามารถ host แยกที่ **Netlify** โดยชี้ API ไป Railway

> ทางลัด: ถ้าไม่อยากแยก ใช้ **Railway อย่างเดียว** ก็ได้ (Express เสิร์ฟ public/ ให้อยู่แล้ว) — ข้าม Netlify ไป

## 1) GitHub
- ลบโฟลเดอร์ `.git` เดิมทิ้ง (เสียจาก sandbox) แล้วสร้าง repo ใหม่
- หรือใช้ GitHub Desktop: Add Local Repository → เลือกโฟลเดอร์ `rec-marketplace` → Publish

## 2) Railway (backend API)
1. railway.app → New Project → Deploy from GitHub repo → เลือก repo
2. Railway อ่าน Procfile/Nixpacks เอง รัน `node server.js`
3. Variables: ตั้ง `JWT_SECRET`, `ADMIN_KEY` (ค่าสุ่มยาว), `PAYMENT_MODE=mock`
4. (กัน data หาย) เพิ่ม Volume mount ที่ `/app/data` แล้วตั้ง `DATA_DIR=/app/data`
5. Settings → Networking → Generate Domain → ได้ URL เช่น `https://rec-marketplace.up.railway.app`

ใช้ Railway อย่างเดียว: เปิด URL นั้น = เว็บพร้อมใช้ (มี /admin.html ด้วย) จบ

## 3) Netlify (frontend แยก — ถ้าต้องการ)
1. แก้ `public/config.js` → `window.API_BASE = "https://<railway-url>";`
2. netlify.com → Add new site → Import from GitHub → เลือก repo
3. Build command: เว้นว่าง · Publish directory: `public`
4. Deploy → ได้ URL Netlify
5. Custom domain: `market.rectokenasean.com` → ใส่ CNAME ตามที่ Netlify บอก ที่ผู้ดูแลโดเมน

## หมายเหตุ
- โหมด mock = ไม่รับเงินจริง. เปิด Omise จริงตาม README ก่อน go-live
- CORS เปิดไว้แล้วใน backend (รองรับ frontend คนละโดเมน)
