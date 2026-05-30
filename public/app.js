const API = (window.API_BASE||'');
let token = localStorage.getItem('rec_token') || null;
let market = { priceTHB: 40 };
let authMode = 'signup';
let payMethod = 'promptpay';
const $ = id => document.getElementById(id);
const fmt = n => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }
async function api(path, opts={}){
  opts.headers=Object.assign({'Content-Type':'application/json'},opts.headers||{});
  if(token) opts.headers.Authorization='Bearer '+token;
  const r=await fetch(API+path,opts); const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||('error '+r.status)); return data;
}
function show(view){
  ['auth','home','buy','pay','retire'].forEach(v=>$('view-'+v).classList.add('hidden'));
  $('view-'+view).classList.remove('hidden');
  $('logoutBtn').classList.toggle('hidden',view==='auth');
  if(view==='home') loadWallet();
  if(view==='buy') buyCalc();
  if(view==='pay'){ $('pay-qty').textContent=qty(); $('pay-total').textContent=fmt(qty()*market.priceTHB); }
  if(view==='retire') loadRetire();
  window.scrollTo(0,0);
}
async function loadMarket(){
  try{ market=await api('/api/market');
    $('hero-price').innerHTML='฿'+fmt(market.priceTHB)+' <span style="font-size:14px;font-weight:600">/ REC</span>';
    $('hero-note').textContent=market.note||''; $('buy-price').textContent=market.priceTHB;
  }catch(e){}
}
function authTab(m){ authMode=m; $('tab-signup').classList.toggle('on',m==='signup'); $('tab-login').classList.toggle('on',m==='login'); $('au-btn').textContent=m==='signup'?'สมัครและสร้าง Wallet':'เข้าสู่ระบบ'; }
async function doAuth(){
  const email=$('au-email').value.trim(), password=$('au-pass').value;
  if(!email||!password) return toast('กรอกอีเมลและรหัสผ่าน');
  $('au-btn').disabled=true;
  try{ const res=await api(authMode==='signup'?'/api/auth/signup':'/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
    token=res.token; localStorage.setItem('rec_token',token); show('home');
  }catch(e){ toast(e.message); } $('au-btn').disabled=false;
}
function logout(){ token=null; localStorage.removeItem('rec_token'); show('auth'); }
async function loadWallet(){
  try{ const w=await api('/api/wallet');
    $('w-id').textContent=w.user.walletType==='metamask'?w.user.address:w.user.email;
    $('w-rec').textContent=w.user.recBalance; $('w-thb').textContent=fmt(w.user.recBalance*market.priceTHB); $('w-type').textContent=w.user.walletType;
    const list=$('cert-list');
    if(!w.certificates.length){ list.innerHTML='<p class="sub">ยังไม่มี certificate — กด Retire เพื่อแลกเป็นใบรับรอง</p>'; }
    else{ list.innerHTML=w.certificates.slice().reverse().map(c=>`<div class="certrow"><div class="ic">♻️</div><div style="flex:1"><b>${c.amount} REC retired</b><br><a class="cl" href="/api/certificates/${c.id}" target="_blank">${c.id} · ดูใบรับรอง ↗</a></div></div>`).join(''); }
  }catch(e){ if(e.message.includes('token')||e.message.includes('unauthorized')) logout(); }
}
const qty=()=>Math.max(0,Math.floor(Number($('buy-qty').value)||0));
function setQ(v){ $('buy-qty').value=v; buyCalc(); }
function buyCalc(){ $('buy-total').textContent=fmt(qty()*market.priceTHB); }
function payTab(m){ payMethod=m; $('pm-pp').classList.toggle('on',m==='promptpay'); $('pm-cc').classList.toggle('on',m==='card'); $('pp-box').classList.toggle('hidden',m!=='promptpay'); $('cc-box').classList.toggle('hidden',m!=='card'); }
async function doBuy(){
  const q=qty(); if(q<=0) return toast('ใส่จำนวน REC');
  $('pay-btn').disabled=true; $('pay-btn').innerHTML='<span class="loader"></span> กำลังประมวลผล...';
  try{ const {order}=await api('/api/orders',{method:'POST',body:JSON.stringify({qty:q,method:payMethod})});
    await api('/api/orders/'+order.id+'/confirm',{method:'POST'}); toast('ซื้อสำเร็จ +'+q+' REC'); show('home');
  }catch(e){ toast(e.message); } $('pay-btn').disabled=false; $('pay-btn').textContent='ยืนยันชำระเงิน';
}
async function loadRetire(){ const w=await api('/api/wallet'); $('r-avail').textContent=w.user.recBalance; $('r-qty').value=w.user.recBalance; }
async function doRetire(){
  const q=Math.floor(Number($('r-qty').value)||0); if(q<=0) return toast('ใส่จำนวนที่จะ retire');
  $('r-btn').disabled=true;
  try{ const res=await api('/api/retire',{method:'POST',body:JSON.stringify({qty:q,beneficiary:$('r-bene').value,purpose:$('r-purpose').value})});
    toast('Retire สำเร็จ — '+res.certificate.id); window.open('/api/certificates/'+res.certificate.id,'_blank'); show('home');
  }catch(e){ toast(e.message); } $('r-btn').disabled=false;
}
async function connectMetaMask(){
  if(!window.ethereum) return toast('ไม่พบ MetaMask — ติดตั้ง extension ก่อน');
  try{ const a=await window.ethereum.request({method:'eth_requestAccounts'});
    await api('/api/wallet/metamask',{method:'POST',body:JSON.stringify({address:a[0]})}); toast('เชื่อม MetaMask แล้ว'); loadWallet();
  }catch(e){ toast(e.message); }
}
loadMarket().then(()=>{ if(token) show('home'); else show('auth'); });
