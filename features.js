// Reka Ruang - rincian volume pekerjaan dan bagi hasil setelah tutup keuangan.

function isKitchenWork(name){return String(name||'').startsWith('Kitchen Set')}

function volumeUnit(item){return item.measurement_mode==='kitchen_standard'?'m lari':'m²'}

function calculatedVolume(item){
  const p=Number(item.length_cm||0)/100,q=Number(item.quantity||1);
  return item.measurement_mode==='kitchen_standard'?p*q:p*(Number(item.height_cm||0)/100)*q
}

function formatVolume(item){
  const n=item.volume_value===undefined?calculatedVolume(item):Number(item.volume_value);
  return `${Number(n||0).toLocaleString('id-ID',{minimumFractionDigits:0,maximumFractionDigits:3})} ${volumeUnit(item)}`
}

function renderWorkItemsPane(id){
  const list=state.workItems.filter(x=>x.project_id===id);
  const linear=list.filter(x=>x.measurement_mode==='kitchen_standard').reduce((s,x)=>s+Number(x.volume_value??calculatedVolume(x)),0);
  const area=list.filter(x=>x.measurement_mode!=='kitchen_standard').reduce((s,x)=>s+Number(x.volume_value??calculatedVolume(x)),0);
  const sums=`<div class="work-volume-summary"><div><span>Volume meter lari</span><strong>${linear.toLocaleString('id-ID',{maximumFractionDigits:3})} m</strong></div><div><span>Volume luas</span><strong>${area.toLocaleString('id-ID',{maximumFractionDigits:3})} m²</strong></div><div><span>Item Pekerjaan</span><strong>${list.length}</strong></div></div>`;
  const body=list.map(x=>`<tr><td><strong>${esc(x.work_name)}</strong>${x.notes?`<div class="muted">${esc(x.notes)}</div>`:''}</td><td>${Number(x.length_cm).toLocaleString('id-ID')} cm</td><td>${x.height_cm==null?'-':Number(x.height_cm).toLocaleString('id-ID')+' cm'}</td><td>${x.width_cm==null?'-':Number(x.width_cm).toLocaleString('id-ID')+' cm'}</td><td>${x.quantity}</td><td><strong>${formatVolume(x)}</strong></td><td><button class="btn ghost small" data-action="edit-work-item" data-id="${id}" data-work-id="${x.id}">Edit</button> <button class="btn danger small" data-action="delete-work-item" data-work-id="${x.id}">Hapus</button></td></tr>`).join('');
  return `<section class="tab-pane" data-pane="volume"><div class="detail-actions"><button class="btn primary small" data-action="add-work-item" data-id="${id}">+ Rincian Pekerjaan</button></div><div class="notice">Untuk kitchen set standar, volume = panjang × jumlah dalam meter lari. Kitchen set nonstandar dan pekerjaan lain = panjang × tinggi × jumlah dalam m². Lebar/kedalaman hanya dicatat, tidak dihitung.</div>${sums}<div class="table-wrap"><table><thead><tr><th>Pekerjaan</th><th>Panjang</th><th>Tinggi</th><th>Lebar</th><th>Unit</th><th>Volume</th><th>Aksi</th></tr></thead><tbody>${body||'<tr><td colspan="7">Belum ada rincian pekerjaan.</td></tr>'}</tbody></table></div></section>`;
}

function updateVolumePreview(){
  const f=document.querySelector('#workItemForm');
  const kitchen=isKitchenWork(f.elements.work_name.value);
  const custom=f.elements.work_name.value==='Pekerjaan Custom';
  document.querySelector('#customWorkNameLabel').classList.toggle('hidden',!custom);
  f.elements.custom_work_name.required=custom;
  document.querySelector('#kitchenModeLabel').classList.toggle('hidden',!kitchen);
  if(!kitchen)f.elements.measurement_mode.value='area';
  const standard=kitchen&&f.elements.measurement_mode.value==='kitchen_standard';
  const h=f.elements.height_cm;
  document.querySelector('#workItemHeightLabel').classList.toggle('hidden',standard);
  h.required=!standard;
  if(standard)h.value='';
  const v=calculatedVolume({length_cm:f.elements.length_cm.value,height_cm:h.value,quantity:f.elements.quantity.value,measurement_mode:standard?'kitchen_standard':'area'});
  document.querySelector('#workVolumePreview').textContent=`Perhitungan volume: ${v.toLocaleString('id-ID',{maximumFractionDigits:3})} ${standard?'m lari':'m²'}${!standard?' (panjang × tinggi × jumlah)':' (panjang × jumlah)'}.`;
}

