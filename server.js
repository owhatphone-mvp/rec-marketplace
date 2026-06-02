require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbmod = require('./src/db');
const { db, save, nextId } = dbmod;
const payment = require('./src/payment');
const { renderCertificate } = require('./src/certificate');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-demo-key';
const AML_THRESHOLD = Number(process.env.AML_REVIEW_THRESHOLD || 5000000);

function sign(u){ return jwt.sign({ uid: u.id, email: u.email }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req,res,next){
  const h=req.headers.authorization||''; const t=h.startsWith('Bearer ')?h.slice(7):null;
  if(!t) return res.status(401).json({error:'unauthorized'});
  try{ req.user=jwt.verify(t,JWT_SECRET); next(); }catch{ return res.status(401).json({error:'invalid token'}); }
}
function adminOnly(req,res,next){ if((req.headers['x-admin-key']||req.query.key)!==ADMIN_KEY) return res.status(403).json({error:'forbidden'}); next(); }
function findUser(uid){ return db().users.find(u=>u.id===uid); }
function publicUser(u){ return { id:u.id, email:u.email, walletType:u.walletType, address:u.address, recBalance:u.recBalance }; }

app.get('/api/market',(req,res)=>{ const c=db().config;
  res.json({ priceTHB:c.priceTHB, currency:c.currency, available:Math.max(0,c.treasuryRec-c.recSold), recSold:c.recSold, recRetired:c.recRetired, note:'ช่วงเปิดตัว ราคานี้ · หลังจากนั้นปรับเป็นราคาเฉลี่ยจาก exchange ทั่วโลก' });
});

app.post('/api/auth/signup',(req,res)=>{
  const {email,password}=req.body||{};
  if(!email||!password) return res.status(400).json({error:'email & password required'});
  const d=db();
  if(d.users.find(u=>u.email.toLowerCase()===email.toLowerCase())) return res.status(409).json({error:'email already registered'});
  const user={ id:nextId('user'), email, passwordHash:bcrypt.hashSync(password,10), walletType:'custodial', address:null, recBalance:0, createdAt:new Date().toISOString() };
  d.users.push(user); save();
  res.json({ token:sign(user), user:publicUser(user) });
});
app.post('/api/auth/login',(req,res)=>{
  const {email,password}=req.body||{};
  const u=db().users.find(x=>x.email.toLowerCase()===(email||'').toLowerCase());
  if(!u||!bcrypt.compareSync(password||'',u.passwordHash)) return res.status(401).json({error:'invalid credentials'});
  res.json({ token:sign(u), user:publicUser(u) });
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
  const order={ id,ref,userId:u.id,qty:q,priceTHB:c.priceTHB,amountTHB,method,provider:pay.provider,status:'pending',amlReview:amountTHB>=AML_THRESHOLD,promptpay:pay.promptpay||null,psRef:pay.referenceNo||null,psOrderNo:pay.orderNo||null,createdAt:new Date().toISOString() };
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
  const cert={ id:'REC-RT-'+String(seq).padStart(6,'0'), userId:u.id, amount:q, beneficiary:beneficiary||u.email, purpose:purpose||'Voluntary REC retirement', walletRef:u.walletType==='metamask'?u.address:u.email, date:new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}), createdAt:new Date().toISOString() };
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
    orders:d.orders.slice(-50).reverse(), certificates:d.certificates.slice(-50).reverse(), users:d.users.map(publicUser) });
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
  return '\uFEFF'+head+'\n'+body; // BOM = Excel อ่านภาษาไทยถูก
}
function sendCSV(res,name,csv){
  res.set('Content-Type','text/csv; charset=utf-8');
  res.set('Content-Disposition',`attachment; filename="${name}"`);
  res.send(csv);
}
app.get('/api/admin/export/users',adminOnly,(req,res)=>{
  const rows=db().users;
  sendCSV(res,'rec-users.csv',toCSV(rows,[
    {label:'id',key:'id'},{label:'email',key:'email'},
    {label:'walletType',key:'walletType'},{label:'metamaskAddress',get:u=>u.address||''},
    {label:'recBalance',key:'recBalance'},{label:'createdAt',key:'createdAt'}
  ]));
});
app.get('/api/admin/export/orders',adminOnly,(req,res)=>{
  sendCSV(res,'rec-orders.csv',toCSV(db().orders,[
    {label:'ref',key:'ref'},{label:'userId',key:'userId'},
    {label:'email',get:o=>{const u=db().users.find(x=>x.id===o.userId);return u?u.email:'';}},
    {label:'qty',key:'qty'},{label:'priceTHB',key:'priceTHB'},{label:'amountTHB',key:'amountTHB'},
    {label:'method',key:'method'},{label:'status',key:'status'},{label:'amlReview',key:'amlReview'},
    {label:'createdAt',key:'createdAt'},{label:'paidAt',get:o=>o.paidAt||''}
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
