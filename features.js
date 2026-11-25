// Compatibility storage: existing projects.notes only; no new columns or tables.
const RR_META_MARKER='\n\n--- REKA_RUANG_INTERNAL_V1 ---\n';
function rrEmptyMeta(){return {v:1,workItems:[],profitDistributions:[],close:null}}
function rrDecodeNotes(raw){
  const text=String(raw??''),at=text.lastIndexOf(RR_META_MARKER);
  if(at<0)return {text,meta:rrEmptyMeta(),invalid:false};
  try{
    const meta=JSON.parse(text.slice(at+RR_META_MARKER.length));
    if(meta?.v!==1||!Array.isArray(meta.workItems)||!Array.isArray(meta.profitDistributions)||!(meta.close===null||typeof meta.close==='object'))throw Error('Format tidak valid');
    return {text:text.slice(0,at),meta,invalid:false};
  }catch{return {text,meta:rrEmptyMeta(),invalid:true}}
}
function rrEncodeNotes(text,meta){
  const plain=String(text??'');
  return meta.workItems.length||meta.profitDistributions.length||meta.close
    ?plain+RR_META_MARKER+JSON.stringify(meta):plain||null;
}
function rrHydrateProjects(projects){
  state.workItems=[];state.profitDistributions=[];
  return projects.map(row=>{
    const {text,meta,invalid}=rrDecodeNotes(row.notes);
    state.workItems.push(...meta.workItems.map(x=>({...x,project_id:row.id})));
    state.profitDistributions.push(...meta.profitDistributions.map(x=>({...x,project_id:row.id})));
    const c=meta.close;
    return {...row,notes:text,_rrRawNotes:row.notes??null,_rrMeta:meta,_rrInvalid:invalid,
      finance_closed_at:c?.at??null,finance_close_income:c?.income??null,finance_close_expense:c?.expense??null,finance_close_profit:c?.profit??null};
  });
}
function rrMatchNotes(query,raw){return raw===null?query.is('notes',null):query.eq('notes',raw)}
async function rrGetProject(id){
  const {data,error}=await db.from('projects').select('*').eq('id',id).single();
  if(error)throw error;
  const decoded=rrDecodeNotes(data.notes);
  if(decoded.invalid)throw Error('Catatan internal versi ini tidak terbaca. Jangan timpa data; hubungi pengelola sistem.');
  return {row:data,...decoded};
}
async function rrWriteProject(id,mutate,expectedRaw){
  const {row,text,meta}=await rrGetProject(id);
  if(expectedRaw!==undefined&&row.notes!==expectedRaw)throw Error('Data proyek berubah di perangkat lain. Muat ulang lalu coba lagi.');
  const next=await mutate(meta,row,text);
  const patch={...next.patch,notes:rrEncodeNotes(next.text??text,next.meta??meta)};
  let q=db.from('projects').update(patch).eq('id',id);
  q=rrMatchNotes(q,row.notes??null);
  // Prevent stale status/value from being used when closing or distributing profit.
  q=q.eq('status',row.status);
  if(row.project_value===null)q=q.is('project_value',null);else q=q.eq('project_value',row.project_value);
  const {data,error}=await q.select('id');
  if(error)throw error;
  if(!data?.length)throw Error('Data proyek berubah atau akses simpan ditolak. Muat ulang, jangan simpan ulang tanpa pemeriksaan.');
}
async function rrReadTransactions(id=null){
  const all=[],size=500;
  for(let start=0;;start+=size){
    let q=db.from('transactions').select('*').order('tx_date',{ascending:false}).order('id',{ascending:false});
    if(id)q=q.eq('project_id',id);
    const {data,error}=await q.range(start,start+size-1);
    if(error)return {data:null,error};
    all.push(...(data||[]));
    if(!data||data.length<size)return {data:all,error:null};
  }
}
async function rrLiveFinancials(row){
  const {data,error}=await rrReadTransactions(row.id);if(error)throw error;
  const income=data.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount||0),0);
  const expense=data.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount||0),0);
  if(!Number.isFinite(income)||!Number.isFinite(expense))throw Error('Nominal transaksi tidak valid.');
  return {income,expense,profit:income-expense,receivable:Math.max(0,Number(row.project_value||0)-income)};
}
function rrFinanceMatches(close,row,f){
  return !!close&&row.status==='Selesai'&&f.receivable===0&&Number(close.income)===f.income&&Number(close.expense)===f.expense&&Number(close.profit)===f.income-f.expense&&Number(close.value)===Number(row.project_value||0);
}
async function rrRequireOpen(id){
  const {meta}=await rrGetProject(id);
  if(meta.close)throw Error('Keuangan proyek sudah ditutup di aplikasi.');
}
function rrId(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}

// Reka Ruang - rincian volume pekerjaan dan bagi hasil setelah tutup keuangan.

function isKitchenWork(name){return ['Kitchen Set Atas','Kitchen Set Bawah'].includes(name)}

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
    await rrWriteProject(fd.project_id,(meta)=>{
      const items=[...meta.workItems];
      const item={...fd,id:id||rrId()};
      if(id){const i=items.findIndex(x=>x.id===id);if(i<0)throw Error('Rincian tidak ditemukan. Muat ulang.');items[i]={...items[i],...item}}
      else items.push({...item,created_by:session.user.id,created_at:new Date().toISOString()});
      return {meta:{...meta,workItems:items}};
    },projectById(fd.project_id)?._rrRawNotes);
    document.querySelector('#workItemDialog').close();await refresh();toast('Rincian pekerjaan tersimpan');
  }catch(err){alert('Gagal menyimpan rincian: '+err.message)}finally{btn.disabled=false}
}

