/* ---------------- STATE ---------------- */
let clientes = [];
let agendamentos = [];
let currentTab = 'inicio';
let financeMonth = new Date().toISOString().slice(0,7); // YYYY-MM
let clientSearch = '';
let agendaFilter = 'todos';
let currentClientDetail = null;

const PAY_METHODS = ['Pix','Dinheiro','Cartão Débito','Cartão Crédito'];
const STATUS_LABELS = {
  pendente:'Aguardando confirmação',
  confirmado:'Confirmado',
  compareceu:'Compareceu',
  nao_compareceu:'Não compareceu',
  cancelado:'Cancelado'
};

/* ---------------- STORAGE ---------------- */
async function loadData(){
  try{
    const c = await window.storage.get('clientes', false);
    clientes = c ? JSON.parse(c.value) : [];
  }catch(e){ clientes = []; }
  try{
    const a = await window.storage.get('agendamentos', false);
    agendamentos = a ? JSON.parse(a.value) : [];
  }catch(e){ agendamentos = []; }
}
async function saveClientes(){
  try{ await window.storage.set('clientes', JSON.stringify(clientes), false); }
  catch(e){ showToast('Erro ao salvar clientes'); }
}
async function saveAgendamentos(){
  try{ await window.storage.set('agendamentos', JSON.stringify(agendamentos), false); }
  catch(e){ showToast('Erro ao salvar agendamentos'); }
}

