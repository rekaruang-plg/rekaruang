const STAGES = ['Pengajuan','Deal','Design AI','Design Fix','Pengerjaan','Pemasangan','Selesai'];
const ALL_STATUSES = [...STAGES,'Hold'];
const BUCKET = 'project-files';
const CONFIG_KEY = 'rekaRuangSupabaseConfig_v2';
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const today = ()=>new Date().toISOString().slice(0,10);
const money = n=>'Rp '+Number(n||0).toLocaleString('id-ID');
const dateID = d=>d?new Date(d+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}):'-';
const moneyCompact = n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const DOC_LABELS={invoice:'Invoice',receipt:'Kwitansi',proposal:'Proposal Penawaran',spk:'SPK'};
function docLabel(type){return DOC_LABELS[type]||type}
function logoAssetUrl(){try{return new URL('assets/reka-ruang-logo.png',window.location.href).href}catch{return 'assets/reka-ruang-logo.png'}}
function latestDoc(projectId,type){return state.documents.find(x=>x.project_id===projectId&&x.doc_type===type)||null}
function latestIncome(projectId){return state.transactions.filter(x=>x.project_id===projectId&&x.type==='income').sort((a,b)=>String(b.tx_date||'').localeCompare(String(a.tx_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]||null}
function terbilang(value){
  const n=Math.floor(Math.abs(Number(value)||0));
  const words=['','Satu','Dua','Tiga','Empat','Lima','Enam','Tujuh','Delapan','Sembilan','Sepuluh','Sebelas'];
  const spell=x=>{
    if(x<12)return words[x];
    if(x<20)return (spell(x-10)+' Belas').trim();
    if(x<100)return (spell(Math.floor(x/10))+' Puluh '+spell(x%10)).trim();
    if(x<200)return ('Seratus '+spell(x-100)).trim();
    if(x<1000)return (spell(Math.floor(x/100))+' Ratus '+spell(x%100)).trim();
    if(x<2000)return ('Seribu '+spell(x-1000)).trim();
    if(x<1e6)return (spell(Math.floor(x/1000))+' Ribu '+spell(x%1000)).trim();
    if(x<1e9)return (spell(Math.floor(x/1e6))+' Juta '+spell(x%1e6)).trim();
    if(x<1e12)return (spell(Math.floor(x/1e9))+' Miliar '+spell(x%1e9)).trim();
    if(x<1e15)return (spell(Math.floor(x/1e12))+' Triliun '+spell(x%1e12)).trim();
    return String(x);
  };
  return ((n===0?'Nol':spell(n))+' Rupiah').replace(/\s+/g,' ').trim();
}
const esc = s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid = ()=>crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)+Date.now();

let db = null;
let session = null;
let activeProjectId = null;
let activeBast = null;
let signatureDirty = {client:false,contractor:false};
let state = {projects:[],transactions:[],progress:[],files:[],basts:[],documents:[],settings:{business_name:'Reka Ruang'}};

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function showGate(id){['#setupScreen','#loginScreen','#appShell'].forEach(x=>$(x).classList.add('hidden'));$(id).classList.remove('hidden')}
function getConfig(){
  const hard = window.REKA_CONFIG || {};
  if(hard.supabaseUrl && hard.supabaseAnonKey) return {url:hard.supabaseUrl,key:hard.supabaseAnonKey};
  try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')}catch{return null}
}
function clearConfig(){localStorage.removeItem(CONFIG_KEY);location.reload()}
async function init(){
  const cfg=getConfig();
  if(!cfg?.url || !cfg?.key){showGate('#setupScreen');return}
  try{
    db=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await db.auth.getSession(); if(error) throw error;
    session=data.session;
    if(!session){showGate('#loginScreen');return}
    await enterApp();
    db.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;if(!newSession){showGate('#loginScreen')} });
  }catch(err){console.error(err);showGate('#setupScreen');toast('Koneksi Supabase gagal')}
}

$('#setupForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);localStorage.setItem(CONFIG_KEY,JSON.stringify({url:fd.get('url').trim(),key:fd.get('key').trim()}));location.reload()});
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;try{const fd=new FormData(e.currentTarget);const {data,error}=await db.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});if(error)throw error;session=data.session;await enterApp()}catch(err){alert('Login gagal: '+err.message)}finally{btn.disabled=false}});
$('#changeConnectionBtn').onclick=clearConfig;
$('#resetConnectionBtn').onclick=()=>{if(confirm('Ganti koneksi Supabase di browser ini?'))clearConfig()};
$('#logoutBtn').onclick=async()=>{await db.auth.signOut();showGate('#loginScreen')};

async function enterApp(){
  showGate('#appShell');
  $('#userEmail').textContent=session?.user?.email||'';
  await loadData();
  renderAll();
}
async function loadData(){
  const queries=[
    db.from('projects').select('*').order('created_at',{ascending:false}),
    db.from('transactions').select('*').order('tx_date',{ascending:false}),
    db.from('project_progress').select('*').order('progress_date',{ascending:false}),
    db.from('project_files').select('*').order('created_at',{ascending:false}),
    db.from('basts').select('*').order('created_at',{ascending:false}),
    db.from('documents').select('*').order('created_at',{ascending:false}),
    db.from('company_settings').select('*').eq('id','company').maybeSingle()
  ];
  const [p,t,pr,f,b,d,s]=await Promise.all(queries);
  const err=[p,t,pr,f,b,d,s].find(x=>x.error)?.error;if(err)throw err;
  state.projects=p.data||[];state.transactions=t.data||[];state.progress=pr.data||[];state.files=f.data||[];state.basts=b.data||[];state.documents=d.data||[];state.settings=s.data||{id:'company',business_name:'Reka Ruang'};
}
async function refresh(openDetail=true){await loadData();renderAll();if(openDetail&&activeProjectId&&$('#projectDetailDialog').open)renderProjectDetail(activeProjectId)}

function projectById(id){return state.projects.find(x=>x.id===id)}
function financials(projectId){
  const tx=state.transactions.filter(x=>x.project_id===projectId);
  const income=tx.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount),0);
  const expenses=tx.filter(x=>x.type==='expense');
  const expense=expenses.reduce((a,b)=>a+Number(b.amount),0);
  const byCat={Bahan:0,Jasa:0,Design:0};expenses.forEach(x=>byCat[x.expense_category]=(byCat[x.expense_category]||0)+Number(x.amount));
  const p=projectById(projectId);return {income,expense,byCat,receivable:Math.max(0,Number(p?.project_value||0)-income),margin:Number(p?.project_value||0)-expense,cash:income-expense};
}
function stagePct(status){if(status==='Hold')return 0;const i=STAGES.indexOf(status);return i<0?0:Math.round((i/(STAGES.length-1))*100)}
function statusPill(s){return `<span class="pill ${s==='Selesai'?'done':s==='Pemasangan'?'warn':''}">${esc(s)}</span>`}
function empty(msg){return `<div class="empty">${esc(msg)}</div>`}

function renderAll(){renderDashboard();renderProjects();renderFinance();renderDocuments();renderSettings();populateDocProjects()}
function renderDashboard(){
  const totalValue=state.projects.reduce((a,p)=>a+Number(p.project_value||0),0);
  const income=state.transactions.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount),0);
  const exp=state.transactions.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount),0);
  const active=state.projects.filter(x=>!['Selesai','Hold'].includes(x.status)).length;
  const receivable=Math.max(0,totalValue-income);
  $('#metricCards').innerHTML=metric('Nilai Semua Proyek',money(totalValue),'Nilai kontrak / deal')+metric('Pemasukan',money(income),'Kas masuk tercatat')+metric('Pengeluaran',money(exp),'Bahan + jasa + design')+metric('Sisa Tagihan',money(receivable),'Belum diterima')+metric('Proyek Aktif',active,'Belum selesai');
  const recent=state.projects.filter(x=>x.status!=='Selesai').slice(0,6);
  $('#recentProjects').innerHTML=recent.length?recent.map(p=>`<div class="project-row"><div class="row-main"><strong>${esc(p.name)}</strong><span>${esc(p.client_name)} • ${esc(p.project_code||'')}</span></div><div>${statusPill(p.status)}<div style="margin-top:5px;text-align:right;font-weight:900">${money(p.project_value)}</div></div></div>`).join(''):empty('Belum ada proyek aktif.');
  const acts=[];
  state.progress.forEach(x=>acts.push({date:x.progress_date,title:`${projectById(x.project_id)?.name||'Proyek'} → ${x.stage}`,sub:x.notes||'Update progress'}));
  state.transactions.forEach(x=>acts.push({date:x.tx_date,title:`${x.type==='income'?'Pemasukan':'Pengeluaran'} ${money(x.amount)}`,sub:projectById(x.project_id)?.name||''}));
  acts.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  $('#recentActivity').innerHTML=acts.length?acts.slice(0,8).map(a=>`<div class="activity-row"><div class="row-main"><strong>${esc(a.title)}</strong><span>${esc(a.sub)}</span></div><span class="muted">${dateID(a.date)}</span></div>`).join(''):empty('Belum ada aktivitas.');
  $('#pipelineBoard').innerHTML=STAGES.map(s=>`<div class="pipeline-col"><strong>${esc(s)}</strong><b>${state.projects.filter(p=>p.status===s).length}</b><span class="muted">proyek</span></div>`).join('');
}
function metric(label,value,sub){return `<div class="metric-card"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></div>`}