function openWorkItemDialog(projectId,workId=null){
  const f=document.querySelector('#workItemForm');f.reset();f.elements.id.value='';f.elements.project_id.value=projectId;
  document.querySelector('#workItemDialogTitle').textContent=workId?'Edit Rincian Pekerjaan':'Tambah Rincian Pekerjaan';
  const item=workId?state.workItems.find(x=>x.id===workId&&x.project_id===projectId):null;
  if(item){Object.entries(item).forEach(([k,v])=>{if(f.elements[k]&&k!=='volume_value')f.elements[k].value=v??''});
    if(![...f.elements.work_name.options].some(o=>o.value===item.work_name)){
      f.elements.work_name.value='Pekerjaan Custom';f.elements.custom_work_name.value=item.work_name;
    }
  }
  if(!item){f.elements.work_name.value='Kitchen Set Atas';f.elements.measurement_mode.value='kitchen_standard';f.elements.quantity.value='1'}
  updateVolumePreview();document.querySelector('#workItemDialog').showModal();
}

async function submitWorkItem(e){
  e.preventDefault();const form=e.currentTarget;const fd=Object.fromEntries(new FormData(form).entries());
  const id=fd.id;delete fd.id;const isKitchen=isKitchenWork(fd.work_name);
  if(fd.work_name==='Pekerjaan Custom')fd.work_name=String(fd.custom_work_name||'').trim();
  delete fd.custom_work_name;
  if(!fd.work_name){alert('Masukkan nama pekerjaan.');return}
  fd.measurement_mode=isKitchen?fd.measurement_mode:'area';
  fd.length_cm=Number(fd.length_cm);fd.quantity=Number(fd.quantity);fd.height_cm=fd.measurement_mode==='kitchen_standard'?null:Number(fd.height_cm);fd.width_cm=fd.width_cm===''?null:Number(fd.width_cm);
  fd.notes=fd.notes?.trim()||null;
  if(!Number.isFinite(fd.length_cm)||fd.length_cm<=0||!Number.isInteger(fd.quantity)||fd.quantity<=0||fd.measurement_mode==='area'&&(!Number.isFinite(fd.height_cm)||fd.height_cm<=0)){alert('Periksa panjang, tinggi, dan jumlah unit.');return}
  if(fd.width_cm!==null&&(!Number.isFinite(fd.width_cm)||fd.width_cm<0)){alert('Lebar/kedalaman tidak valid.');return}
  const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
    let res;
    if(id)res=await db.from('project_work_items').update(fd).eq('id',id);
    else res=await db.from('project_work_items').insert({...fd,created_by:session.user.id});
    if(res.error)throw res.error;
    document.querySelector('#workItemDialog').close();await refresh();toast('Rincian pekerjaan tersimpan');
  }catch(err){alert('Gagal menyimpan rincian: '+err.message)}finally{btn.disabled=false}
}

async function deleteWorkItem(workId){
  const x=state.workItems.find(v=>v.id===workId);if(!x||!confirm(`Hapus rincian ${x.work_name}?`))return;
  const {error}=await db.from('project_work_items').delete().eq('id',workId);
  if(error)return alert('Gagal menghapus: '+error.message);
  await refresh();toast('Rincian pekerjaan dihapus');
}

function profitShareTotal(projectId){return state.profitDistributions.filter(x=>x.project_id===projectId).reduce((sum,x)=>sum+Number(x.amount||0),0)}

function profitShareRemaining(projectId){
  const p=projectById(projectId);
  return Math.max(0,Number(p?.finance_close_profit||0)-profitShareTotal(projectId));
}