async function deleteWorkItem(workId){
  const x=state.workItems.find(v=>v.id===workId);if(!x||!confirm(`Hapus rincian ${x.work_name}?`))return;
  try{
    await rrWriteProject(x.project_id,meta=>({meta:{...meta,workItems:meta.workItems.filter(v=>v.id!==workId)}}),projectById(x.project_id)?._rrRawNotes);
    await refresh();toast('Rincian pekerjaan dihapus');
  }catch(err){alert('Gagal menghapus: '+err.message)}
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
  const intro=closed?`<div class="notice"><strong>Keuangan ditutup pada ${dateID(p.finance_closed_at?.slice(0,10))}.</strong> Penambahan transaksi operasional dinonaktifkan pada aplikasi ini. Bagi hasil dicatat terpisah agar tidak mengurangi laba proyek dua kali.</div><div class="work-volume-summary"><div><span>Pemasukan Final</span><strong>${money(p.finance_close_income)}</strong></div><div><span>Biaya Final</span><strong>${money(p.finance_close_expense)}</strong></div><div><span>Laba Final</span><strong>${money(p.finance_close_profit)}</strong></div><div><span>Sudah Dibagikan</span><strong>${money(profitShareTotal(id))}</strong></div><div><span>Sisa Laba</span><strong>${money(profitShareRemaining(id))}</strong></div></div>`:`<div class="notice warning">Bagi hasil dibuka setelah proyek berstatus Selesai, seluruh tagihan lunas, dan semua biaya telah dicatat. Setelah ditutup, transaksi baru diblokir di aplikasi. Pastikan semua tim menggunakan versi terbaru.</div><div class="work-volume-summary"><div><span>Margin Saat Ini</span><strong>${money(f.margin)}</strong></div><div><span>Tagihan Tersisa</span><strong>${money(f.receivable)}</strong></div></div>`;
  const changed=closed&&!rrFinanceMatches(p._rrMeta.close,p,f);
  const action=p._rrInvalid?'<span class="pill warn">Data internal tidak terbaca</span>':changed?'<span class="pill warn">Keuangan berubah setelah tutup; pembagian diblokir. Periksa transaksi.</span>':closed?(profitShareRemaining(id)>0?`<button class="btn primary small" data-action="new-profit-share" data-id="${id}">+ Catat Bagi Hasil</button>`:'<span class="pill done">Seluruh laba sudah dibagikan / tidak ada laba</span>'):(ready?`<button class="btn primary small" data-action="close-finance" data-id="${id}">Tutup Keuangan & Tetapkan Laba</button>`:'<span class="muted">Selesaikan proyek dan pelunasan terlebih dahulu.</span>');
  return `<section class="tab-pane" data-pane="profit"><div class="detail-actions">${action}</div>${intro}<h3>Riwayat Pembagian</h3><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Penerima</th><th>Persentase</th><th>Nominal</th><th>Keterangan</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Belum ada pembagian keuntungan.</td></tr>'}</tbody></table></div></section>`;
}

async function closeProjectFinance(id){
  try{
    const {row,meta}=await rrGetProject(id),f=await rrLiveFinancials(row);
    if(meta.close||row.status!=='Selesai'||f.receivable>0)throw Error('Proyek belum selesai / belum lunas / sudah ditutup.');
    if(!confirm('Tutup keuangan '+row.name+'?\n\nPemasukan: '+money(f.income)+'\nBiaya: '+money(f.expense)+'\nLaba final: '+money(f.profit)+'\n\nPastikan semua biaya dan pelunasan benar. Penutupan membatasi transaksi di aplikasi, bukan langsung di database.'))return;
    await rrWriteProject(id,async(current,fresh)=>{
      const live=await rrLiveFinancials(fresh);
      if(current.close||fresh.status!=='Selesai'||live.receivable>0||live.income!==f.income||live.expense!==f.expense||Number(fresh.project_value)!==Number(row.project_value))throw Error('Keuangan berubah saat dikonfirmasi. Periksa ulang.');
      return {meta:{...current,close:{at:new Date().toISOString(),income:live.income,expense:live.expense,profit:live.profit,value:Number(fresh.project_value||0),by:session.user.id}}};
    },row.notes??null);
    await refresh();toast('Keuangan proyek ditutup');
  }catch(err){alert('Gagal tutup keuangan: '+err.message)}
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
    await rrWriteProject(fd.project_id,async(meta,row)=>{
      const live=await rrLiveFinancials(row);
      if(!rrFinanceMatches(meta.close,row,live))throw Error('Keuangan berubah atau belum ditutup. Pembagian diblokir.');
      const paid=meta.profitDistributions.reduce((sum,x)=>sum+Number(x.amount||0),0);
      if(fd.amount>meta.close.profit-paid)throw Error('Nominal melebihi saldo laba tersedia.');
      const item={...fd,id:rrId(),share_percent:Math.round(fd.amount/meta.close.profit*10000)/100,created_by:session.user.id,created_at:new Date().toISOString()};
      return {meta:{...meta,profitDistributions:[...meta.profitDistributions,item]}};
    },projectById(fd.project_id)?._rrRawNotes);
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