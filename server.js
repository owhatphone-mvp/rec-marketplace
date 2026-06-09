require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbmod = require('./src/db');
const { db, save, nextId } = dbmod;
const payment = require('./src/payment');
const { renderCertificate } = require('./src/certificate');
const { sendResetEmail } = require('./src/email');

const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', true); // Railway/proxy → req.ip = real client IP

// เก็บหลักฐานยืนยันธุรกรรม: IP, อุปกรณ์, browser, OS, ภาษา, เวลา
function captureMeta(req){
const ua = req.headers['user-agent'] || '';
const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.ip || req.connection?.remoteAddress || '';
// parse แบบเบาๆ (ไม่ใช้ lib)
let os='Unknown', browser='Unknown', device='Desktop';
if(/Windows NT 10/.test(ua))os='Windows 10/11'; else if(/Windows NT/.test(ua))os='Windows';
else if(/iPhone|iPad|iPod/.test(ua)){os='iOS';device='Mobile';} else if(/Android/.test(ua)){os='Android';device='Mobile';}
else if(/Mac OS X/.test(ua))os='macOS'; else if(/Linux/.test(ua))os='Linux';
if(/Edg\//.test(ua))browser='Edge'; else if(/Chrome\//.test(ua))browser='Chrome';
else if(/Firefox\//.test(ua))browser='Firefox'; else if(/Safari\//.test(ua)&&!/Chrome/.test(ua))browser='Safari';
if(/Mobile/.test(ua))device='Mobile';
return { ip, ua, os, browser, device,
lang: req.headers['accept-language']||'',
at: new Date().toISOString() };
}
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-demo-key';
const AML_THRESHOLD = Number(process.env.AML_REVIEW_THRESHOLD || 5000000);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://market.rectokenasean.com';
const RESET_TTL_MS = 30 * 60 * 1000; // ลิงก์รีเซ็ตหมดอายุ 30 นาที

function sign(u){ return jwt.sign({ uid: u.id, email: u.email }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req,res,next){
const h=req.headers.authorization||''; const t=h.startsWith('Bearer ')?h.slice(7):null;
if(!t) return res.status(401).json({error:'unauthorized'});
try{ req.user=jwt.verify(t,JWT_SECRET); next(); }catch{ return res.status(401).json({error:'invalid token'}); }
}
function adminOnly(req,res,next){ if((req.headers['x-admin-key']||req.query.key)!==ADMIN_KEY) return res.status(403).json({error:'forbidden'}); next(); }
function findUser(uid){ return db().users.find(u=>u.id===uid); }
function publicUser(u){ return { id:u.id, email:u.email, phone:u.phone||'', walletType:u.walletType, address:u.address, recBalance:u.recBalance }; }

app.get('/api/market',(req,res)=>{ const c=db().config;
res.json({ priceTHB:c.priceTHB, currency:c.currency, available:Math.max(0,c.treasuryRec-c.recSold), recSold:c.recSold, recRetired:c.recRetired, note:'ช่วงเปิดตัว ราคานี้ · หลังจากนั้นปรับเป็นราคาเฉลี่ยจาก exchange ทั่วโลก' });
});

app.post('/api/auth/signup',(req,res)=>{
const {email,password,phone}=req.body||{};
if(!email||!password) return res.status(400).json({error:'email & password required'});
const d=db();
if(d.users.find(u=>u.email.toLowerCase()===email.toLowerCase())) return res.status(409).json({error:'email already registered'});
const user={ id:nextId('user'), email, passwordHash:bcrypt.hashSync(password,10), phone:phone||'', walletType:'custodial', address:null, recBalance:0, createdAt:new Date().toISOString(), signupMeta:captureMeta(req) };
d.users.push(user); save();
res.json({ token:sign(user), user:publicUser(user) });
});
app.post('/api/auth/login',(req,res)=>{
const {email,password}=req.body||{};
const u=db().users.find(x=>x.email.toLowerCase()===(email||'').toLowerCase());
if(!u||!bcrypt.compareSync(password||'',u.passwordHash)) return res.status(401).json({error:'invalid credentials'});
res.json({ token:sign(u), user:publicUser(u) });
});

// ---- ลืมรหัสผ่าน: ขอลิงก์รีเซ็ตทางอีเมล ----
// ตอบ {ok:true} เสมอ ไม่ว่าอีเมลจะมีจริงหรือไม่ (กัน email enumeration)
app.post('/api/auth/request-reset', async (req,res)=>{
const email=String((req.body&&req.body.email)||'').trim().toLowerCase();
try{
if(email){
const u=db().users.find(x=>x.email.toLowerCase()===email);
if(u){
const token=crypto.randomBytes(32).toString('hex');
u.resetToken=token; u.resetExp=Date.now()+RESET_TTL_MS;
await save();
const link=`${PUBLIC_BASE_URL}/reset.html?token=${token}`;
await sendResetEmail(u.email, link);
}
}
}catch(e){ console.error('[request-reset]', e); }
res.json({ ok:true });
});

// ---- ลืมรหัสผ่าน: ตั้งรหัสใหม่ด้วย token (ใช้ครั้งเดียว) ----
app.post('/api/auth/reset', async (req,res)=>{
const token=String((req.body&&req.body.token)||'');
const newPassword=String((req.body&&req.body.newPassword)||'');
if(!token||newPassword.length<6) return res.status(400).json({error:'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'});
const u=db().users.find(x=>x.resetToken===token);
if(!u||!u.resetExp||u.resetExp<Date.now()) return res.status(400).json({error:'ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอใหม่'});
u.passwordHash=bcrypt.hashSync(newPassword,10);
u.resetToken=null; u.resetExp=null;
await save();
res.json({ ok:true });
});

app.post('/api/wallet/metamask',auth,(req,res)=>{
const {address}=req.body||{};
if(!address||!/^0x[0-9a-fA-F]{6,}$/.test(address)) return res.status(400).json({error:'invalid address'});
const u=findUser(req.user.uid); u.address=address; u.walletType='metamask'; save();
res.json({ user:publicUser(u) });
});
app.get('/api/wallet',auth,(req,res)=>{
const u=findUser(req.user.uid);
const certs=db().certificates.filter(c=>c.userId===u.id);
res.json({ user:publicUser(u), certificates:certs });
});

app.post('/api/orders',auth,async(req,res)=>{
const {qty,method}=req.body||{};
const q=Math.floor(Number(qty));
if(!q||q<1) return res.status(400).json({error:'ขั้นต่ำ 1 เหรียญ'});
if(!['promptpay','card'].includes(method)) return res.status(400).json({error:'method must be promptpay|card'});
if(method==='card' && q<10) return res.status(400).json({error:'ชำระด้วยบัตรเครดิตขั้นต่ำ 10 เหรียญ'});
const d=db(); const c=d.config; const available=c.treasuryRec-c.recSold;
if(q>available) return res.status(409).json({error:`insufficient inventory (available ${available})`});
const amountTHB=q*c.priceTHB; const id=nextId('order'); const ref='ORD-'+String(id).padStart(6,'0');
const u=findUser(req.user.uid);
let pay; try{ pay=await payment.createPayment({method,amountTHB,orderRef:ref,orderId:id,email:u.email,productName:q+' REC'}); }catch(e){ return res.status(500).json({error:e.message}); }
const order={ id,ref,userId:u.id,qty:q,priceTHB:c.priceTHB,amountTHB,method,provider:pay.provider,status:'pending',amlReview:amountTHB>=AML_THRESHOLD,promptpay:pay.promptpay||null,psRef:pay.referenceNo||null,psOrderNo:pay.orderNo||null,createdAt:new Date().toISOString(), meta:captureMeta(req) };
d.orders.push(order); save();
res.json({ order, payment:pay });
});
app.post('/api/orders/:id/confirm',auth,async(req,res)=>{
const d=db(); const order=d.orders.find(o=>o.id===Number(req.params.id)&&o.userId===req.user.uid);
if(!order) return res.status(404).json({error:'order not found'});
if(order.status==='paid') return res.json({order});
let result; try{ result=await payment.confirmPayment({provider:order.provider}); }catch(e){ return res.status(500).json({error:e.message}); }
if(result.status!=='paid') return res.status(402).json({error:'payment not completed'});
order.status='paid'; order.paidAt=new Date().toISOString();
const u=findUser(order.userId); u.recBalance+=order.qty; d.config.recSold+=order.qty; await save();
res.json({ order, user:publicUser(u) });
});

app.post('/api/retire',auth,async(req,res)=>{
const {qty,beneficiary,purpose}=req.body||{};
const q=Math.floor(Number(qty));
if(!q||q<=0) return res.status(400).json({error:'qty must be > 0'});
const u=findUser(req.user.uid);
if(q>u.recBalance) return res.status(409).json({error:`insufficient balance (${u.recBalance})`});
const d=db(); u.recBalance-=q; d.config.recRetired+=q;
const seq=nextId('cert');
const cert={ id:'REC-RT-'+String(seq).padStart(6,'0'), userId:u.id, amount:q, beneficiary:beneficiary||u.email, purpose:purpose||'Voluntary REC retirement', walletRef:u.walletType==='metamask'?u.address:u.email, date:new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}), createdAt:new Date().toISOString(), meta:captureMeta(req) };
d.certificates.push(cert); await save();
res.json({ certificate:cert, user:publicUser(u) });
});
app.get('/api/certificates/:id',(req,res)=>{
const cert=db().certificates.find(c=>c.id===req.params.id);
if(!cert) return res.status(404).send('Certificate not found');
res.set('Content-Type','text/html; charset=utf-8').send(renderCertificate(cert));
});

app.get('/api/admin/overview',adminOnly,(req,res)=>{
const d=db();
res.json({ config:d.config, counts:{users:d.users.length,orders:d.orders.length,certificates:d.certificates.length},
revenueTHB:d.orders.filter(o=>o.status==='paid').reduce((s,o)=>s+o.amountTHB,0),
amlFlags:d.orders.filter(o=>o.amlReview).map(o=>({ref:o.ref,amountTHB:o.amountTHB,status:o.status})),
orders:d.orders.slice(-50).reverse().map(o=>Object.assign({email:(d.users.find(x=>x.id===o.userId)||{}).email||''},o)), certificates:d.certificates.slice(-50).reverse(), users:d.users.map(publicUser) });
});
app.post('/api/admin/price',adminOnly,(req,res)=>{
const p=Number(req.body&&req.body.priceTHB);
if(!p||p<=0) return res.status(400).json({error:'priceTHB must be > 0'});
db().config.priceTHB=p; save(); res.json({config:db().config});
});
app.post('/api/admin/reset-password',adminOnly,async(req,res)=>{
const {email,newPassword}=req.body||{};
if(!email||!newPassword||newPassword.length<6) return res.status(400).json({error:'email + newPassword(>=6) required'});
const u=db().users.find(x=>x.email.toLowerCase()===String(email).toLowerCase());
if(!u) return res.status(404).json({error:'user not found'});
u.passwordHash=bcrypt.hashSync(newPassword,10); await save();
res.json({ok:true,email:u.email});
});

// ---- PaySolutions: poll inquiry to confirm PromptPay payment ----
async function creditOrderPaid(order){
if(order.status==='paid') return false;
order.status='paid'; order.paidAt=new Date().toISOString();
const u=findUser(order.userId); if(u){ u.recBalance+=order.qty; }
db().config.recSold+=order.qty; await save();
return true;
}
app.post('/api/orders/:id/poll', auth, async (req,res)=>{
const order=db().orders.find(o=>o.id===Number(req.params.id)&&o.userId===req.user.uid);
if(!order) return res.status(404).json({error:'order not found'});
if(order.status==='paid') return res.json({ paid:true, order });
if(!payment.paysol) return res.status(500).json({error:'paysolutions not loaded'});
let r; try{ r=await payment.paysol.inquire({ referenceNo:order.psRef, orderNo:order.psOrderNo }); }
catch(e){ return res.status(500).json({error:e.message}); }
if(r.paid){ await creditOrderPaid(order); return res.json({ paid:true, order }); }
res.json({ paid:false, status:r.status });
});

function toCSV(rows, cols){
const esc=v=>{ v=(v===null||v===undefined)?'':String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
const head=cols.map(c=>c.label).join(',');
const body=rows.map(r=>cols.map(c=>esc(typeof c.get==='function'?c.get(r):r[c.key])).join(',')).join('\n');
return '﻿'+head+'\n'+body; // BOM = Excel อ่านภาษาไทยถูก
}
function sendCSV(res,name,csv){
res.set('Content-Type','text/csv; charset=utf-8');
res.set('Content-Disposition',`attachment; filename="${name}"`);
res.send(csv);
}
app.get('/api/admin/export/users',adminOnly,(req,res)=>{
const rows=db().users;
sendCSV(res,'rec-users.csv',toCSV(rows,[
{label:'id',key:'id'},{label:'email',key:'email'},{label:'phone',key:'phone'},
{label:'walletType',key:'walletType'},{label:'metamaskAddress',get:u=>u.address||''},
{label:'recBalance',key:'recBalance'},{label:'createdAt',key:'createdAt'},
{label:'signupIP',get:u=>u.signupMeta?.ip||''},{label:'signupDevice',get:u=>u.signupMeta?.device||''},
{label:'signupOS',get:u=>u.signupMeta?.os||''},{label:'signupBrowser',get:u=>u.signupMeta?.browser||''}
]));
});
app.get('/api/admin/export/orders',adminOnly,(req,res)=>{
sendCSV(res,'rec-orders.csv',toCSV(db().orders,[
{label:'ref',key:'ref'},{label:'userId',key:'userId'},
{label:'email',get:o=>{const u=db().users.find(x=>x.id===o.userId);return u?u.email:'';}},
{label:'qty',key:'qty'},{label:'priceTHB',key:'priceTHB'},{label:'amountTHB',key:'amountTHB'},
{label:'method',key:'method'},{label:'status',key:'status'},{label:'amlReview',key:'amlReview'},
{label:'createdAt',key:'createdAt'},{label:'paidAt',get:o=>o.paidAt||''},
{label:'ip',get:o=>o.meta?.ip||''},{label:'device',get:o=>o.meta?.device||''},
{label:'os',get:o=>o.meta?.os||''},{label:'browser',get:o=>o.meta?.browser||''},
{label:'lang',get:o=>o.meta?.lang||''},{label:'userAgent',get:o=>o.meta?.ua||''}
]));
});
app.get('/api/admin/export/certificates',adminOnly,(req,res)=>{
sendCSV(res,'rec-certificates.csv',toCSV(db().certificates,[
{label:'id',key:'id'},{label:'userId',key:'userId'},
{label:'email',get:c=>{const u=db().users.find(x=>x.id===c.userId);return u?u.email:'';}},
{label:'amount',key:'amount'},{label:'beneficiary',key:'beneficiary'},{label:'purpose',key:'purpose'},
{label:'walletRef',key:'walletRef'},{label:'date',key:'date'},{label:'createdAt',key:'createdAt'}
]));
});

app.get('/api/health',(req,res)=>res.json({ok:true,paymentMode:payment.MODE,db:dbmod.USE_PG?'postgres':'json'}));

const PORT=process.env.PORT||3000;
dbmod.init().then(()=>{
app.listen(PORT,()=>console.log(`REC Marketplace on http://localhost:${PORT} (payment: ${payment.MODE}, db: ${dbmod.USE_PG?'postgres':'json'})`));
}).catch(e=>{ console.error('DB init failed:',e); process.exit(1); });