function renderProfitDistributionOverview(){
  const list=state.projects.filter(x=>!!x.finance_closed_at);
  const total=list.reduce((s,p)=>s+Number(p.finance_close_profit||0),0);
  const paid=list.reduce((s,p)=>s+profitShareTotal(p.id),0);
  const available=list.reduce((s,p)=>s+profitShareRemaining(p.id),0);
  const sum=`<div class="work-volume-summary"><div><span>Total Laba Proyek Ditutup</span><strong>${money(total)}</strong></div><div><span>Bagi Hasil Tercatat</span><strong>${money(paid)}</strong></div><div><span>Belum Dibagikan</span><strong>${money(available)}</strong></div></div>`;
  const rows=list.map(p=>`<tr><td>${esc(p.name)}</td><td>${dateID(p.finance_closed_at?.slice(0,10))}</td><td>${money(p.finance_close_profit)}</td><td>${money(profitShareTotal(p.id))}</td><td>${money(profitShareRemaining(p.id))}</td><td><button class="btn ghost small" data-action="jump-profit" data-id="${p.id}">Lihat</button></td></tr>`).join('');
  document.querySelector('#profitDistributionOverview').innerHTML=sum+`<div class="table-wrap"><table><thead><tr><th>Proyek</th><th>Tanggal Tutup</th><th>Laba Final</th><th>Dibagikan</th><th>Saldo Laba</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6">Belum ada proyek yang ditutup keuangannya.</td></tr>'}</tbody></table></div>`;
}

function renderProfitSharePane(id){
  const p=projectById(id),f=financials(id),list=state.profitDistributions.filter(x=>x.project_id===id);
  const closed=!!p.finance_closed_at,ready=p.status==='Selesai'&&f.receivable===0;
  const rows=list.map(x=>`<tr><td>${dateID(x.paid_date)}</td><td>${esc(x.recipient_name)}</td><td>${x.share_percent==null?'-':Number(x.share_percent).toLocaleString('id-ID',{maximumFractionDigits:2})+'%'}</td><td>${money(x.amount)}</td><td>${esc(x.notes||'-')}</td></tr>`).join('');
  const intro=closed?`<div class="notice"><strong>Keuangan ditutup pada ${dateID(p.finance_closed_at?.slice(0,10))}.</strong> Pemasukan dan biaya operasional dikunci. Bagi hasil dicatat terpisah agar tidak mengurangi laba proyek dua kali.</div><div class="work-volume-summary"><div><span>Pemasukan Final</span><strong>${money(p.finance_close_income)}</strong></div><div><span>Biaya Final</span><strong>${money(p.finance_close_expense)}</strong></div><div><span>Laba Final</span><strong>${money(p.finance_close_profit)}</strong></div><div><span>Sudah Dibagikan</span><strong>${money(profitShareTotal(id))}</strong></div><div><span>Sisa Laba</span><strong>${money(profitShareRemaining(id))}</strong></div></div>`:`<div class="notice warning">Bagi hasil dibuka setelah proyek berstatus Selesai, seluruh tagihan lunas, dan semua biaya telah dicatat. Setelah ditutup, transaksi operasional proyek tidak bisa ditambah atau diubah.</div><div class="work-volume-summary"><div><span>Margin Saat Ini</span><strong>${money(f.margin)}</strong></div><div><span>Tagihan Tersisa</span><strong>${money(f.receivable)}</strong></div></div>`;
  const action=closed?(profitShareRemaining(id)>0?`<button class="btn primary small" data-action="new-profit-share" data-id="${id}">+ Catat Bagi Hasil</button>`:'<span class="pill done">Seluruh laba sudah dibagikan / tidak ada laba</span>'):(ready?`<button class="btn primary small" data-action="close-finance" data-id="${id}">Tutup Keuangan & Tetapkan Laba</button>`:'<span class="muted">Selesaikan proyek dan pelunasan terlebih dahulu.</span>');
  return `<section class="tab-pane" data-pane="profit"><div class="detail-actions">${action}</div>${intro}<h3>Riwayat Pembagian</h3><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Penerima</th><th>Persentase</th><th>Nominal</th><th>Keterangan</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Belum ada pembagian keuntungan.</td></tr>'}</tbody></table></div></section>`;
}