function renderProjects(){
  const q=$('#projectSearch').value.trim().toLowerCase(),filter=$('#projectStatusFilter').value;
  const list=state.projects.filter(p=>(!filter||p.status===filter)&&(!q||[p.name,p.client_name,p.project_code,p.location].join(' ').toLowerCase().includes(q)));
  $('#projectsList').innerHTML=list.length?list.map(p=>{const f=financials(p.id);return `<article class="project-card" data-action="open-project" data-id="${p.id}"><div style="display:flex;justify-content:space-between;gap:8px"><span class="project-code">${esc(p.project_code||'')}</span>${statusPill(p.status)}</div><h3>${esc(p.name)}</h3><div class="client">${esc(p.client_name)}${p.location?' • '+esc(p.location):''}</div><div class="project-value">${money(p.project_value)}</div><div class="muted">Masuk ${money(f.income)} • Keluar ${money(f.expense)}</div><div class="progress"><i style="width:${stagePct(p.status)}%"></i></div><div class="project-foot"><span>${stagePct(p.status)}% alur</span><span>Sisa ${money(f.receivable)}</span></div></article>`}).join(''):empty('Proyek tidak ditemukan.');
}
$('#projectSearch').oninput=renderProjects;$('#projectStatusFilter').onchange=renderProjects;

function renderFinance(){
  const income=state.transactions.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount),0), expenses=state.transactions.filter(x=>x.type==='expense');
  const exp=expenses.reduce((a,b)=>a+Number(b.amount),0);const by={Bahan:0,Jasa:0,Design:0};expenses.forEach(x=>by[x.expense_category]=(by[x.expense_category]||0)+Number(x.amount));
  $('#financeSummary').innerHTML=metric('Pemasukan',money(income),'Semua proyek')+metric('Pengeluaran',money(exp),'Semua proyek')+metric('Bahan',money(by.Bahan),'Pengeluaran bahan')+metric('Jasa',money(by.Jasa),'Tukang / pemasangan')+metric('Design',money(by.Design),'Biaya design');
  $('#allTransactionsBody').innerHTML=state.transactions.length?state.transactions.map(x=>`<tr><td>${dateID(x.tx_date)}</td><td>${esc(projectById(x.project_id)?.name||'-')}</td><td>${x.type==='income'?'Pemasukan':'Pengeluaran'}</td><td>${esc(x.type==='income'?(x.income_category||'-'):(x.expense_category||'-'))}</td><td>${esc(x.description)}</td><td class="${x.type==='income'?'money-in':'money-out'}">${x.type==='income'?'+':'-'} ${money(x.amount)}</td></tr>`).join(''):`<tr><td colspan="6">Belum ada transaksi.</td></tr>`;
}

function renderDocuments(){
  $('#documentsList').innerHTML=state.documents.length?state.documents.map(d=>`<div class="doc-row"><div><strong>${esc(d.doc_number)}</strong><span>${esc(docLabel(d.doc_type))} • ${esc(projectById(d.project_id)?.name||'-')} • ${dateID(d.issued_date)}</span></div><div class="detail-actions"><button class="btn ghost small" data-action="reprint-doc" data-id="${d.id}">Preview</button><button class="btn primary small" data-action="download-doc" data-id="${d.id}">Download PDF</button></div></div>`).join(''):empty('Belum ada dokumen tersimpan.');
}
function populateDocProjects(){$('#docProjectSelect').innerHTML='<option value="">Pilih proyek...</option>'+state.projects.map(p=>`<option value="${p.id}">${esc(p.project_code||'')} — ${esc(p.name)}</option>`).join('')}
function renderSettings(){const f=$('#settingsForm');Object.entries(state.settings||{}).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v||''})}

function openProjectForm(id=null){
  const f=$('#projectForm');f.reset();f.elements.id.value='';$('#projectDialogTitle').textContent=id?'Edit Proyek':'Proyek Baru';
  if(id){const p=projectById(id);Object.entries(p).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v??''});f.elements.id.value=id}
  $('#projectDialog').showModal();
}
$('#newProjectBtn').onclick=()=>openProjectForm();
$('#projectForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f).entries());const id=fd.id;delete fd.id;fd.project_value=Number(fd.project_value||0);Object.keys(fd).forEach(k=>{if(fd[k]==='')fd[k]=null});try{
  if(id){const {error}=await db.from('projects').update(fd).eq('id',id);if(error)throw error}
  else{const {data:num,error:numErr}=await db.rpc('next_document_number',{p_type:'project'});if(numErr)throw numErr;fd.project_code=num;fd.status='Pengajuan';fd.created_by=session.user.id;const {data:p,error}=await db.from('projects').insert(fd).select().single();if(error)throw error;await db.from('project_progress').insert({project_id:p.id,stage:'Pengajuan',progress_date:fd.start_date||today(),notes:'Proyek dibuat / pengajuan masuk.',created_by:session.user.id})}
  $('#projectDialog').close();await refresh(false);toast('Proyek tersimpan')
}catch(err){alert('Gagal menyimpan proyek: '+err.message)}};

