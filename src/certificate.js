function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderCertificate(cert){
  const {id,amount,beneficiary,purpose,date,walletRef}=cert;
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificate ${escapeHtml(id)}</title>
<style>
  body{font-family:"Segoe UI",system-ui,"Noto Sans Thai",Tahoma,sans-serif;background:#eef2f4;margin:0;padding:24px;color:#0e1726}
  .cert{max-width:720px;margin:0 auto;background:#fff;border:3px solid #15a34a;border-radius:18px;padding:40px;position:relative}
  .seal{position:absolute;top:28px;right:28px;width:70px;height:70px;border-radius:50%;background:#15a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:34px}
  .brand{font-size:13px;color:#0f7d39;font-weight:700;letter-spacing:1px}
  h1{font-size:26px;margin:6px 0 2px}.muted{color:#6b7785;font-size:13px}
  .big{font-size:46px;font-weight:800;color:#0f7d39;margin:22px 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}
  td{padding:10px 0;border-top:1px dashed #cfe6d6}td.k{color:#6b7785;width:42%}td.v{text-align:right;font-weight:600}
  .status{display:inline-block;background:#e8f7ee;color:#0f7d39;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700}
  .foot{margin-top:24px;font-size:11px;color:#94a3b8;line-height:1.6}
  .btn{display:inline-block;margin:16px auto 0;background:#15a34a;color:#fff;border:0;padding:12px 20px;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit}
  @media print{.noprint{display:none}body{background:#fff;padding:0}}
</style></head><body>
<div class="cert">
  <div class="seal">&#10003;</div>
  <img src="/bolt-64.png" alt="RECTOKEN" style="height:52px;width:auto;object-fit:contain;margin-bottom:8px">
  <div class="brand">REC MARKETPLACE &middot; RECTOKEN ASEAN</div>
  <h1>Certificate of Retirement</h1>
  <div class="muted">Renewable Energy Certificate (REC) &mdash; permanently retired</div>
  <div class="big">${Number(amount).toLocaleString()} REC</div>
  <table>
    <tr><td class="k">ผู้รับใบรับรอง / Beneficiary</td><td class="v">${escapeHtml(beneficiary)}</td></tr>
    <tr><td class="k">วัตถุประสงค์ / Purpose</td><td class="v">${escapeHtml(purpose)}</td></tr>
    <tr><td class="k">วันที่ / Date</td><td class="v">${escapeHtml(date)}</td></tr>
    <tr><td class="k">Certificate ID</td><td class="v">${escapeHtml(id)}</td></tr>
    <tr><td class="k">Wallet</td><td class="v">${escapeHtml(walletRef||'-')}</td></tr>
    <tr><td class="k">ออกโดย / Issued by</td><td class="v">RECTOKEN by BlockEdge</td></tr>
    <tr><td class="k">จัดจำหน่ายและดำเนินการ retire โดย<br>Sold &amp; retired via</td><td class="v">M Vision Public Co., Ltd.</td></tr>
    <tr><td class="k">Registry</td><td class="v">I-REC / REDEX</td></tr>
    <tr><td class="k">สถานะ / Status</td><td class="v"><span class="status">Retired &middot; double-counting prevented</span></td></tr>
    <tr><td class="k">ตรวจสอบบนบล็อกเชน / Verify on-chain</td><td class="v"><a href="https://explorer.optimism.io/address/0xb10c4EDf6Ee11F084fc24851883B0B237C96E6A8" target="_blank" rel="noopener" style="color:#0f7d39;font-weight:700;text-decoration:none">&#128279; ดูบน Optimism Explorer</a><div style="font-size:10px;color:#94a3b8;font-weight:400">เร็วๆ นี้จะลิงก์ตรงรายการธุรกรรมของใบนี้</div></td></tr>
  </table>
  <div style="margin-top:18px;padding:14px 16px;background:#f6fdf8;border:1px solid #cfe6d6;border-radius:12px;text-align:center">
    <div style="font-size:13.5px;color:#0f7d39;font-weight:600;line-height:1.5">ขอบคุณที่ร่วมสนับสนุนพลังงานสะอาดเพื่ออนาคตที่ยั่งยืน</div>
    <div style="font-size:12px;color:#6b7785;margin-top:3px">Thank you for advancing a sustainable, clean-energy future.</div>
  </div>
  <div class="foot">เอกสารนี้ยืนยันว่าจำนวน REC ข้างต้นถูก retire อย่างถาวรเพื่อวัตถุประสงค์ที่ระบุ &middot; REC = Utility Token พร้อมใช้ กลุ่ม 1 &middot; REC Marketplace เป็นผู้ขายโทเคนกลุ่ม 1 ไม่ใช่ศูนย์ซื้อขายสินทรัพย์ดิจิทัลที่ได้รับใบอนุญาตจาก ก.ล.ต.</div>
  <div style="text-align:center"><button class="btn noprint" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>
</div></body></html>`;
}
module.exports = { renderCertificate };