async function closeProjectFinance(id){
  const p=projectById(id),f=financials(id);
  if(!p||p.finance_closed_at||p.status!=='Selesai'||f.receivable>0){alert('Proyek belum selesai / belum lunas / sudah ditutup.');return}
  const msg=`Tutup keuangan ${p.name}?\n\nPemasukan: ${money(f.income)}\nBiaya: ${money(f.expense)}\nLaba final: ${money(f.income-f.expense)}\n\nPastikan semua biaya dan pelunasan benar. Setelah ditutup, transaksi proyek terkunci.`;
  if(!confirm(msg))return;
  const {data,error}=await db.from('projects').update({finance_closed_at:new Date().toISOString(),finance_close_income:f.income,finance_close_expense:f.expense,finance_close_profit:f.income-f.expense}).eq('id',id).is('finance_closed_at',null).select('id');
  if(error)return alert('Gagal tutup keuangan: '+error.message);
  if(!data?.length)return alert('Status proyek berubah. Muat ulang data sebelum menutup.');
  await refresh();toast('Keuangan proyek ditutup');
}

function openProfitShareDialog(id){
  const p=projectById(id);if(!p?.finance_closed_at||profitShareRemaining(id)<=0)return alert('Belum ada laba yang bisa dibagikan.');
  const form=document.querySelector('#profitShareForm');form.reset();form.elements.project_id.value=id;form.elements.paid_date.value=today();
  document.querySelector('#profitShareNotice').textContent=`Laba final ${money(p.finance_close_profit)} • Sudah dibagikan ${money(profitShareTotal(id))} • Maksimum tersedia ${money(profitShareRemaining(id))}.`;
  document.querySelector('#profitShareDialog').showModal();
}

function updateProfitSharePercent(){
  const f=document.querySelector('#profitShareForm'),p=projectById(f.elements.project_id.value),profit=Number(p?.finance_close_profit||0),amount=Number(f.elements.amount.value||0);
  f.elements.share_percent.value=profit>0&&amount>0?Math.min(100,Math.round(amount/profit*10000)/100):'';
}
function updateProfitShareAmount(){
  const f=document.querySelector('#profitShareForm'),percent=Number(f.elements.share_percent.value);
  const p=projectById(f.elements.project_id.value);
  if(!p||!f.elements.share_percent.value)return;
  f.elements.amount.value=Math.round(Number(p.finance_close_profit||0)*percent/100)||'';
}

async function submitProfitShare(e){
  e.preventDefault();const form=e.currentTarget,fd=Object.fromEntries(new FormData(form).entries());
  fd.recipient_name=fd.recipient_name.trim();fd.notes=fd.notes.trim()||null;fd.amount=Number(fd.amount);fd.share_percent=fd.share_percent===''?null:Number(fd.share_percent);
  if(!fd.recipient_name||!Number.isSafeInteger(fd.amount)||fd.amount<=0||fd.amount>profitShareRemaining(fd.project_id)){alert('Nominal tidak valid atau melebihi sisa laba.');return}
  if(fd.share_percent!==null&&(!Number.isFinite(fd.share_percent)||fd.share_percent<=0||fd.share_percent>100)){alert('Persentase tidak valid.');return}
  const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{
    const {error}=await db.from('profit_distributions').insert({...fd,created_by:session.user.id});
    if(error)throw error;
    document.querySelector('#profitShareDialog').close();await refresh();toast('Bagi hasil tercatat');
  }catch(err){alert('Gagal mencatat bagi hasil: '+err.message)}finally{btn.disabled=false}
}

document.querySelector('#workItemType').addEventListener('change',updateVolumePreview);
document.querySelector('#kitchenMode').addEventListener('change',updateVolumePreview);
document.querySelectorAll('#workItemForm input').forEach(el=>{
  if(el.id!=='customWorkName')el.addEventListener('input',updateVolumePreview);
});
document.querySelector('#workItemForm').addEventListener('submit',submitWorkItem);
document.querySelector('#profitSharePercent').addEventListener('input',updateProfitShareAmount);
document.querySelector('#profitShareAmount').addEventListener('input',updateProfitSharePercent);
document.querySelector('#profitShareForm').addEventListener('submit',submitProfitShare);