function renderProjectDetail(id){
  activeProjectId=id;const p=projectById(id);if(!p)return;const f=financials(id);const tx=state.transactions.filter(x=>x.project_id===id);const progress=state.progress.filter(x=>x.project_id===id);const files=state.files.filter(x=>x.project_id===id);const basts=state.basts.filter(x=>x.project_id===id);const docs=state.documents.filter(x=>x.project_id===id);
  $('#detailTitle').textContent=p.name;$('#detailMeta').textContent=`${p.project_code||''} • ${p.client_name}${p.location?' • '+p.location:''}`;
  const summary=`<div class="detail-summary">${summaryCard('Nilai Proyek',money(p.project_value))}${summaryCard('Pemasukan',money(f.income))}${summaryCard('Pengeluaran',money(f.expense))}${summaryCard('Sisa Tagihan',money(f.receivable))}${summaryCard('Margin Kotor',money(f.margin))}</div>`;
  const tabs=`<div class="detail-tabs"><button class="tab-btn active" data-tab="overview">Overview</button><button class="tab-btn" data-tab="finance">Keuangan</button><button class="tab-btn" data-tab="design">Design</button><button class="tab-btn" data-tab="progress">Progress</button><button class="tab-btn" data-tab="bast">BAST</button><button class="tab-btn" data-tab="docs">Dokumen</button><button class="tab-btn" data-tab="final">Hasil Akhir</button></div>`;
  const overview=`<section class="tab-pane active" data-pane="overview"><div class="detail-actions"><button class="btn primary small" data-action="add-tx" data-id="${id}">+ Transaksi</button><button class="btn ghost small" data-action="update-progress" data-id="${id}">Update Progress</button><button class="btn ghost small" data-action="edit-project" data-id="${id}">Edit Proyek</button></div><div style="display:flex;gap:8px;align-items:center;margin-bottom:15px">${statusPill(p.status)}<strong>${esc(p.status)}</strong></div><h3>Scope Pekerjaan</h3><div class="scope-box">${esc(p.scope||'Belum ada scope.')}</div>${p.notes?`<h3>Catatan Internal</h3><div class="scope-box">${esc(p.notes)}</div>`:''}</section>`;
  const finance=`<section class="tab-pane" data-pane="finance"><div class="detail-actions"><button class="btn primary small" data-action="add-tx" data-id="${id}">+ Tambah Transaksi</button></div><div class="expense-split">${expenseBox('Bahan',f.byCat.Bahan)}${expenseBox('Jasa',f.byCat.Jasa)}${expenseBox('Design',f.byCat.Design)}</div>${transactionTable(tx)}</section>`;
  const ai=files.filter(x=>x.file_type==='design_ai'),fix=files.filter(x=>x.file_type==='design_fix');
  const design=`<section class="tab-pane" data-pane="design"><div class="detail-actions"><button class="btn primary small" data-action="upload-file" data-id="${id}" data-type="design_ai">Upload Design AI</button><button class="btn ghost small" data-action="upload-file" data-id="${id}" data-type="design_fix">Upload Design Fix</button></div><h3>Design AI / Konsep</h3>${fileGrid(ai)}<h3>Design Fix / Approved</h3>${fileGrid(fix)}</section>`;
  const progressPane=`<section class="tab-pane" data-pane="progress"><div class="detail-actions"><button class="btn primary small" data-action="update-progress" data-id="${id}">+ Update Tahap / Tanggal</button></div>${timelineHtml(p,progress)}</section>`;
  const bastInstall=basts.find(x=>x.bast_type==='installation'),bastFinal=basts.find(x=>x.bast_type==='final');
  const bast=`<section class="tab-pane" data-pane="bast"><div class="bast-cards">${bastCard(id,'installation','BAST Pemasangan',bastInstall,'Checklist pemasangan dan penerimaan pekerjaan saat instalasi.')}${bastCard(id,'final','BAST Serah Terima Akhir',bastFinal,'BAST akhir sebelum proyek dinyatakan selesai.')}</div><div class="notice warning">Untuk mengubah tahap menjadi <b>Selesai</b>, BAST Pemasangan dan BAST Akhir harus berstatus Signed, serta minimal 1 foto hasil akhir sudah diupload.</div></section>`;
  const docsPane=`<section class="tab-pane" data-pane="docs"><div class="detail-actions"><button class="btn primary small" data-action="new-doc" data-id="${id}" data-type="invoice">Invoice</button><button class="btn ghost small" data-action="new-doc" data-id="${id}" data-type="receipt">Kwitansi</button><button class="btn ghost small" data-action="new-doc" data-id="${id}" data-type="proposal">Proposal</button><button class="btn ghost small" data-action="new-doc" data-id="${id}" data-type="spk">SPK</button></div>${docs.length?docs.map(d=>`<div class="doc-row"><div><strong>${esc(d.doc_number)}</strong><span>${esc(docLabel(d.doc_type))} • ${dateID(d.issued_date)}</span></div><div class="detail-actions"><button class="btn ghost small" data-action="reprint-doc" data-id="${d.id}">Preview</button><button class="btn primary small" data-action="download-doc" data-id="${d.id}">Download PDF</button></div></div>`).join(''):empty('Belum ada dokumen untuk proyek ini.')}</section>`;
  const finals=files.filter(x=>x.file_type==='final_photo');
  const finalPane=`<section class="tab-pane" data-pane="final"><div class="detail-actions"><button class="btn primary small" data-action="upload-file" data-id="${id}" data-type="final_photo">+ Upload Foto Hasil Akhir</button></div><div class="notice">Upload foto hasil akhir proyek dari beberapa sudut. Minimal 1 foto diperlukan sebelum status proyek dapat menjadi Selesai.</div>${fileGrid(finals)}</section>`;
  $('#projectDetailContent').innerHTML=summary+tabs+overview+finance+design+progressPane+bast+docsPane+finalPane;
  hydrateFilePreviews(files);
}
function summaryCard(l,v){return `<div class="summary-card"><span>${esc(l)}</span><strong>${v}</strong></div>`}
function expenseBox(c,v){return `<div class="expense-box"><span>${esc(c)}</span><strong>${money(v)}</strong></div>`}
function transactionTable(tx){return `<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th>Nominal</th></tr></thead><tbody>${tx.length?tx.map(x=>`<tr><td>${dateID(x.tx_date)}</td><td>${x.type==='income'?'Pemasukan':'Pengeluaran'}</td><td>${esc(x.type==='income'?(x.income_category||'-'):(x.expense_category||'-'))}</td><td>${esc(x.description)}</td><td class="${x.type==='income'?'money-in':'money-out'}">${x.type==='income'?'+':'-'} ${money(x.amount)}</td></tr>`).join(''):`<tr><td colspan="5">Belum ada transaksi.</td></tr>`}</tbody></table></div>`}
function timelineHtml(p,recs){const map=Object.fromEntries(recs.map(x=>[x.stage,x]));return `<div class="timeline">${STAGES.map((s,i)=>{const r=map[s],done=!!r,current=p.status===s;return `<div class="timeline-item ${done?'done':''} ${current?'current':''}"><div class="timeline-dot">${done?'✓':i+1}</div><div class="timeline-content"><strong><span>${esc(s)}</span>${['Pemasangan','Selesai'].includes(s)?'<span class="pill warn">BAST wajib</span>':''}</strong><small>${r?dateID(r.progress_date)+(r.notes?' • '+esc(r.notes):''):'Belum ada update'}</small></div></div>`}).join('')}</div>`}
function bastCard(id,type,title,b,desc){return `<div class="bast-card"><h4>${esc(title)}</h4><p>${esc(desc)}</p><div>${b?(b.status==='signed'?'<span class="pill done">Signed</span>':'<span class="pill warn">Draft</span>'):'<span class="pill">Belum dibuat</span>'}</div>${b?.doc_number?`<div class="muted" style="margin-top:7px">${esc(b.doc_number)} • ${dateID(b.bast_date)}</div>`:''}<div class="detail-actions" style="margin-top:12px"><button class="btn ${b?'ghost':'primary'} small" data-action="open-bast" data-id="${id}" data-type="${type}">${b?'Buka / Edit':'Buat BAST'}</button>${b?`<button class="btn ghost small" data-action="print-bast" data-bast-id="${b.id}">Preview / Print</button><button class="btn primary small" data-action="download-bast" data-bast-id="${b.id}">Download PDF</button>`:''}</div></div>`}
function fileGrid(files){return files.length?`<div class="file-grid">${files.map(f=>`<div class="file-card"><div id="fileprev-${f.id}" class="file-preview">${f.mime_type?.startsWith('image/')?'Memuat...':'PDF / FILE'}</div><div class="file-meta"><strong title="${esc(f.file_name)}">${esc(f.file_name)}</strong><span>${esc(f.caption||'Tanpa caption')} • ${new Date(f.created_at).toLocaleString('id-ID')}</span></div><div class="file-actions"><button class="btn ghost small" data-action="open-file" data-id="${f.id}">Buka</button><button class="btn danger small" data-action="delete-file" data-id="${f.id}">Hapus</button></div></div>`).join('')}</div>`:empty('Belum ada file.')}
async function hydrateFilePreviews(files){for(const f of files.filter(x=>x.mime_type?.startsWith('image/'))){const el=$(`#fileprev-${CSS.escape(f.id)}`);if(!el)continue;const {data}=await db.storage.from(BUCKET).createSignedUrl(f.storage_path,3600);if(data?.signedUrl)el.outerHTML=`<img src="${data.signedUrl}" alt="${esc(f.file_name)}">`}}

function openTransaction(id){const f=$('#transactionForm');f.reset();f.elements.project_id.value=id;f.elements.tx_date.value=today();toggleTxCategory();$('#transactionDialog').showModal()}
function toggleTxCategory(){const expense=$('#txType').value==='expense';$('#expenseCategoryLabel').classList.toggle('hidden',!expense);$('#incomeCategoryLabel').classList.toggle('hidden',expense)}
$('#txType').onchange=toggleTxCategory;
$('#transactionForm').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.currentTarget).entries());fd.amount=Number(fd.amount);fd.expense_category=fd.type==='expense'?fd.expense_category:null;fd.income_category=fd.type==='income'?(fd.income_category||null):null;fd.created_by=session.user.id;try{const {error}=await db.from('transactions').insert(fd);if(error)throw error;$('#transactionDialog').close();await refresh();toast('Transaksi tersimpan')}catch(err){alert('Gagal menyimpan transaksi: '+err.message)}};