/* ---------------- HELPERS ---------------- */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function fmtMoney(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtPhone(p){
  if(!p) return '';
  const d = p.replace(/\D/g,'');
  if(d.length===11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if(d.length===10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
}
function fmtDateBR(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}`;
}
function fmtDateFull(iso){
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function weekdayShort(iso){
  const dt = new Date(iso+'T12:00:00');
  return dt.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','');
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function initials(name){
  const parts = name.trim().split(' ').filter(Boolean);
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}
function getClient(id){ return clientes.find(c=>c.id===id); }
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}
function closeSheet(){ document.getElementById('overlay').classList.remove('show'); document.getElementById('sheetContent').innerHTML=''; }
function openSheet(html){
  document.getElementById('sheetContent').innerHTML = `<button class="close-x" onclick="closeSheet()">✕</button><div class="sheet-handle"></div>` + html;
  document.getElementById('overlay').classList.add('show');
}

/* ---------------- RENDER ROOT ---------------- */
function render(){
  document.getElementById('headerSub').textContent = new Date().toLocaleDateString('pt-BR',{weekday:'long', day:'numeric', month:'long'});
  document.querySelectorAll('nav.bottom button').forEach(b=>b.classList.toggle('active', b.dataset.tab===currentTab));
  const main = document.getElementById('main');
  if(currentTab==='inicio') main.innerHTML = renderInicio();
  else if(currentTab==='agenda') main.innerHTML = renderAgenda();
  else if(currentTab==='clientes') main.innerHTML = renderClientes();
  else if(currentTab==='financeiro') main.innerHTML = renderFinanceiro();
}

/* ---------------- INÍCIO ---------------- */
function renderInicio(){
  const hoje = todayISO();
  const de_hoje = agendamentos.filter(a=>a.data===hoje).sort((a,b)=>a.horario.localeCompare(b.horario));
  const previsto = de_hoje.filter(a=>a.status!=='cancelado').reduce((s,a)=>s+Number(a.valor||0),0);
  const pendentesConf = agendamentos.filter(a=>a.status==='pendente').length;

  return `
    <div class="stat-row">
      <div class="stat"><span class="num">${de_hoje.length}</span><span class="lbl">Hoje</span></div>
      <div class="stat"><span class="num">${fmtMoney(previsto)}</span><span class="lbl">Previsto hoje</span></div>
      <div class="stat"><span class="num">${pendentesConf}</span><span class="lbl">A confirmar</span></div>
    </div>
    <h2 class="section-title">Agenda de hoje</h2>
    <div class="card">
      ${de_hoje.length ? de_hoje.map(a=>apptRow(a)).join('') : emptyState('🌸','Nenhum horário para hoje','Toque no + para marcar um novo atendimento')}
    </div>
    ${pendentesConf ? `
    <h2 class="section-title">Aguardando confirmação</h2>
    <div class="card">
      ${agendamentos.filter(a=>a.status==='pendente').sort((a,b)=> (a.data+a.horario).localeCompare(b.data+b.horario)).slice(0,6).map(a=>apptRow(a,true)).join('')}
    </div>` : ''}
  `;
}

function emptyState(icon, title, sub){
  return `<div class="empty"><span class="flower">${icon}</span><p style="font-weight:700;color:var(--ink)">${title}</p><p>${sub}</p></div>`;
}

function apptRow(a, showDate){
  const c = getClient(a.clienteId);
  const nome = c ? c.nome : '(cliente removido)';
  let actions = '';
  if(a.status==='pendente'){
    actions += `<button class="mini-btn whats" onclick="sendConfirmWhats('${a.id}')">Enviar confirmação</button>`;
    actions += `<button class="mini-btn ok" onclick="setStatus('${a.id}','confirmado')">Confirmar</button>`;
  }
  if(a.status==='confirmado'){
    actions += `<button class="mini-btn ok" onclick="setStatus('${a.id}','compareceu')">Compareceu</button>`;
    actions += `<button class="mini-btn no" onclick="setStatus('${a.id}','nao_compareceu')">Não veio</button>`;
  }
  if(a.status==='compareceu' || a.status==='nao_compareceu'){
    actions += `<button class="mini-btn edit" onclick="editAppt('${a.id}')">Editar</button>`;
  }
  if(a.status!=='cancelado'){
    actions += `<button class="mini-btn edit" onclick="editAppt('${a.id}')">Editar</button>`;
  }
  return `
    <div class="appt">
      <div class="time-badge">
        <b>${a.horario}</b>
        <small>${showDate ? fmtDateBR(a.data) : weekdayShort(a.data)}</small>
      </div>
      <div class="info">
        <div class="name">${nome}</div>
        <div class="service">${a.servico}</div>
        <div class="value">${fmtMoney(a.valor)} · ${a.formaPagamento}</div>
        <span class="badge ${a.status}">${STATUS_LABELS[a.status]}</span>
        <div class="actions">${actions}</div>
      </div>
    </div>
  `;
}

function sendConfirmWhats(id){
  const a = agendamentos.find(x=>x.id===id);
  const c = getClient(a.clienteId);
  if(!c || !c.telefone){ showToast('Cliente sem telefone cadastrado'); return; }
  const msg = `Olá ${c.nome.split(' ')[0]}! Aqui é do Karine Studio 🌸 Confirmando seu horário de *${a.servico}* no dia ${fmtDateFull(a.data)} às ${a.horario}. Pode confirmar pra mim?`;
  const phone = c.telefone.replace(/\D/g,'');
  const full = phone.length<=11 ? '55'+phone : phone;
  window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function setStatus(id, status){
  const a = agendamentos.find(x=>x.id===id);
  if(!a) return;
  a.status = status;
  await saveAgendamentos();
  render();
  showToast(status==='compareceu' ? 'Marcado como compareceu ✓' : status==='confirmado' ? 'Agendamento confirmado' : status==='nao_compareceu' ? 'Marcado como não compareceu' : 'Atualizado');
}

/* ---------------- AGENDA ---------------- */
function renderAgenda(){
  const filtered = agendamentos.filter(a=> agendaFilter==='todos' ? true : a.status===agendaFilter)
    .sort((a,b)=> (a.data+a.horario).localeCompare(b.data+b.horario));
  const groups = {};
  filtered.forEach(a=>{ (groups[a.data] = groups[a.data]||[]).push(a); });
  const dates = Object.keys(groups).sort();

  return `
    <div class="chips">
      ${['todos','pendente','confirmado','compareceu','nao_compareceu','cancelado'].map(f=>`
        <div class="chip ${agendaFilter===f?'active':''}" onclick="setAgendaFilter('${f}')">${f==='todos'?'Todos':STATUS_LABELS[f]}</div>
      `).join('')}
    </div>
    ${dates.length ? dates.map(d=>`
      <h2 class="section-title">${weekdayShort(d)}, ${fmtDateFull(d)}</h2>
      <div class="card">${groups[d].map(a=>apptRow(a)).join('')}</div>
    `).join('') : `<div class="card">${emptyState('📅','Nenhum agendamento','Toque no + para criar o primeiro')}</div>`}
  `;
}
function setAgendaFilter(f){ agendaFilter = f; render(); }

/* ---------------- CLIENTES ---------------- */
function renderClientes(){
  const list = clientes.filter(c=>{
    const q = clientSearch.toLowerCase();
    return c.nome.toLowerCase().includes(q) || (c.telefone||'').includes(q);
  }).sort((a,b)=>a.nome.localeCompare(b.nome));

  return `
    <div class="search-box">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8C7278" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input type="text" placeholder="Buscar por nome ou telefone" value="${clientSearch}" oninput="clientSearch=this.value; render();">
    </div>
    <div class="card">
      ${list.length ? list.map(c=>`
        <div class="client-card" onclick="openClientDetail('${c.id}')">
          <div class="avatar">${initials(c.nome)}</div>
          <div>
            <div class="cname">${c.nome}</div>
            <div class="cphone">${fmtPhone(c.telefone)}</div>
          </div>
          <span class="chevron">›</span>
        </div>
      `).join('') : emptyState('👤','Nenhuma cliente cadastrada','Toque no + para cadastrar')}
    </div>
  `;
}

function openClientDetail(id){
  currentClientDetail = id;
  const c = getClient(id);
  const historico = agendamentos.filter(a=>a.clienteId===id).sort((a,b)=> (b.data+b.horario).localeCompare(a.data+a.horario));
  const totalGasto = historico.filter(a=>a.status==='compareceu').reduce((s,a)=>s+Number(a.valor||0),0);

  openSheet(`
    <h3>${c.nome}</h3>
    <div style="display:flex; gap:8px; margin-bottom:16px;">
      <button class="mini-btn whats" style="padding:8px 14px;" onclick="openWhatsClient('${c.id}')">WhatsApp</button>
      <button class="mini-btn edit" style="padding:8px 14px;" onclick="editClient('${c.id}')">Editar cliente</button>
    </div>
    <div class="stat-row" style="margin-bottom:18px;">
      <div class="stat"><span class="num">${historico.length}</span><span class="lbl">Atendimentos</span></div>
      <div class="stat"><span class="num">${fmtMoney(totalGasto)}</span><span class="lbl">Total gasto</span></div>
    </div>

    <label style="margin-top:0;">Observações</label>
    <div id="obsList">
      ${(c.observacoes && c.observacoes.length) ? c.observacoes.slice().reverse().map(o=>`
        <div class="obs-item"><div class="odate">${fmtDateFull(o.data)}</div><div class="otext">${o.texto}</div></div>
      `).join('') : `<p style="font-size:13px;color:var(--ink-soft);">Nenhuma observação ainda.</p>`}
    </div>
    <textarea id="newObsText" placeholder="Adicionar observação (alergia, preferência, etc)"></textarea>
    <button class="btn-secondary" onclick="addObservation('${c.id}')">Adicionar observação</button>

    <label>Histórico de agendamentos</label>
    ${historico.length ? historico.map(a=>`
      <div class="obs-item">
        <div class="odate">${fmtDateFull(a.data)} · ${a.horario}</div>
        <div class="otext">${a.servico} — ${fmtMoney(a.valor)} <span class="badge ${a.status}" style="margin-top:4px;">${STATUS_LABELS[a.status]}</span></div>
      </div>
    `).join('') : `<p style="font-size:13px;color:var(--ink-soft);">Sem agendamentos ainda.</p>`}

    <button class="btn-danger-text" onclick="deleteClient('${c.id}')">Excluir cliente</button>
  `);
}

function openWhatsClient(id){
  const c = getClient(id);
  if(!c.telefone){ showToast('Cliente sem telefone cadastrado'); return; }
  const phone = c.telefone.replace(/\D/g,'');
  const full = phone.length<=11 ? '55'+phone : phone;
  window.open(`https://wa.me/${full}`, '_blank');
}

async function addObservation(id){
  const txt = document.getElementById('newObsText').value.trim();
  if(!txt) return;
  const c = getClient(id);
  c.observacoes = c.observacoes || [];
  c.observacoes.push({data: todayISO(), texto: txt});
  await saveClientes();
  showToast('Observação adicionada');
  openClientDetail(id);
}

async function deleteClient(id){
  if(!confirm('Excluir esta cliente? Os agendamentos vinculados continuarão no histórico.')) return;
  clientes = clientes.filter(c=>c.id!==id);
  await saveClientes();
  closeSheet();
  render();
  showToast('Cliente excluída');
}

function editClient(id){
  const c = getClient(id);
  openSheet(`
    <h3>Editar cliente</h3>
    <label>Nome</label>
    <input type="text" id="cNome" value="${c.nome}">
    <label>Telefone (WhatsApp)</label>
    <input type="tel" id="cTel" value="${c.telefone||''}" placeholder="43 99999-9999">
    <button class="btn-primary" onclick="saveClientEdit('${c.id}')">Salvar</button>
  `);
}
async function saveClientEdit(id){
  const c = getClient(id);
  const nome = document.getElementById('cNome').value.trim();
  if(!nome){ showToast('Informe o nome'); return; }
  c.nome = nome;
  c.telefone = document.getElementById('cTel').value.trim();
  await saveClientes();
  showToast('Cliente atualizada');
  openClientDetail(id);
}

function newClientForm(prefillName){
  openSheet(`
    <h3>Nova cliente</h3>
    <label>Nome</label>
    <input type="text" id="ncNome" value="${prefillName||''}" placeholder="Nome completo">
    <label>Telefone (WhatsApp)</label>
    <input type="tel" id="ncTel" placeholder="43 99999-9999">
    <label>Observação inicial (opcional)</label>
    <textarea id="ncObs" placeholder="Alergias, preferências..."></textarea>
    <button class="btn-primary" onclick="saveNewClient()">Cadastrar cliente</button>
  `);
}
async function saveNewClient(returnId){
  const nome = document.getElementById('ncNome').value.trim();
  if(!nome){ showToast('Informe o nome'); return; }
  const tel = document.getElementById('ncTel').value.trim();
  const obs = document.getElementById('ncObs').value.trim();
  const novo = {id:uid(), nome, telefone:tel, observacoes: obs?[{data:todayISO(), texto:obs}]:[]};
  clientes.push(novo);
  await saveClientes();
  closeSheet();
  currentTab='clientes';
  render();
  showToast('Cliente cadastrada');
}

/* ---------------- FINANCEIRO ---------------- */
function shiftMonth(delta){
  const [y,m] = financeMonth.split('-').map(Number);
  const dt = new Date(y, m-1+delta, 1);
  financeMonth = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  render();
}
function renderFinanceiro(){
  const doMes = agendamentos.filter(a=>a.data && a.data.startsWith(financeMonth));
  const compareceram = doMes.filter(a=>a.status==='compareceu');
  const faltaram = doMes.filter(a=>a.status==='nao_compareceu');
  const total = compareceram.reduce((s,a)=>s+Number(a.valor||0),0);
  const ticket = compareceram.length ? total/compareceram.length : 0;

  const porPagamento = {};
  PAY_METHODS.forEach(m=>porPagamento[m]=0);
  compareceram.forEach(a=>{ porPagamento[a.formaPagamento] = (porPagamento[a.formaPagamento]||0) + Number(a.valor||0); });
  const maxVal = Math.max(1, ...Object.values(porPagamento));

  const [y,m] = financeMonth.split('-');
  const mLabel = new Date(Number(y), Number(m)-1, 1).toLocaleDateString('pt-BR',{month:'long', year:'numeric'});

  return `
    <div class="month-switch">
      <button onclick="shiftMonth(-1)">‹</button>
      <div class="mlabel">${mLabel}</div>
      <button onclick="shiftMonth(1)">›</button>
    </div>

    <div class="card" style="background:linear-gradient(135deg, var(--pink-pale) 0%, var(--pink-pale-2) 100%); border:none;">
      <div style="font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.5px;">Faturamento do mês</div>
      <div style="font-family:'Fraunces',serif; font-weight:600; font-size:32px; color:var(--pink-deep); margin-top:4px;">${fmtMoney(total)}</div>
    </div>

    <div class="stat-row" style="margin-top:10px;">
      <div class="stat"><span class="num">${compareceram.length}</span><span class="lbl">Atendimentos</span></div>
      <div class="stat"><span class="num">${fmtMoney(ticket)}</span><span class="lbl">Ticket médio</span></div>
      <div class="stat"><span class="num">${faltaram.length}</span><span class="lbl">Faltas</span></div>
    </div>

    <h2 class="section-title">Por forma de pagamento</h2>
    <div class="card">
      ${PAY_METHODS.map(m=>`
        <div class="pay-row">
          <span class="pname">${m}</span>
          <div class="bar-wrap"><div class="bar" style="width:${(porPagamento[m]/maxVal*100)}%"></div></div>
          <span class="pval">${fmtMoney(porPagamento[m])}</span>
        </div>
      `).join('')}
    </div>

    <h2 class="section-title">Atendimentos do mês</h2>
    <div class="card">
      ${compareceram.length ? compareceram.sort((a,b)=>b.data.localeCompare(a.data)).map(a=>`
        <div class="appt">
          <div class="time-badge"><b>${fmtDateBR(a.data)}</b><small>${a.horario}</small></div>
          <div class="info">
            <div class="name">${getClient(a.clienteId)?.nome || '(removida)'}</div>
            <div class="service">${a.servico}</div>
            <div class="value">${fmtMoney(a.valor)} · ${a.formaPagamento}</div>
          </div>
        </div>
      `).join('') : emptyState('📊','Nenhum atendimento neste mês','Os valores aparecem aqui quando marcar "Compareceu"')}
    </div>
  `;
}

/* ---------------- NOVO / EDITAR AGENDAMENTO ---------------- */
let apptFormState = {};
function newApptForm(){
  apptFormState = {id:null, clienteId:'', servico:'', data:todayISO(), horario:'', valor:'', formaPagamento:'Pix', status:'pendente'};
  renderApptForm();
}
function editAppt(id){
  const a = agendamentos.find(x=>x.id===id);
  apptFormState = {...a};
  renderApptForm();
}
function clientOptions(selectedId){
  return clientes.slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>`<option value="${c.id}" ${c.id===selectedId?'selected':''}>${c.nome}</option>`).join('');
}
function renderApptForm(){
  const s = apptFormState;
  openSheet(`
    <h3>${s.id ? 'Editar agendamento' : 'Novo agendamento'}</h3>
    <label>Cliente</label>
    <select id="aCliente">
      <option value="">Selecionar cliente...</option>
      ${clientOptions(s.clienteId)}
    </select>
    <button class="btn-secondary" style="margin-top:8px;" onclick="quickNewClientFromAppt()">+ Cadastrar nova cliente</button>

    <label>Serviço</label>
    <input type="text" id="aServico" value="${s.servico||''}" placeholder="Ex: Alongamento de unhas">

    <div class="field-row">
      <div><label>Data</label><input type="date" id="aData" value="${s.data||todayISO()}"></div>
      <div><label>Horário</label><input type="time" id="aHorario" value="${s.horario||''}"></div>
    </div>

    <label>Valor (R$)</label>
    <input type="number" id="aValor" value="${s.valor||''}" placeholder="0,00" min="0" step="0.01">

    <label>Forma de pagamento</label>
    <div class="radio-group" id="aPagamento">
      ${PAY_METHODS.map(m=>`<div class="radio-chip ${s.formaPagamento===m?'sel':''}" data-val="${m}" onclick="selectRadio('aPagamento', this)">${m}</div>`).join('')}
    </div>

    <label>Status</label>
    <div class="radio-group" id="aStatus">
      ${Object.keys(STATUS_LABELS).map(st=>`<div class="radio-chip ${s.status===st?'sel':''}" data-val="${st}" onclick="selectRadio('aStatus', this)">${STATUS_LABELS[st]}</div>`).join('')}
    </div>

    <button class="btn-primary" onclick="saveAppt()">${s.id?'Salvar alterações':'Criar agendamento'}</button>
    ${s.id ? `<button class="btn-danger-text" onclick="deleteAppt('${s.id}')">Excluir agendamento</button>` : ''}
  `);
}
function selectRadio(groupId, el){
  document.querySelectorAll(`#${groupId} .radio-chip`).forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
}
function quickNewClientFromAppt(){
  newClientForm();
}
async function saveAppt(){
  const clienteId = document.getElementById('aCliente').value;
  const servico = document.getElementById('aServico').value.trim();
  const data = document.getElementById('aData').value;
  const horario = document.getElementById('aHorario').value;
  const valor = document.getElementById('aValor').value;
  const formaPagamento = document.querySelector('#aPagamento .sel')?.dataset.val || 'Pix';
  const status = document.querySelector('#aStatus .sel')?.dataset.val || 'pendente';

  if(!clienteId){ showToast('Selecione a cliente'); return; }
  if(!servico){ showToast('Informe o serviço'); return; }
  if(!data || !horario){ showToast('Informe data e horário'); return; }

  if(apptFormState.id){
    const a = agendamentos.find(x=>x.id===apptFormState.id);
    Object.assign(a, {clienteId, servico, data, horario, valor, formaPagamento, status});
  }else{
    agendamentos.push({id:uid(), clienteId, servico, data, horario, valor, formaPagamento, status, criadoEm:new Date().toISOString()});
  }
  await saveAgendamentos();
  closeSheet();
  render();
  showToast(apptFormState.id ? 'Agendamento atualizado' : 'Agendamento criado');
}
async function deleteAppt(id){
  if(!confirm('Excluir este agendamento?')) return;
  agendamentos = agendamentos.filter(a=>a.id!==id);
  await saveAgendamentos();
  closeSheet();
  render();
  showToast('Agendamento excluído');
}

/* ---------------- NAV / EVENTS ---------------- */
document.querySelectorAll('nav.bottom button').forEach(btn=>{
  btn.addEventListener('click', ()=>{ currentTab = btn.dataset.tab; render(); });
});
document.getElementById('fabBtn').addEventListener('click', ()=>{
  if(currentTab==='clientes') newClientForm();
  else newApptForm();
});
document.getElementById('overlay').addEventListener('click', (e)=>{
  if(e.target.id==='overlay') closeSheet();
});

/* ---------------- INIT ---------------- */
(async function init(){
  await loadData();
  render();
})();