function openProgress(id){const f=$('#progressForm');f.reset();f.elements.project_id.value=id;f.elements.progress_date.value=today();f.elements.stage.value=projectById(id)?.status==='Hold'?'Pengajuan':projectById(id)?.status||'Pengajuan';updateProgressWarning();$('#progressDialog').showModal()}
$('#progressForm').elements.stage.onchange=updateProgressWarning;
function updateProgressWarning(){const s=$('#progressForm').elements.stage.value,w=$('#progressWarning');if(s==='Pemasangan'){w.textContent='Tahap Pemasangan memiliki BAST Pemasangan yang wajib ditandatangani.';w.className='notice warning'}else if(s==='Selesai'){w.textContent='Selesai hanya dapat disimpan jika kedua BAST Signed dan foto hasil akhir sudah ada.';w.className='notice warning'}else w.className='notice hidden'}
$('#progressForm').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.currentTarget).entries());const id=fd.project_id;if(fd.stage==='Selesai'){
  const b=state.basts.filter(x=>x.project_id===id),inst=b.find(x=>x.bast_type==='installation'),fin=b.find(x=>x.bast_type==='final'),photos=state.files.filter(x=>x.project_id===id&&x.file_type==='final_photo');
  if(inst?.status!=='signed'||fin?.status!=='signed'||photos.length<1){alert('Belum bisa diselesaikan. Pastikan BAST Pemasangan Signed, BAST Akhir Signed, dan minimal 1 foto hasil akhir sudah diupload.');return}
}
  try{const payload={...fd,created_by:session.user.id};const {error}=await db.from('project_progress').upsert(payload,{onConflict:'project_id,stage'});if(error)throw error;const {error:e2}=await db.from('projects').update({status:fd.stage}).eq('id',id);if(e2)throw e2;$('#progressDialog').close();await refresh();toast('Progress diperbarui')}catch(err){alert('Gagal update progress: '+err.message)}};

function openFileDialog(id,type){const f=$('#fileForm');f.reset();f.elements.project_id.value=id;f.elements.file_type.value=type;const labels={design_ai:'Upload Design AI / Konsep',design_fix:'Upload Design Fix / Approved',final_photo:'Upload Foto Hasil Akhir'};$('#fileDialogTitle').textContent=labels[type]||'Upload File';$('#fileUploadHint').innerHTML=type==='design_fix'?'<b>Design Fix</b> sebaiknya hanya berisi desain yang sudah disetujui / menjadi acuan pengerjaan.':type==='final_photo'?'<b>Foto final</b> menjadi dokumentasi serah terima proyek.':'Bisa upload gambar atau PDF. File disimpan di Supabase Storage.';$('#fileDialog').showModal()}
$('#fileForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,files=[...f.elements.files.files],projectId=f.elements.project_id.value,type=f.elements.file_type.value,caption=f.elements.caption.value;const btn=f.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Uploading...';try{
  for(const file of files){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${projectId}/${type}/${Date.now()}-${uid().slice(0,8)}-${safe}`;const {error:upErr}=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined,upsert:false});if(upErr)throw upErr;const {error:dbErr}=await db.from('project_files').insert({project_id:projectId,file_type:type,file_name:file.name,storage_path:path,mime_type:file.type,caption:caption||null,uploaded_by:session.user.id});if(dbErr){await db.storage.from(BUCKET).remove([path]);throw dbErr}}
  $('#fileDialog').close();await refresh();toast('File berhasil diupload')
}catch(err){alert('Upload gagal: '+err.message)}finally{btn.disabled=false;btn.textContent='Upload'}};
async function openStoredFile(id){const f=state.files.find(x=>x.id===id);if(!f)return;const {data,error}=await db.storage.from(BUCKET).createSignedUrl(f.storage_path,3600);if(error)return alert(error.message);window.open(data.signedUrl,'_blank')}
async function deleteStoredFile(id){const f=state.files.find(x=>x.id===id);if(!f||!confirm('Hapus file ini dari proyek?'))return;const {error}=await db.storage.from(BUCKET).remove([f.storage_path]);if(error)return alert(error.message);await db.from('project_files').delete().eq('id',id);await refresh();toast('File dihapus')}

const BAST_CHECKS={installation:['Area pemasangan sesuai dengan scope pekerjaan.','Kabinet / furniture / elemen interior telah terpasang pada posisi yang disepakati.','Pintu, laci, engsel, rel, hidrolik, dan aksesori yang terkait telah diuji.','Kondisi visual hasil pemasangan telah diperiksa bersama client.','Catatan kekurangan / perbaikan telah dicatat bila ada.'],final:['Seluruh pekerjaan dalam scope telah selesai dan diperiksa bersama client.','Hasil akhir sesuai dengan desain fix / kesepakatan yang berlaku.','Fungsi furniture, hardware, dan aksesori telah diuji.','Area pekerjaan telah dirapikan dan diserahkan kepada client.','Catatan perbaikan telah diselesaikan atau disepakati tindak lanjutnya.','Client menerima serah terima hasil pekerjaan.']};
async function openBast(projectId,type){const p=projectById(projectId),b=state.basts.find(x=>x.project_id===projectId&&x.bast_type===type);activeBast=b||null;const f=$('#bastForm');f.reset();f.elements.project_id.value=projectId;f.elements.bast_type.value=type;f.elements.bast_date.value=b?.bast_date||today();f.elements.client_name.value=b?.client_name||p.client_name||'';f.elements.contractor_name.value=b?.contractor_name||state.settings.pic||state.settings.business_name||'Reka Ruang';f.elements.notes.value=b?.notes||'';$('#bastDialogTitle').textContent=type==='installation'?'BAST Pemasangan':'BAST Serah Terima Akhir';$('#bastDialogSub').textContent=`${p.project_code||''} — ${p.name}`;const items=b?.checklist?.length?b.checklist:BAST_CHECKS[type].map(text=>({text,checked:false}));$('#bastChecklist').innerHTML=items.map((x,i)=>`<label class="check-item"><input type="checkbox" data-bast-check="${i}" ${x.checked?'checked':''}><span>${esc(x.text)}</span></label>`).join('');$('#bastStatusBadge').innerHTML=b?.status==='signed'?'<span class="pill done">Signed</span>':'<span class="pill warn">Draft / Belum Signed</span>';$('#clientSignExisting').textContent=b?.client_signature_path?'TTD tersimpan':'';$('#contractorSignExisting').textContent=b?.contractor_signature_path?'TTD tersimpan':'';signatureDirty={client:false,contractor:false};resetCanvas($('#clientSignature'));resetCanvas($('#contractorSignature'));$('#bastDialog').showModal();}
function resetCanvas(c){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#17211d';ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round'}
function initSignaturePad(canvas,key){let drawing=false,last=null;const pos=e=>{const r=canvas.getBoundingClientRect(),sx=canvas.width/r.width,sy=canvas.height/r.height;return {x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy}};canvas.addEventListener('pointerdown',e=>{drawing=true;last=pos(e);canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=pos(e),ctx=canvas.getContext('2d');ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;signatureDirty[key]=true});canvas.addEventListener('pointerup',()=>drawing=false);canvas.addEventListener('pointercancel',()=>drawing=false);resetCanvas(canvas)}
initSignaturePad($('#clientSignature'),'client');initSignaturePad($('#contractorSignature'),'contractor');
$$('[data-clear-sign]').forEach(btn=>btn.onclick=()=>{const k=btn.dataset.clearSign;resetCanvas(k==='client'?$('#clientSignature'):$('#contractorSignature'));signatureDirty[k]=false;if(k==='client')$('#clientSignExisting').textContent='';else $('#contractorSignExisting').textContent='';if(activeBast){if(k==='client')activeBast.client_signature_path=null;else activeBast.contractor_signature_path=null}});
function canvasBlob(canvas){return new Promise(res=>canvas.toBlob(res,'image/png',0.95))}
async function uploadSignature(projectId,type,who,canvas){const blob=await canvasBlob(canvas);const path=`${projectId}/bast/${type}-${who}-${Date.now()}.png`;const {error}=await db.storage.from(BUCKET).upload(path,blob,{contentType:'image/png'});if(error)throw error;return path}
$('#bastForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,fd=Object.fromEntries(new FormData(f).entries()),type=fd.bast_type,projectId=fd.project_id;const checklist=$$('[data-bast-check]',f).map((cb,i)=>({text:cb.closest('label').querySelector('span').textContent,checked:cb.checked}));let clientPath=activeBast?.client_signature_path||null,contractorPath=activeBast?.contractor_signature_path||null;try{
  if(signatureDirty.client)clientPath=await uploadSignature(projectId,type,'client',$('#clientSignature'));
  if(signatureDirty.contractor)contractorPath=await uploadSignature(projectId,type,'reka-ruang',$('#contractorSignature'));
  let docNumber=activeBast?.doc_number;if(!docNumber){const {data,error}=await db.rpc('next_document_number',{p_type:type==='installation'?'bast_installation':'bast_final'});if(error)throw error;docNumber=data}
  const signed=checklist.every(x=>x.checked)&&!!clientPath&&!!contractorPath;
  const payload={project_id:projectId,bast_type:type,doc_number:docNumber,bast_date:fd.bast_date,checklist,notes:fd.notes||null,client_name:fd.client_name,contractor_name:fd.contractor_name,client_signature_path:clientPath,contractor_signature_path:contractorPath,status:signed?'signed':'draft',signed_at:signed?new Date().toISOString():null,created_by:session.user.id};
  const {error}=await db.from('basts').upsert(payload,{onConflict:'project_id,bast_type'});if(error)throw error;await refresh();activeBast=state.basts.find(x=>x.project_id===projectId&&x.bast_type===type);$('#bastStatusBadge').innerHTML=signed?'<span class="pill done">Signed</span>':'<span class="pill warn">Draft / Belum Signed</span>';toast(signed?'BAST sudah Signed':'BAST tersimpan sebagai Draft')
}catch(err){alert('Gagal menyimpan BAST: '+err.message)}};
$('#printBastBtn').onclick=()=>{if(!activeBast)return alert('Simpan BAST terlebih dahulu sebelum preview / print.');printBast(activeBast)};
$('#downloadBastBtn').onclick=()=>{if(!activeBast)return alert('Simpan BAST terlebih dahulu sebelum download.');downloadBastPdf(activeBast)};
async function renderBastToWindow(b,w,options={}){
  const p=projectById(b.project_id);let clientUrl='',contractorUrl='';
  if(b.client_signature_path){const {data}=await db.storage.from(BUCKET).createSignedUrl(b.client_signature_path,3600);clientUrl=data?.signedUrl||''}
  if(b.contractor_signature_path){const {data}=await db.storage.from(BUCKET).createSignedUrl(b.contractor_signature_path,3600);contractorUrl=data?.signedUrl||''}
  const title=b.bast_type==='installation'?'BERITA ACARA PEMASANGAN':'BERITA ACARA SERAH TERIMA';
  const section=b.bast_type==='installation'?'PEMERIKSAAN & PENERIMAAN PEMASANGAN':'SERAH TERIMA HASIL PEKERJAAN';
  const checklist=(b.checklist||[]).map(x=>`<div class="check-row"><span class="check-box">${x.checked?'✓':''}</span><span>${esc(x.text)}</span></div>`).join('');
  const body=`
    <div class="section-title">${section}</div>
    <table class="meta-table"><tbody>
      <tr><th>Nomor BAST</th><td><b>${esc(b.doc_number||'-')}</b></td></tr>
      <tr><th>Tanggal</th><td>${dateID(b.bast_date)}</td></tr>
      <tr><th>Kode Proyek</th><td>${esc(p.project_code||'-')}</td></tr>
    </tbody></table>
    <div class="client-title">Data Pekerjaan</div>
    <table class="detail-table"><tbody>
      <tr><th>Proyek</th><td>${esc(p.name)}</td></tr>
      <tr><th>Client</th><td>${esc(b.client_name||p.client_name)}</td></tr>
      <tr><th>Lokasi</th><td>${esc(p.location||'-')}</td></tr>
    </tbody></table>
    <div class="content-heading">Checklist Pemeriksaan</div>
    <div class="check-list">${checklist}</div>
    <div class="content-heading">Catatan</div>
    <div class="note-box">${esc(b.notes||'Tidak ada catatan tambahan.').replace(/\n/g,'<br>')}</div>
    <p class="agreement-text">Dengan ditandatanganinya berita acara ini, kedua pihak menyatakan bahwa pemeriksaan pekerjaan telah dilakukan bersama sesuai checklist dan catatan di atas.</p>
    <div class="document-date">${dateID(b.bast_date)}</div>
    <div class="signature-grid print-signatures">
      ${signatureBlock('Client',b.client_name||p.client_name,clientUrl,false)}
      ${signatureBlock('Reka Ruang',b.contractor_name||state.settings.pic||'Reka Ruang',contractorUrl,true)}
    </div>`;
  w.document.open();
  w.document.write(printShell(b.doc_number,body,{displayTitle:title,footer:`REKA RUANG - ${title} - ${p.client_name}`,autoPrint:options.autoPrint!==false}));
  w.document.close();
  return {title,project:p};
}
async function printBast(b){
  const w=window.open('','_blank');if(!w)return alert('Popup diblokir browser. Izinkan popup untuk preview / print dokumen.');
  try{await renderBastToWindow(b,w,{autoPrint:true})}catch(err){w.close();alert('Gagal membuka BAST: '+err.message)}
}
async function downloadBastPdf(b){
  const p=projectById(b.project_id);const label=b.bast_type==='installation'?'BAST-Pemasangan':'BAST-Serah-Terima';
  try{await downloadRenderedPdf(win=>renderBastToWindow(b,win,{autoPrint:false}),`${label}-${p?.client_name||p?.name||'Reka-Ruang'}-${b.doc_number||''}`)}catch(err){alert('Gagal download PDF BAST: '+err.message)}
}

async function openDocBuilder(id,type){
  const p=projectById(id);if(!p)return;const f=$('#docForm');f.reset();f.elements.project_id.value=id;f.elements.doc_type.value=type;
  $('#docDialogTitle').textContent={invoice:'Buat Invoice',receipt:'Buat Kwitansi',proposal:'Buat Proposal Penawaran',spk:'Buat SPK'}[type]||'Buat Dokumen';
  $('#docDialogSub').textContent=`${p.project_code||''} — ${p.name} — ${p.client_name}`;
  const fin=financials(id),spk=latestDoc(id,'spk'),income=latestIncome(id);let html='';
  if(type==='invoice')html=`
    <label>Tanggal Invoice<input class="input" name="issued_date" type="date" value="${today()}" required></label>
    <label>Jatuh Tempo<input class="input" name="due_date" type="date" value="${today()}" required></label>
    <label>Nominal Tagihan (Rp)<input class="input" name="amount" type="number" value="${fin.receivable||p.project_value}" required></label>
    <label>Termin<input class="input" name="term" value="Down Payment / Progress / Pelunasan"></label>
    <label class="span-2">Referensi SPK<input class="input" name="reference" value="${esc(spk?.doc_number||'')}"></label>
    <label class="span-2">Keterangan<textarea class="input" name="description" rows="3">Pembayaran proyek ${esc(p.name)}</textarea></label>
    <label class="span-2">Catatan<textarea class="input" name="notes" rows="2">Mohon mengirimkan bukti pembayaran setelah transfer.</textarea></label>`;
  else if(type==='receipt')html=`
    <label>Tanggal Kwitansi<input class="input" name="issued_date" type="date" value="${today()}" required></label>
    <label>Nominal Diterima (Rp)<input class="input" name="amount" type="number" value="${Number(income?.amount||0)}" required></label>
    <label>Sudah Terima Dari<input class="input" name="received_from" value="${esc(p.client_name||'')}" required></label>
    <label>Jenis Pembayaran<input class="input" name="term" value="DP / Progress / Pelunasan"></label>
    <label class="span-2">Referensi SPK<input class="input" name="reference" value="${esc(spk?.doc_number||'')}"></label>
    <label class="span-2">Untuk Pembayaran<textarea class="input" name="description" rows="3">Pembayaran pekerjaan ${esc(p.name)}</textarea></label>
    <label class="span-2">Catatan<textarea class="input" name="notes" rows="2">Kwitansi ini digunakan sebagai bukti pembayaran setelah dana diterima.</textarea></label>`;
  else if(type==='proposal')html=`<label>Tanggal<input class="input" name="issued_date" type="date" value="${today()}" required></label><label>Berlaku Sampai<input class="input" name="valid_until" type="date"></label><label>Nilai Penawaran (Rp)<input class="input" name="amount" type="number" value="${p.project_value}" required></label><label class="span-2">Scope<textarea class="input" name="scope" rows="5">${esc(p.scope||'')}</textarea></label><label class="span-2">Syarat Pembayaran<textarea class="input" name="payment_terms" rows="4">DP sesuai kesepakatan setelah persetujuan penawaran. Pembayaran berikutnya mengikuti progress pekerjaan dan pelunasan pada serah terima.</textarea></label><label class="span-2">Catatan<textarea class="input" name="notes" rows="3">Perubahan pekerjaan di luar scope akan dikonfirmasi terlebih dahulu kepada client.</textarea></label>`;
  else html=`<label>Tanggal<input class="input" name="issued_date" type="date" value="${today()}" required></label><label>Nilai Pekerjaan (Rp)<input class="input" name="amount" type="number" value="${p.project_value}" required></label><label>Durasi Pekerjaan<input class="input" name="duration" value="Sesuai jadwal kerja yang disepakati"></label><label>Garansi<input class="input" name="warranty" value="3 bulan setelah serah terima"></label><label class="span-2">Lokasi<input class="input" name="location" value="${esc(p.location||'')}"></label><label class="span-2">Scope<textarea class="input" name="scope" rows="5">${esc(p.scope||'')}</textarea></label><label class="span-2">Termin Pembayaran<textarea class="input" name="payment_terms" rows="4">Pembayaran mengikuti termin yang telah disepakati. Pelunasan dilakukan pada saat serah terima pekerjaan.</textarea></label><label class="span-2">Ketentuan Tambahan<textarea class="input" name="notes" rows="3">Perubahan desain, material, atau scope setelah pekerjaan berjalan dapat memengaruhi biaya dan waktu pengerjaan.</textarea></label>`;
  $('#docFormFields').innerHTML=html;$('#docDialog').showModal();
}
$('#openDocBuilderBtn').onclick=()=>{const id=$('#docProjectSelect').value;if(!id)return alert('Pilih proyek terlebih dahulu.');openDocBuilder(id,$('#docTypeSelect').value)};
$('#docForm').onsubmit=async e=>{e.preventDefault();const mode=e.submitter?.dataset.docMode||'preview';const popup=mode==='preview'?window.open('','_blank'):null;const fd=Object.fromEntries(new FormData(e.currentTarget).entries());const p=projectById(fd.project_id);try{const {data:num,error:numErr}=await db.rpc('next_document_number',{p_type:fd.doc_type});if(numErr)throw numErr;fd.amount=Number(fd.amount||0);const payload={project_id:p.id,doc_type:fd.doc_type,doc_number:num,issued_date:fd.issued_date,amount:fd.amount,content:fd,created_by:session.user.id};const {data:doc,error}=await db.from('documents').insert(payload).select().single();if(error)throw error;if(mode==='download')await downloadDocObject(p,doc);else renderPrintableDoc(p,doc,popup);$('#docDialog').close();await refresh();toast(mode==='download'?'Dokumen tersimpan & PDF didownload':'Dokumen tersimpan')}catch(err){popup?.close();alert('Gagal membuat dokumen: '+err.message)}};
function reprintDoc(id){const d=state.documents.find(x=>x.id===id);if(!d)return;renderPrintableDoc(projectById(d.project_id),d,window.open('','_blank'))}
async function downloadDoc(id){const d=state.documents.find(x=>x.id===id);if(!d)return;try{await downloadDocObject(projectById(d.project_id),d)}catch(err){alert('Gagal download PDF: '+err.message)}}
function signatureBlock(role,name,signatureUrl='',stamp=false){
  const logo=esc(logoAssetUrl());
  return `<div class="signature-party"><div class="sign-role">${esc(role)}</div><div class="sign-name-top">${role==='Reka Ruang'?'REKA RUANG':esc(String(name||'').toUpperCase())}</div><div class="signature-area">${signatureUrl?`<img class="signature-img" src="${signatureUrl}" alt="Tanda tangan">`:''}${stamp?`<div class="company-stamp"><img src="${logo}" alt="Cap Reka Ruang"></div>`:''}</div><div class="sign-line-name">${esc(name||'')}</div></div>`;
}
function renderPrintableDoc(p,doc,w,options={}){
  if(!w)return alert('Popup diblokir browser. Izinkan popup untuk preview / PDF.');
  const d={...(doc.content||{}),number:doc.doc_number,issued_date:doc.issued_date,amount:doc.amount};let body='',displayTitle=docLabel(doc.doc_type).toUpperCase();
  const bankRows=[
    state.settings.bank1&&`<tr><th>${esc(state.settings.bank1)}</th><td>${esc(state.settings.account1||'')}</td><td>a.n. ${esc(state.settings.account_name1||'')}</td></tr>`,
    state.settings.bank2&&`<tr><th>${esc(state.settings.bank2)}</th><td>${esc(state.settings.account2||'')}</td><td>a.n. ${esc(state.settings.account_name2||'')}</td></tr>`
  ].filter(Boolean).join('');
  if(doc.doc_type==='invoice'){
    const term=(d.term||'Tagihan').trim(),ref=d.reference||latestDoc(p.id,'spk')?.doc_number||'-';
    body=`
      <div class="section-title">TAGIHAN ${esc(term.toUpperCase())}</div>
      <table class="meta-table"><tbody>
        <tr><th>Nomor Invoice</th><td><b>${esc(doc.doc_number)}</b></td></tr>
        <tr><th>Tanggal Invoice</th><td>${dateID(doc.issued_date)}</td></tr>
        <tr><th>Jatuh Tempo</th><td>${dateID(d.due_date||doc.issued_date)}</td></tr>
        <tr><th>Referensi</th><td>${esc(ref)}</td></tr>
      </tbody></table>
      <div class="client-title">Ditagihkan kepada</div><div class="client-name">${esc(p.client_name)}</div>
      <table class="line-table"><thead><tr><th>Keterangan</th><th class="center">Qty</th><th class="right">Harga</th><th class="right">Jumlah</th></tr></thead><tbody>
        <tr><td>${esc(d.description||`Pembayaran proyek ${p.name}`).replace(/\n/g,'<br>')}<div class="muted-print">Nilai kontrak: ${moneyCompact(p.project_value)}</div></td><td class="center">1</td><td class="right">${moneyCompact(doc.amount)}</td><td class="right"><b>${moneyCompact(doc.amount)}</b></td></tr>
      </tbody><tfoot><tr><th colspan="3" class="total-label">TOTAL TAGIHAN</th><th class="right total-amount">${moneyCompact(doc.amount)}</th></tr></tfoot></table>
      <div class="terbilang"><b>Terbilang:</b> <i>${esc(terbilang(doc.amount))}.</i></div>
      ${bankRows?`<div class="content-heading accent">Pembayaran dapat dilakukan melalui:</div><table class="bank-table"><tbody>${bankRows}</tbody></table>`:''}
      <div class="document-note"><b>Catatan:</b> ${esc(d.notes||'Invoice ini merupakan tagihan sesuai termin pembayaran proyek. Mohon mengirimkan bukti pembayaran setelah transfer.')}</div>`;
  } else if(doc.doc_type==='receipt'){
    const ref=d.reference||latestDoc(p.id,'spk')?.doc_number||'-',term=(d.term||'Pembayaran').trim();
    displayTitle='KWITANSI';
    body=`
      <div class="section-title">BUKTI PEMBAYARAN ${esc(term.toUpperCase())}</div>
      <table class="meta-table short"><tbody>
        <tr><th>Nomor Kwitansi</th><td><b>${esc(doc.doc_number)}</b></td></tr>
        <tr><th>Tanggal</th><td>${dateID(doc.issued_date)}</td></tr>
      </tbody></table>
      <table class="receipt-table"><tbody>
        <tr><th>Sudah terima dari</th><td>${esc(d.received_from||p.client_name)}</td></tr>
        <tr><th>Uang sejumlah</th><td><b>${moneyCompact(doc.amount)}</b></td></tr>
        <tr><th>Terbilang</th><td><b>${esc(terbilang(doc.amount))}</b></td></tr>
        <tr><th>Untuk pembayaran</th><td>${esc(d.description||`Pembayaran pekerjaan ${p.name}`)}${ref&&ref!=='-'?` sesuai ${esc(ref)}`:''}</td></tr>
      </tbody></table>
      <div class="receipt-total"><span>NILAI PEMBAYARAN</span><strong>${moneyCompact(doc.amount)}</strong></div>
      <div class="document-date">${dateID(doc.issued_date)}</div>
      <div class="signature-grid receipt-signatures">
        ${signatureBlock('Reka Ruang',state.settings.pic||state.settings.business_name||'Reka Ruang','',true)}
        ${signatureBlock('Pembayar',d.received_from||p.client_name,'',false)}
      </div>
      <div class="document-note"><b>Catatan:</b> ${esc(d.notes||'Kwitansi ini digunakan sebagai bukti pembayaran setelah dana diterima.')}</div>`;
  } else if(doc.doc_type==='proposal'){
    body=`
      <div class="section-title">PENAWARAN PEKERJAAN INTERIOR & BUILD</div>
      <table class="meta-table"><tbody>
        <tr><th>Nomor Proposal</th><td><b>${esc(doc.doc_number)}</b></td></tr>
        <tr><th>Tanggal</th><td>${dateID(doc.issued_date)}</td></tr>
        <tr><th>Berlaku Sampai</th><td>${dateID(d.valid_until)}</td></tr>
      </tbody></table>
      <div class="client-title">Ditujukan kepada</div><div class="client-name">${esc(p.client_name)}</div>
      <div class="content-heading">Ruang Lingkup Pekerjaan</div><div class="note-box">${esc(d.scope||p.scope||'-').replace(/\n/g,'<br>')}</div>
      <table class="line-table"><thead><tr><th>Penawaran</th><th class="right">Nilai</th></tr></thead><tbody><tr><td>${esc(p.name)}</td><td class="right"><b>${moneyCompact(doc.amount)}</b></td></tr></tbody><tfoot><tr><th class="total-label">TOTAL PENAWARAN</th><th class="right total-amount">${moneyCompact(doc.amount)}</th></tr></tfoot></table>
      <div class="content-heading">Syarat Pembayaran</div><div class="note-box">${esc(d.payment_terms||'-').replace(/\n/g,'<br>')}</div>
      <div class="content-heading">Catatan</div><div class="note-box">${esc(d.notes||'-').replace(/\n/g,'<br>')}</div>
      <div class="document-date">${dateID(doc.issued_date)}</div>
      <div class="signature-grid">${signatureBlock('Client',p.client_name,'',false)}${signatureBlock('Reka Ruang',state.settings.pic||state.settings.business_name||'Reka Ruang','',true)}</div>`;
  } else {
    body=`
      <div class="section-title">PERJANJIAN PELAKSANAAN PEKERJAAN</div>
      <table class="meta-table"><tbody><tr><th>Nomor SPK</th><td><b>${esc(doc.doc_number)}</b></td></tr><tr><th>Tanggal</th><td>${dateID(doc.issued_date)}</td></tr><tr><th>Kode Proyek</th><td>${esc(p.project_code||'-')}</td></tr></tbody></table>
      <p>Pada tanggal <b>${dateID(doc.issued_date)}</b>, telah disepakati pekerjaan antara <b>${esc(state.settings.business_name||'Reka Ruang')}</b> sebagai pelaksana dan <b>${esc(p.client_name)}</b> sebagai pemberi pekerjaan.</p>
      <table class="detail-table"><tbody><tr><th>Proyek</th><td>${esc(p.name)}</td></tr><tr><th>Lokasi</th><td>${esc(d.location||p.location||'-')}</td></tr><tr><th>Nilai Pekerjaan</th><td><b>${moneyCompact(doc.amount)}</b></td></tr></tbody></table>
      <div class="content-heading">1. Ruang Lingkup Pekerjaan</div><div class="note-box">${esc(d.scope||p.scope||'-').replace(/\n/g,'<br>')}</div>
      <div class="content-heading">2. Termin Pembayaran</div><div class="note-box">${esc(d.payment_terms||'-').replace(/\n/g,'<br>')}</div>
      <div class="content-heading">3. Waktu & Garansi</div><div class="note-box"><b>Durasi:</b> ${esc(d.duration||'-')}<br><b>Garansi:</b> ${esc(d.warranty||'-')}</div>
      <div class="content-heading">4. Ketentuan Tambahan</div><div class="note-box">${esc(d.notes||'-').replace(/\n/g,'<br>')}</div>
      <div class="document-date">${dateID(doc.issued_date)}</div>
      <div class="signature-grid">${signatureBlock('Client',p.client_name,'',false)}${signatureBlock('Reka Ruang',state.settings.pic||state.settings.business_name||'Reka Ruang','',true)}</div>`;
  }
  w.document.open();w.document.write(printShell(doc.doc_number,body,{displayTitle,footer:`REKA RUANG - ${displayTitle} - ${p.client_name}`,autoPrint:options.autoPrint!==false}));w.document.close();
}
function printShell(title,body,meta={}){
  const s=state.settings||{},logo=esc(logoAssetUrl()),displayTitle=esc(meta.displayTitle||'DOKUMEN'),footer=esc(meta.footer||`REKA RUANG - ${meta.displayTitle||'DOKUMEN'}`);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title||'Dokumen Reka Ruang')}</title><style>
  @page{size:A4;margin:13mm 15mm 17mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#282b2d}body{font-family:Georgia,'Times New Roman',serif;font-size:11.3px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{min-height:260mm;position:relative;padding-bottom:14mm}.brand-header{display:grid;grid-template-columns:1fr 1fr;align-items:start;min-height:56mm;margin-bottom:7mm;position:relative}.brand-logo{display:flex;align-items:flex-start}.brand-logo img{width:61mm;height:43mm;object-fit:contain;object-position:left top}.brand-title{text-align:right;padding-top:2mm}.brand-title h1{font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1;margin:0 0 7mm;font-weight:800;letter-spacing:.2px}.brand-title .subtitle{color:#b58d63;font-weight:700;font-size:10.5px;letter-spacing:.3px}.section-title{font-size:13.5px;color:#ad855f;font-weight:800;margin:0 0 5mm;text-transform:uppercase}.meta-table,.detail-table,.bank-table,.receipt-table,.line-table{width:100%;border-collapse:collapse;margin:0 0 6mm}.meta-table{width:66%;}.meta-table.short{width:66%}.meta-table th,.meta-table td,.detail-table th,.detail-table td,.bank-table th,.bank-table td{border:1px solid #d8d6d2;padding:3px 8px;vertical-align:top}.meta-table th,.detail-table th,.bank-table th{width:36%;text-align:left;background:#f3f0ed;color:#616161}.meta-table td{font-size:11px}.client-title{color:#ad855f;font-weight:800;font-size:12px;margin:2mm 0 1mm}.client-name{font-size:16px;font-weight:800;margin-bottom:5mm}.line-table th,.line-table td{border:1px solid #d8d6d2;padding:5px 8px;vertical-align:middle}.line-table thead th{background:#262a2c;color:#fff;font-weight:700}.line-table tfoot th{border-color:#b58d63}.line-table tfoot .total-label,.line-table tfoot .total-amount{background:#b58d63;color:#fff;font-size:13px}.center{text-align:center!important}.right{text-align:right!important}.muted-print{margin-top:2px;color:#5c5c5c}.terbilang{margin:7mm 0 4mm;font-size:11px}.content-heading{font-weight:800;font-size:12px;margin:5mm 0 2mm}.content-heading.accent{color:#ad855f}.bank-table{width:88%;margin-left:7%}.bank-table th{width:27%;color:#333}.bank-table td:nth-child(2){width:34%}.document-note{margin-top:3mm;color:#5a5a5a}.document-note b{color:#2d2d2d}.receipt-table{width:92%;margin:9mm auto 7mm}.receipt-table th,.receipt-table td{border:1px solid #d8d6d2;padding:4px 9px;vertical-align:top}.receipt-table th{width:25%;background:#b58d63;color:#fff;text-align:left}.receipt-total{width:90%;margin:0 auto 8mm;background:#25292b;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:5px 28px;font-weight:800;font-size:13px}.receipt-total strong{font-size:20px}.content-heading+.note-box{margin-top:0}.note-box{border:1px solid #d8d6d2;padding:8px 10px;min-height:10mm;background:#fff}.agreement-text{margin-top:6mm}.detail-table th{width:25%;color:#333}.check-list{border:1px solid #d8d6d2}.check-row{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start;padding:6px 8px;border-bottom:1px solid #e4e1dd}.check-row:last-child{border-bottom:0}.check-box{width:15px;height:15px;border:1.4px solid #333;display:inline-flex;align-items:center;justify-content:center;font-weight:800;line-height:1}.document-date{text-align:right;margin:9mm 2mm 3mm}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:22mm;margin-top:3mm;text-align:center}.signature-party{position:relative;min-height:42mm}.sign-role{font-weight:700;margin-bottom:2mm}.sign-name-top{font-weight:800}.signature-area{height:25mm;position:relative;display:flex;align-items:center;justify-content:center}.signature-img{position:absolute;z-index:2;width:42mm;height:20mm;object-fit:contain}.company-stamp{position:absolute;z-index:3;width:39mm;height:22mm;border:2px solid rgba(173,133,95,.9);border-radius:50%;display:flex;align-items:center;justify-content:center;transform:rotate(-5deg);opacity:.86;background:rgba(255,255,255,.83)}.company-stamp:after{content:'REKA RUANG';position:absolute;bottom:1.5mm;font-family:Arial,sans-serif;font-size:6px;font-weight:900;letter-spacing:1px;color:#8f6d4f}.company-stamp img{width:31mm;height:15mm;object-fit:contain}.sign-line-name{display:inline-block;min-width:45mm;border-bottom:1px solid #666;padding:0 5px 2px}.receipt-signatures{margin-top:0}.print-signatures{margin-top:4mm}.doc-footer{position:fixed;left:0;right:0;bottom:4mm;text-align:center;font-size:8px;color:#777}.brand-contact{position:absolute;right:0;bottom:0;text-align:right;color:#777;font-family:Arial,sans-serif;font-size:7.5px;line-height:1.4}.brand-contact:empty{display:none}p{margin:0 0 4mm}b,strong{font-weight:800}@media screen{body{padding:12px}.page{max-width:210mm;margin:auto;box-shadow:0 0 0 1px #eee}}@media print{body{padding:0}.page{box-shadow:none}}
  </style></head><body><div class="page"><header class="brand-header"><div class="brand-logo"><img src="${logo}" alt="Reka Ruang"></div><div class="brand-title"><h1>${displayTitle}</h1><div class="subtitle">REKA RUANG - INTERIOR &amp; BUILD</div></div><div class="brand-contact">${esc(s.phone||'')}${s.email?'<br>'+esc(s.email):''}${s.address?'<br>'+esc(s.address):''}</div></header>${body}<div class="doc-footer">${footer}</div></div>${meta.autoPrint===false?'':`<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),550));<\/script>`}</body></html>`;
}

function pdfSafeName(value){
  const base=String(value||'dokumen-reka-ruang').normalize('NFKD').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  return (base||'dokumen-reka-ruang')+'.pdf';
}
async function waitForPdfFrame(frame){
  const doc=frame.contentDocument;
  if(!doc)throw new Error('Dokumen PDF tidak dapat dibuat.');
  if(doc.readyState!=='complete')await new Promise(resolve=>{const done=()=>resolve();frame.addEventListener('load',done,{once:true});setTimeout(done,1500)});
  const imgs=[...doc.images];
  await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,1800)})));
  if(doc.fonts?.ready)try{await doc.fonts.ready}catch{}
  await new Promise(r=>setTimeout(r,180));
}
async function downloadRenderedPdf(renderFn,filename){
  if(typeof window.html2pdf!=='function')throw new Error('Library PDF belum termuat. Refresh halaman lalu coba lagi.');
  const frame=document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;background:#fff;';
  document.body.appendChild(frame);
  try{
    await renderFn(frame.contentWindow);
    await waitForPdfFrame(frame);
    const page=frame.contentDocument.querySelector('.page');if(!page)throw new Error('Layout dokumen tidak ditemukan.');
    const options={margin:0,filename:pdfSafeName(filename),image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy']}};
    await window.html2pdf().set(options).from(page).save();
    toast('PDF berhasil didownload');
  }finally{frame.remove()}
}
async function downloadDocObject(p,doc){
  const label=docLabel(doc.doc_type);
  await downloadRenderedPdf(win=>renderPrintableDoc(p,doc,win,{autoPrint:false}),`${label}-${p?.client_name||p?.name||'Reka-Ruang'}-${doc.doc_number||''}`);
}

$('#settingsForm').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.currentTarget).entries());fd.id='company';try{const {error}=await db.from('company_settings').upsert(fd);if(error)throw error;await refresh(false);toast('Pengaturan disimpan')}catch(err){alert('Gagal menyimpan pengaturan: '+err.message)}};

// Global UI actions
document.addEventListener('click',async e=>{
  const close=e.target.closest('[data-close]');if(close){$('#'+close.dataset.close).close();return}
  const go=e.target.closest('[data-go]');if(go){switchView(go.dataset.go);return}
  const tab=e.target.closest('[data-tab]');if(tab){const root=$('#projectDetailContent');$$('.tab-btn',root).forEach(x=>x.classList.remove('active'));$$('.tab-pane',root).forEach(x=>x.classList.remove('active'));tab.classList.add('active');$(`[data-pane="${tab.dataset.tab}"]`,root)?.classList.add('active');return}
  const a=e.target.closest('[data-action]');if(!a)return;const id=a.dataset.id;
  if(a.dataset.action==='open-project'){renderProjectDetail(id);$('#projectDetailDialog').showModal()}
  if(a.dataset.action==='edit-project')openProjectForm(id);
  if(a.dataset.action==='add-tx')openTransaction(id);
  if(a.dataset.action==='update-progress')openProgress(id);
  if(a.dataset.action==='upload-file')openFileDialog(id,a.dataset.type);
  if(a.dataset.action==='open-file')openStoredFile(id);
  if(a.dataset.action==='delete-file')deleteStoredFile(id);
  if(a.dataset.action==='open-bast')openBast(id,a.dataset.type);
  if(a.dataset.action==='print-bast'){const b=state.basts.find(x=>x.id===a.dataset.bastId);if(b)printBast(b)}
  if(a.dataset.action==='download-bast'){const b=state.basts.find(x=>x.id===a.dataset.bastId);if(b)downloadBastPdf(b)}
  if(a.dataset.action==='new-doc')openDocBuilder(id,a.dataset.type);
  if(a.dataset.action==='reprint-doc')reprintDoc(id);
  if(a.dataset.action==='download-doc')downloadDoc(id);
});
function switchView(name){$$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.view===name));$$('.view').forEach(x=>x.classList.remove('active'));$('#'+name+'View').classList.add('active');const meta={dashboard:['Dashboard','Ringkasan proyek, progress, dan arus keuangan.'],projects:['Proyek','Semua data proyek Reka Ruang.'],finance:['Keuangan','Pemasukan dan pengeluaran per proyek.'],documents:['Dokumen','Invoice, Kwitansi, Proposal Penawaran, SPK, dan arsip dokumen.'],settings:['Pengaturan','Identitas Reka Ruang dan rekening pembayaran.']}[name];$('#pageTitle').textContent=meta[0];$('#pageSubtitle').textContent=meta[1]}
$$('.nav-btn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));

init();
