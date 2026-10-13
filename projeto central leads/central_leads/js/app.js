/* =====================================================================
   Central de Leads — app autocontido
   ===================================================================== */

const CORES_FUNIL = ['#1F4E79','#2E7BB8','#4FA3D1','#B8802A','#D9A441','#1C8C4C','#96A3B0'];

const ESTAGIOS_PADRAO = ['Novo','Em contato','Qualificado','Visita','Proposta','Fechado','Perdido'];
const ORIGENS_PADRAO  = ['Site','Instagram','Facebook','Google','Indicação','Portal','Telefone','Outro'];
const LOCALIDADES_PADRAO = ['Zona Norte','Zona Sul','Zona Leste','Zona Oeste','Centro'];   // a administração muda em Ajustes
const MODELOS_PADRAO = [
  { id:'m1', nome:'Primeiro contato', texto:'Olá {{primeiro_nome}}, tudo bem? Aqui é {{corretor}}, da {{empresa}}. Vi que você demonstrou interesse em {{interesse}}. Posso te mandar algumas opções por aqui?' },
  { id:'m2', nome:'Retomada', texto:'Oi {{primeiro_nome}}! Passando para saber se você ainda tem interesse em {{interesse}}. Consigo separar novidades que chegaram essa semana.' },
  { id:'m3', nome:'Confirmar visita', texto:'Oi {{primeiro_nome}}, confirmando nossa visita ao {{empreendimento}} no dia {{data_visita}}, às {{hora_visita}}. Qualquer imprevisto é só me chamar por aqui. Abraço, {{corretor}}.' }
];

const PERMISSOES = {
  admin:    { verTodos:true,  criar:true, editarQualquer:true, excluir:true, importar:true, exportar:true, usuarios:true, config:true, modelos:true, atribuir:true, localidade:true },
  corretor: { verTodos:false, criar:true, editarQualquer:false, excluir:false, importar:true, exportar:false, usuarios:false, config:false, modelos:false, atribuir:false, localidade:true }
};

const STATUS_VISITA = { agendada:'Agendada', realizada:'Realizada', cancelada:'Cancelada', faltou:'Não compareceu' };

const PERFIL = document.body.dataset.perfil;   // 'admin' ou 'corretor': qual painel esta página é

const E = {
  db:null, user:null, downloads:null, saindo:false, sigLeads:'', sigUsuarios:'', pendentesN:0,
  pronto:false,
  eu:null,                // documento do usuário logado
  usuarios:[], leads:[], visitas:[], visitasErro:null, config:null,
  vista:'painel',
  selecao:new Set(),
  filtro:{ busca:'', status:'', origem:'', responsavel:'', localidade:'' },
  filtroVisitas:{ periodo:'proximas', status:'', empreendimento:'', responsavel:'' },
  importacao:null,
  assinaturas:[]
};

const $ = (s,r=document)=>r.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const perm = p => PERMISSOES[E.eu?.papel || 'corretor'][p];
const agora = () => new Date().toISOString();

function torrada(txt){
  const t = $('#torrada'); t.textContent = txt; t.classList.add('ver');
  clearTimeout(t._tm); t._tm = setTimeout(()=>t.classList.remove('ver'), 2600);
}
function telas(qual){
  ['tela-carregando','tela-app'].forEach(id=>{
    const el = document.getElementById(id);
    el.classList.toggle('oculto', id !== qual);
  });
  if(qual==='tela-app') document.getElementById('tela-app').style.display='grid';
}

/* ------------------------- utilitários ------------------------- */

function normalizarTelefone(bruto){
  let d = String(bruto||'').replace(/\D/g,'');
  if(!d) return '';
  if(d.startsWith('00')) d = d.slice(2);
  if(d.length === 10 || d.length === 11) d = '55' + d;   // DDD + número, sem país
  if(d.length === 8 || d.length === 9) return '';        // sem DDD: não dá para discar
  return d;
}
function exibirTelefone(n){
  if(!n) return '—';
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(n);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : '+'+n;
}
function moeda(v){
  const n = Number(v)||0;
  return n ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}) : '—';
}
function dataCurta(iso){
  if(!iso) return '—';
  const d = new Date(iso); if(isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
}
function dataHora(iso){
  const d = new Date(iso); if(isNaN(d)) return '';
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function iniciais(nome){
  return String(nome||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}
function nomeUsuario(id){
  const u = E.usuarios.find(x=>x.id===id);
  return u ? u.nome : (id ? 'removido' : 'sem responsável');
}

/** Lista de localidades para escolher: a de Ajustes (ou a padrão) — sem repetir. */
function localidadesDisponiveis(){
  const cfg = E.config?.localidades;
  return (cfg && cfg.length ? cfg : LOCALIDADES_PADRAO).slice();
}
/** Lista de escolha + o que já está nos leads mas não está na lista (ex.: veio de planilha), para nada ficar invisível nos filtros. */
function localidadesConhecidas(){
  const lista = localidadesDisponiveis();
  const vistas = new Set(lista.map(semAcento));
  E.leads.forEach(l=>{
    const v = (l.localidade||'').trim();
    if(v && !vistas.has(semAcento(v))){ vistas.add(semAcento(v)); lista.push(v); }
  });
  return lista;
}
function semAcento(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' '); }
/** "zona norte" / "ZONA NORTE" / "Zóna norte" viram "Zona Norte" quando a lista tem essa opção; senão fica como veio. */
function acharLocalidade(texto){
  const bruto = String(texto||'').trim();
  if(!bruto) return '';
  const alvo = semAcento(bruto);
  return localidadesDisponiveis().find(l=>semAcento(l)===alvo) || bruto;
}

function montarMensagem(texto, lead, visita){
  const nome = lead.nome || '';
  const dic = {
    nome, primeiro_nome: nome.split(/\s+/)[0] || '',
    telefone: exibirTelefone(lead.telefone),
    email: lead.email || '',
    interesse: lead.interesse || 'o que conversamos',
    localidade: lead.localidade || '',
    origem: lead.origem || '',
    status: lead.status || '',
    corretor: E.eu?.nome || '',
    empresa: E.config?.empresa || '',
    ...extrasDaVisita(visita || proximaVisita(lead.id))
  };
  return String(texto||'').replace(/\{\{\s*(\w+)\s*\}\}/g, (t,k)=> (k in dic ? dic[k] : t));
}
function abrirZap(lead, texto){
  if(!lead.telefone){ torrada('Esse lead não tem um telefone válido.'); return false; }
  const url = 'https://wa.me/' + lead.telefone + (texto ? '?text=' + encodeURIComponent(texto) : '');
  window.open(url, '_blank', 'noopener');
  return true;
}

/* ------------------------- acesso ao db ------------------------- */

function refUsuarios(){ return E.db.collection('usuarios'); }
function refLeads(){ return E.db.collection('leads'); }
function refVisitas(){ return E.db.collection('visitas'); }
function refConfig(){ return E.db.doc('config/app'); }

function motivoDaFalha(err) {
  const c = err && err.code;
  if (c === 'sem_conexao') return 'O banco não aceitou a conexão — confira usuário, senha e nome do banco em api/conexao.php.';
  if (c === 'erro_banco') return 'O banco respondeu com erro. Confira se o database.sql foi importado.';
  if (c === 'timeout') return 'O servidor demorou mais de 15 segundos para responder. Se o host do banco estiver errado em api/conexao.php, é isso que acontece.';
  if (c === 'resposta_invalida' && err.entregouPhp) return 'O servidor entregou o CÓDIGO do PHP em vez de executá-lo. Este sistema precisa de um servidor com PHP (a hospedagem, ou "php -S localhost:8080" na pasta). Abrir os arquivos direto, ou por Live Server / servidor só de arquivos, não funciona.';
  if (c === 'resposta_invalida') return 'A API respondeu algo que não é JSON' + (err.trecho ? ': "' + err.trecho + '"' : '') + '. Isso costuma ser um erro ou aviso de PHP, ou um arquivo da pasta api com problema.';
  return 'Não consegui falar com a API. Confira se a pasta api foi enviada e se o PHP está ativo.';
}

async function iniciar(){
  E.db = (typeof Banco !== 'undefined') ? Banco : null;

  if(!E.db){
    $('#tela-carregando').innerHTML =
      '<div style="max-width:420px;text-align:center"><h2>Faltou o arquivo de dados</h2>' +
      '<p class="sub">O js/dados.js não carregou. Confira se ele está na pasta js e se a página está sendo aberta por um servidor.</p></div>';
    return;
  }

  // quem está logado é decidido pelo servidor (cookie de sessão)
  let sessao;
  try{ sessao = await Auth.sessao(); }catch(err){ telaErroConexao(err); return; }
  if(!sessao.logado){ location.replace('login.html'); return; }
  // cada perfil tem a sua página: corretor que abre admin.html (ou o contrário) é levado para a certa
  if(sessao.usuario.papel !== PERFIL){ location.replace(Auth.destino(sessao.usuario)); return; }

  let snapU, snapC;
  try{
    [snapU, snapC] = await Promise.all([ refUsuarios().get(), refConfig().get() ]);
  }catch(err){
    telaErroConexao(err);
    return;
  }
  E.usuarios = snapU.docs.map(d=>({id:d.id, ...d.data()}));
  E.config = snapC.exists ? snapC.data() : null;
  E.comoOutro = !!sessao.comoOutro;
  const eu = E.usuarios.find(u=>u.id === sessao.usuario.id);
  entrar(eu || { ...sessao.usuario, ativo:true });
}

function telaErroConexao(err){
  const motivo = motivoDaFalha(err);
  $('#tela-carregando').innerHTML =
    '<div style="max-width:440px;text-align:center"><h2>Não consegui abrir a central</h2>' +
    '<p class="sub">'+esc(motivo)+' Nada foi apagado, o app só não conseguiu checar.</p>' +
    '<button class="btn btn-primario" id="btn-tentar-novamente" style="margin-top:14px">Tentar de novo</button></div>';
  $('#btn-tentar-novamente').addEventListener('click', ()=>{
    $('#tela-carregando').textContent = 'Abrindo a central…';
    iniciar();
  });
}

function entrar(usuario){
  E.eu = usuario;
  const empresa = E.config?.empresa || '';
  $('#marca-empresa').textContent = empresa;
  $('#marca-empresa-mob').textContent = empresa;
  $('#meu-nome').textContent = usuario.nome;
  $('#meu-avatar').textContent = iniciais(usuario.nome);
  $('#meu-avatar-mob').textContent = iniciais(usuario.nome);
  $('#meu-papel').textContent = usuario.papel === 'admin' ? 'Administração' : 'Corretor';
  mostrarFaixaTroca(E.comoOutro);
  mostrarBotaoTrocarConta();
  telas('tela-app');
  assinar();
  verificarVisitas();
  desenharNav();
  irPara(PERFIL === 'corretor' ? 'inicio' : 'painel');   // o corretor abre na Área do Corretor
}

/** Botão "Trocar de conta" no rodapé da barra lateral — só quando dá pra usar. */
function mostrarBotaoTrocarConta(){
  const deveAparecer = perm('usuarios') && !E.comoOutro;
  document.querySelectorAll('.rodape-lateral').forEach(rodape=>{
    let btn = rodape.querySelector('.btn-trocar-conta');
    if(deveAparecer){
      if(!btn){
        btn = document.createElement('button');
        btn.className = 'btn btn-min btn-cheio btn-trocar-conta';
        btn.style.marginTop = '8px';
        btn.textContent = 'Trocar de conta';
        btn.addEventListener('click', modalTrocarConta);
        const botaoSair = rodape.querySelector('.btn-cheio:not(.btn-trocar-conta)');
        rodape.insertBefore(btn, botaoSair);
      }
    } else if(btn){
      btn.remove();
    }
  });
}

function modalTrocarConta(){
  const outros = E.usuarios.filter(u=>u.id!==E.eu.id && u.ativo!==false);
  abrirModal('Trocar de conta', outros.length ? `
    <p class="sub" style="margin-bottom:10px">Você passa a ver a central como a pessoa escolhida, sem precisar da senha dela.</p>
    <ul class="lista-simples">${outros.map(u=>`
      <li>
        <div><b>${esc(u.nome)}</b><div class="linha2">${esc(u.email)} · ${u.papel==='admin'?'Administração':'Corretor'}</div></div>
        <button class="btn btn-min" onclick="entrarComoUsuario('${u.id}')">Entrar como</button>
      </li>`).join('')}</ul>
  ` : `<p class="sub">Ainda não tem mais ninguém com acesso liberado para trocar de conta.</p>`);
}

/** Faixa fixa no topo quando a administração está vendo a central como outra pessoa. */
function mostrarFaixaTroca(mostrar){
  let el = document.getElementById('faixa-conta-trocada');
  if(mostrar){
    if(!el){
      el = document.createElement('div');
      el.id = 'faixa-conta-trocada';
      el.className = 'faixa-conta-trocada';
      document.body.prepend(el);
    }
    el.innerHTML = `Vendo a central como <b>${esc(E.eu.nome)}</b><button class="btn btn-min" data-voltar-admin>Voltar para a administração</button>`;
  } else if(el){
    el.remove();
  }
  document.body.classList.toggle('com-faixa-troca', !!mostrar);
}

window.entrarComoUsuario = async function(id){
  if(!perm('usuarios')) return;
  const u = E.usuarios.find(x=>x.id===id); if(!u) return;
  if(!confirm(`Entrar como ${u.nome} (${u.email})? Você vai ver a central como essa pessoa até voltar para a administração.`)) return;
  fecharModal();
  try{
    const r = await Auth.entrarComo(id);
    location.assign(Auth.destino(r.usuario));
  }catch(err){ torrada(erroAmigavel(err)); }
};

async function voltarParaAdmin(){
  try{
    const r = await Auth.voltarAdmin();
    location.assign(Auth.destino(r.usuario));
  }catch(err){ torrada(erroAmigavel(err)); }
}
document.addEventListener('click', ev=>{
  if(ev.target.closest('[data-voltar-admin]')) voltarParaAdmin();
});

/** true se o conteúdo mudou desde a última vez — evita redesenhar a tela a cada consulta (4 s) sem novidade */
function mudou(chave, valor){
  const s = JSON.stringify(valor);
  if(E[chave] === s) return false;
  E[chave] = s; return true;
}

function assinar(){
  E.assinaturas.forEach(f=>{ try{ f(); }catch(e){} });
  E.assinaturas = [];

  E.assinaturas.push(refLeads().limit(1000).onSnapshot(snap=>{
    const lista = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(!mudou('sigLeads', lista)) return;
    E.leads = lista;
    if(VISTAS_COM_LEADS.includes(E.vista)) desenhar();
  }, err=>{ if(err.code!=='revoked') console.warn('leads', err); }));

  E.assinaturas.push(refVisitas().onSnapshot(snap=>{
    const lista = snap.docs.map(d=>({id:d.id, ...d.data()}));
    E.visitasErro = null;
    if(!mudou('sigVisitas', lista)) return;
    E.visitas = lista;
    if(VISTAS_COM_LEADS.includes(E.vista)) desenhar();
  }, ()=>{}));

  E.assinaturas.push(refUsuarios().onSnapshot(snap=>{
    const lista = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const eu = lista.find(u=>u.id===E.eu.id);
    if(!eu || eu.ativo === false){ sair(); return; }
    if(eu.papel !== PERFIL){ location.reload(); return; }   // sua permissão mudou: recarrega e cai no painel certo
    if(!mudou('sigUsuarios', lista)) return;
    E.usuarios = lista; E.eu = eu;
    mostrarBotaoTrocarConta();
    desenharNav();
    if((E.vista==='usuarios' || VISTAS_COM_LEADS.includes(E.vista))) desenhar();
  }, ()=>{}));

  E.assinaturas.push(refConfig().onSnapshot(snap=>{
    if(snap.exists){
      if(!mudou('sigConfig', snap.data())) return;
      E.config = snap.data();
      $('#marca-empresa').textContent = E.config.empresa || '';
      $('#marca-empresa-mob').textContent = E.config.empresa || '';
      if((['config','modelos','empreendimentos'].includes(E.vista) || VISTAS_COM_LEADS.includes(E.vista))) desenhar();
    }
  }, ()=>{}));
}

async function sair(){
  if(E.saindo) return;
  E.saindo = true;
  E.assinaturas.forEach(f=>{ try{ f(); }catch(e){} });
  E.assinaturas = [];
  try{ await Auth.sair(); }catch(e){}
  location.replace('login.html');
}
$('#btn-link-vitrine').addEventListener('click', async ev=>{
  const b = ev.currentTarget, link = new URL('empreendimentos.html?c=' + E.eu.id, location.href).href;
  try{ await navigator.clipboard.writeText(link); torrada('Link copiado. Quem pedir contato por ele cai como seu lead.'); }
  catch(err){ prompt('Copie o link da sua vitrine:', link); }
});
$('#btn-sair').addEventListener('click', sair);
$('#btn-sair-mob').addEventListener('click', sair);

/* ------------------------- navegação ------------------------- */

/** Telas que usam leads/visitas e por isso se redesenham quando chegam dados novos. */
const VISTAS_COM_LEADS = ['painel','leads','visitas','inicio','mensagens','propostas','imoveis','vendas','desempenho'];
/** Itens do menu do corretor que só rolam a Área do Corretor até a seção (não são telas separadas). */
const ANCORAS_CORRETOR = { imoveis:'#ac-imoveis', vendas:'#ac-vendas', desempenho:'#ac-desempenho' };

function itensNav(){
  // Corretor: menu enxuto, sem Importar, Distribuição, Equipe nem ajustes administrativos
  if(PERFIL === 'corretor'){
    return [
      { id:'inicio',     rotulo:'Início',          ic:'⌂' },
      { id:'leads',      rotulo:'Meus leads',      ic:'🔥' },
      { id:'mensagens',  rotulo:'Mensagens',       ic:'💬' },
      { id:'visitas',    rotulo:'Minha agenda',    ic:'📅' },
      { id:'imoveis',    rotulo:'Imóveis',         ic:'🏢' },
      { id:'propostas',  rotulo:'Propostas',       ic:'📋' },
      { id:'vendas',     rotulo:'Minhas vendas',   ic:'💰' },
      { sep:true },
      { id:'desempenho', rotulo:'Meu desempenho',  ic:'📊' },
      { id:'perfil',     rotulo:'Meu perfil',      ic:'◔' }
    ];
  }
  const base = [
    { id:'painel', rotulo:'Painel', ic:'◧' },
    { id:'leads',  rotulo:'Leads',  ic:'☰' },
    { id:'visitas', rotulo:'Visitas', ic:'⌂' }
  ];
  if(perm('importar')) base.push({ id:'importar', rotulo:'Importar', ic:'⇪' });
  if(perm('atribuir')) base.push({ id:'distribuicao', rotulo:'Distribuição', ic:'⇄' });
  if(perm('modelos')) base.push({ id:'modelos', rotulo:'Mensagens', ic:'✉' });
  if(perm('config'))   base.push({ id:'empreendimentos', rotulo:'Empreendimentos', ic:'▦' });
  if(perm('usuarios')) base.push({ id:'usuarios', rotulo:'Equipe', ic:'◍' });
  if(perm('config'))   base.push({ id:'config',   rotulo:'Ajustes', ic:'⚙' });
  base.push({ id:'perfil', rotulo:'Configurações', ic:'◔' });
  return base;
}
function usuariosSemAcesso(){ return E.usuarios.filter(u=>u.ativo===false); }
function desenharNav(){
  const n = perm('usuarios') ? usuariosSemAcesso().length : 0;
  const html = itensNav().map(i=> i.sep ? '<div class="nav-sep" role="separator"></div>' :
    `<button class="nav-item${E.vista===i.id?' ativo':''}" data-ir="${i.id}"><span class="ic">${i.ic}</span>${i.rotulo}${i.id==='usuarios' && n ? `<span class="selo" title="${n} aguardando liberação">${n}</span>` : ''}</button>`
  ).join('');
  $('#nav-lateral').innerHTML = html;
  $('#nav-mobile').innerHTML = html;
}
function irPara(v){
  if(!itensNav().some(i=>i.id===v)) v = (PERFIL === 'corretor' ? 'inicio' : 'painel');
  E.vista = v; E.selecao.clear();
  E.rolarPara = ANCORAS_CORRETOR[v] || null;   // Imóveis / Vendas / Desempenho: abre o Início e rola até a seção
  desenharNav(); desenhar(); window.scrollTo(0,0);
  if(E.rolarPara){
    const alvo = E.rolarPara; E.rolarPara = null;
    setTimeout(()=>{ const s = $(alvo); if(s) s.scrollIntoView({ behavior:'smooth', block:'start' }); }, 30);
  }
}
document.addEventListener('click', ev=>{
  const b = ev.target.closest('[data-ir]');
  if(b) irPara(b.dataset.ir);
});

// delegação única — o #conteudo nunca é substituído, só o innerHTML dele
$('#conteudo').addEventListener('click', ev=>{
  const a = ev.target.closest('[data-abrir]'); if(a) return modalLead(a.dataset.abrir);
  const z = ev.target.closest('[data-zap]');   if(z) return modalZap(z.dataset.zap);
  const ve = ev.target.closest('[data-visita]'); if(ve) return modalVisita(ve.dataset.visita);
  const vz = ev.target.closest('[data-visita-zap]');
  if(vz){ const v = E.visitas.find(x=>x.id===vz.dataset.visitaZap); if(v) modalZap(v.leadId, v.id); return; }
});
$('#conteudo').addEventListener('change', ev=>{
  const s = ev.target.closest('[data-sel]');
  if(s){ s.checked ? E.selecao.add(s.dataset.sel) : E.selecao.delete(s.dataset.sel); desenhar(); return; }
  if(ev.target.id === 'sel-tudo'){
    const ls = leadsFiltrados();
    ev.target.checked ? ls.forEach(l=>E.selecao.add(l.id)) : E.selecao.clear();
    desenhar(); return;
  }
  const m = ev.target.closest('[data-mapa]');
  if(m && E.importacao) E.importacao.mapa[m.dataset.mapa] = m.value === '' ? null : Number(m.value);
});

/* ------------------------- desenho das telas ------------------------- */

function desenhar(){
  const c = $('#conteudo');
  // Área do Corretor: não redesenha no meio de um arrasto no funil
  if(window.AreaCorretor && AreaCorretor.ocupado()) return;
  if(PERFIL==='corretor' && ['inicio','imoveis','vendas','desempenho','mensagens','propostas'].includes(E.vista)){
    c.innerHTML = AreaCorretor.tela(E.vista);
    AreaCorretor.ligar();
    return;
  }
  if(E.vista==='painel')    c.innerHTML = telaPainel();
  else if(E.vista==='leads')    { c.innerHTML = telaLeads(); ligarLeads(); }
  else if(E.vista==='visitas')  { c.innerHTML = telaVisitas(); ligarVisitas(); }
  else if(E.vista==='importar') { c.innerHTML = telaImportar(); ligarImportar(); }
  else if(E.vista==='distribuicao') { c.innerHTML = telaDistribuicao(); ligarDistribuicao(); }
  else if(E.vista==='modelos')  { c.innerHTML = telaModelos(); }
  else if(E.vista==='empreendimentos') { c.innerHTML = telaEmpreendimentos(); }
  else if(E.vista==='usuarios') { c.innerHTML = telaUsuarios(); }
  else if(E.vista==='config')   { c.innerHTML = telaConfig(); }
  else if(E.vista==='perfil')   { c.innerHTML = telaPerfil(); }
}

function leadsVisiveis(){
  return perm('verTodos') ? E.leads : E.leads.filter(l=>l.responsavelId === E.eu.id);
}
function leadsFiltrados(){
  const f = E.filtro, b = f.busca.trim().toLowerCase();
  return leadsVisiveis().filter(l=>{
    if(f.status && l.status !== f.status) return false;
    if(f.origem && l.origem !== f.origem) return false;
    if(f.responsavel && (l.responsavelId||'') !== f.responsavel) return false;
    if(f.localidade){
      if(f.localidade === '__sem__'){ if((l.localidade||'').trim()) return false; }
      else if(semAcento(l.localidade) !== semAcento(f.localidade)) return false;
    }
    if(b){
      const alvo = [l.nome,l.email,l.telefone,l.interesse,l.localidade,l.obs].join(' ').toLowerCase();
      if(!alvo.includes(b)) return false;
    }
    return true;
  }).sort((a,b2)=> String(b2.criadoEm||'').localeCompare(String(a.criadoEm||'')));
}

/* --- painel --- */
function desempenhoEquipe(ls, fechado, perdido){
  const gente = E.usuarios.filter(u=>u.ativo!==false);
  const linhas = gente.map(u=>{
    const meus = ls.filter(l=>l.responsavelId===u.id);
    const fech = meus.filter(l=>l.status===fechado);
    const andamento = meus.filter(l=>l.status!==fechado && l.status!==perdido).length;
    const conv = meus.length ? Math.round(fech.length/meus.length*100) : 0;
    return { u, total:meus.length, andamento, fechados:fech.length, conv,
             valor: fech.reduce((t,l)=>t+(Number(l.valor)||0),0) };
  }).sort((a,b)=> b.fechados-a.fechados || b.total-a.total);
  return `
  <div class="painel" style="margin-bottom:18px">
    <h2>Desempenho da equipe</h2>
    <p class="sub" style="margin-bottom:10px">Cada pessoa com os leads que estão sob a responsabilidade dela.</p>
    <div style="overflow:auto"><table class="tabela-mini">
      <thead><tr><th>Pessoa</th><th class="num">Leads</th><th class="num">Em andamento</th><th class="num">Fechados</th><th class="num">Conversão</th><th class="num esconde-mob">Valor fechado</th></tr></thead>
      <tbody>${linhas.map(r=>`<tr>
        <td><b>${esc(r.u.nome)}</b><div class="linha2">${r.u.papel==='admin'?'Administração':'Corretor'}</div></td>
        <td class="num">${r.total}</td><td class="num">${r.andamento}</td><td class="num">${r.fechados}</td>
        <td class="num">${r.conv}%<span class="barra-conv"><i style="width:${r.conv}%"></i></span></td>
        <td class="num esconde-mob">${moeda(r.valor)}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function telaPainel(){
  const ls = leadsVisiveis();
  const admin = perm('verTodos');
  const estagios = E.config?.estagios || ESTAGIOS_PADRAO;
  const perdido = estagios[estagios.length-1];
  const fechado = estagios[estagios.length-2];
  const porEstagio = estagios.map(s => ls.filter(l=>l.status===s).length);
  const total = ls.length || 0;
  const abertos = ls.filter(l=>l.status!==fechado && l.status!==perdido).length;
  const fechados = ls.filter(l=>l.status===fechado).length;
  const valorFechado = ls.filter(l=>l.status===fechado).reduce((t,l)=>t+(Number(l.valor)||0),0);
  const semContato = ls.filter(l=>!(l.historico||[]).some(h=>h.tipo==='whatsapp')).length;
  const semDono = admin ? ls.filter(l=>!l.responsavelId).length : 0;
  const hoje = new Date().toISOString().slice(0,10);
  const atrasados = ls.filter(l=>l.proximoContato && l.proximoContato <= hoje && l.status!==fechado && l.status!==perdido);
  const conv = total ? Math.round(fechados/total*100) : 0;

  const maior = Math.max(1, ...porEstagio);
  const funil = estagios.map((s,i)=>{
    const q = porEstagio[i];
    const flex = Math.max(0.06, q/maior);
    return `<div class="funil-parte" style="flex:${flex};background:${CORES_FUNIL[i%CORES_FUNIL.length]}" title="${esc(s)}: ${q}">${q>0?q:''}</div>`;
  }).join('');
  const legenda = estagios.map((s,i)=>
    `<div><span class="ponto" style="background:${CORES_FUNIL[i%CORES_FUNIL.length]}"></span>${esc(s)} <b class="num">${porEstagio[i]}</b></div>`).join('');

  const recentes = ls.slice().sort((a,b)=>String(b.criadoEm||'').localeCompare(String(a.criadoEm||''))).slice(0,6);

  return `
  <div class="cabecalho">
    <div>
      <h1>Olá, ${esc((E.eu.nome||'').split(' ')[0])}</h1>
      <p class="sub">${admin ? 'Visão completa da equipe' : 'Os leads sob sua responsabilidade'}</p>
    </div>
    ${perm('criar') ? '<button class="btn btn-primario" onclick="modalLead()">Novo lead</button>' : ''}
  </div>

  <div class="grade-kpi">
    <div class="kpi"><div class="v num">${total}</div><div class="l">leads no total</div></div>
    <div class="kpi"><div class="v num">${abertos}</div><div class="l">em andamento</div></div>
    <div class="kpi"><div class="v num">${conv}%</div><div class="l">viraram fechamento</div></div>
    <div class="kpi"><div class="v num">${moeda(valorFechado)}</div><div class="l">em fechamentos</div></div>
    <div class="kpi"><div class="v num">${semContato}</div><div class="l">ainda sem WhatsApp enviado</div></div>
    ${admin ? `<div class="kpi"><div class="v num">${semDono}</div><div class="l">sem responsável</div></div>` : ''}
  </div>

  <div class="painel" style="margin-bottom:18px">
    <h2>Funil</h2>
    <div class="funil">${funil}</div>
    <div class="funil-legenda">${legenda}</div>
  </div>

  ${admin ? desempenhoEquipe(ls, fechado, perdido) : ''}

  ${cartaoProximasVisitas()}

  <div class="painel" style="margin-bottom:18px">
    <h2>Retornos vencidos</h2>
    ${atrasados.length ? `<ul class="lista-simples">${atrasados.slice(0,8).map(l=>`
      <li>
        <div><b class="nome-lead" onclick="modalLead('${l.id}')">${esc(l.nome)}</b>
          <div class="linha2">retorno marcado para ${dataCurta(l.proximoContato)} · ${esc(l.status||'')}</div></div>
        <button class="btn btn-zap btn-min" onclick="modalZap('${l.id}')">WhatsApp</button>
      </li>`).join('')}</ul>`
      : `<p class="sub">Nada vencido por aqui. Marque uma data de retorno na ficha do lead para acompanhar.</p>`}
  </div>

  <div class="painel">
    <h2>Últimos que chegaram</h2>
    ${recentes.length ? `<ul class="lista-simples">${recentes.map(l=>`
      <li>
        <div><b class="nome-lead" onclick="modalLead('${l.id}')">${esc(l.nome)}</b>
          <div class="linha2">${esc(l.origem||'sem origem')} · ${dataCurta(l.criadoEm)}${admin ? ' · '+esc(nomeUsuario(l.responsavelId)) : ''}</div></div>
        <span class="etiqueta">${esc(l.status||'')}</span>
      </li>`).join('')}</ul>`
      : `<div class="vazio"><b>Nenhum lead ainda</b>${perm('criar')
          ? 'Cadastre o primeiro no botão acima ou traga uma planilha em Importar.'
          : 'Quando a administração atribuir leads a você, eles aparecem aqui.'}</div>`}
  </div>`;
}

/* --- leads --- */
function telaLeads(){
  const estagios = E.config?.estagios || ESTAGIOS_PADRAO;
  const origens  = E.config?.origens  || ORIGENS_PADRAO;
  const lista = leadsFiltrados();
  const f = E.filtro;

  const linhas = lista.map(l=>`
    <tr>
      <td style="width:28px"><input type="checkbox" data-sel="${l.id}" ${E.selecao.has(l.id)?'checked':''} aria-label="Selecionar ${esc(l.nome)}"></td>
      <td>
        <span class="nome-lead" data-abrir="${l.id}">${esc(l.nome)}</span>
        <div class="linha2">${esc(exibirTelefone(l.telefone))}${l.email?' · '+esc(l.email):''}</div>
        ${l.localidade ? `<div class="linha2 so-mob">${esc(l.localidade)}</div>` : ''}
      </td>
      <td class="esconde-mob">${esc(l.interesse||'—')}<div class="linha2">${esc(l.origem||'')}</div></td>
      <td class="esconde-mob">${l.localidade ? esc(l.localidade) : '<span class="linha2">—</span>'}</td>
      <td><span class="etiqueta">${esc(l.status||'')}</span></td>
      <td class="esconde-mob">${esc(nomeUsuario(l.responsavelId))}<div class="linha2">${dataCurta(l.criadoEm)}</div></td>
      <td class="esconde-mob num">${moeda(l.valor)}</td>
      <td><div class="acoes-linha">
        <button class="btn btn-zap btn-min" data-zap="${l.id}">Zap</button>
        <button class="btn btn-min esconde-mob" data-abrir="${l.id}">Abrir</button>
      </div></td>
    </tr>`).join('');

  return `
  <div class="cabecalho">
    <div>
      <h1>Leads</h1>
      <p class="sub">${lista.length} de ${leadsVisiveis().length} ${perm('verTodos')?'na base':'atribuídos a você'}</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${perm('exportar')?'<button class="btn" id="btn-exportar">Exportar CSV</button>':''}
      ${perm('criar')?'<button class="btn btn-primario" onclick="modalLead()">Novo lead</button>':''}
    </div>
  </div>

  <div class="filtros">
    <input type="search" id="f-busca" placeholder="Buscar por nome, telefone, e-mail…" value="${esc(f.busca)}">
    <select id="f-status"><option value="">Todos os estágios</option>${estagios.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select>
    <select id="f-origem"><option value="">Todas as origens</option>${origens.map(s=>`<option ${f.origem===s?'selected':''}>${esc(s)}</option>`).join('')}</select>
    <select id="f-local"><option value="">Todas as localidades</option>${localidadesConhecidas().map(x=>`<option value="${esc(x)}" ${f.localidade===x?'selected':''}>${esc(x)}</option>`).join('')}<option value="__sem__" ${f.localidade==='__sem__'?'selected':''}>Sem localidade</option></select>
    ${perm('verTodos')?`<select id="f-resp"><option value="">Todos os responsáveis</option>${E.usuarios.map(u=>`<option value="${u.id}" ${f.responsavel===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select>`:''}
  </div>

  <div id="barra-selecao" class="painel ${E.selecao.size?'':'oculto'}" style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <b class="num">${E.selecao.size}</b> selecionados
    <button class="btn btn-zap btn-min" id="btn-zap-lote">Disparar WhatsApp em sequência</button>
    ${perm('atribuir')?'<button class="btn btn-min" id="btn-atribuir">Atribuir responsável</button>':''}
    ${perm('localidade')?'<button class="btn btn-min" id="btn-localidade">Definir localidade</button>':''}
    ${perm('excluir')?'<button class="btn btn-min btn-perigo" id="btn-excluir-lote">Excluir</button>':''}
    <button class="btn btn-min" id="btn-limpar-sel" style="margin-left:auto">Limpar seleção</button>
  </div>

  <div class="tabela-caixa">
    ${lista.length ? `<table>
      <thead><tr>
        <th><input type="checkbox" id="sel-tudo" ${lista.length && lista.every(l=>E.selecao.has(l.id))?'checked':''} aria-label="Selecionar todos"></th>
        <th>Lead</th><th class="esconde-mob">Interesse</th><th class="esconde-mob">Localidade</th><th>Estágio</th>
        <th class="esconde-mob">Responsável</th><th class="esconde-mob">Valor</th><th></th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>` : `<div class="vazio"><b>Nenhum lead com esses filtros</b>${perm('criar') ? 'Ajuste a busca ou cadastre um lead novo.' : (leadsVisiveis().length ? 'Ajuste a busca ou os filtros.' : 'Quando a administração atribuir leads a você, eles aparecem aqui.')}</div>`}
  </div>`;
}

function ligarLeads(){
  const rede = (id, campo) => {
    const el = $(id); if(!el) return;
    el.addEventListener('input', ()=>{ E.filtro[campo] = el.value; desenhar();
      const n = $(id); if(n && el.type==='search'){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } });
  };
  rede('#f-busca','busca'); rede('#f-status','status'); rede('#f-origem','origem'); rede('#f-resp','responsavel'); rede('#f-local','localidade');

  $('#btn-limpar-sel')?.addEventListener('click', ()=>{ E.selecao.clear(); desenhar(); });
  $('#btn-zap-lote')?.addEventListener('click', ()=> modalZapLote());
  $('#btn-atribuir')?.addEventListener('click', ()=> modalAtribuir());
  $('#btn-localidade')?.addEventListener('click', ()=> modalLocalidadeLote());
  $('#btn-excluir-lote')?.addEventListener('click', excluirSelecionados);
  $('#btn-exportar')?.addEventListener('click', exportarCSV);
}

/* --- modal genérico --- */
function abrirModal(titulo, corpo, pe){
  $('#area-modal').innerHTML = `
    <div class="fundo-modal" data-fundo>
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <div class="modal-topo"><h2>${esc(titulo)}</h2><button class="fechar" data-fechar aria-label="Fechar">×</button></div>
        <div class="modal-corpo">${corpo}</div>
        ${pe ? `<div class="modal-pe">${pe}</div>` : ''}
      </div>
    </div>`;
  const fundo = $('[data-fundo]');
  fundo.addEventListener('click', e=>{ if(e.target===fundo) fecharModal(); });
  $('[data-fechar]').addEventListener('click', fecharModal);
  document.addEventListener('keydown', escFecha);
}
function escFecha(e){ if(e.key==='Escape') fecharModal(); }
function fecharModal(){ $('#area-modal').innerHTML=''; document.removeEventListener('keydown', escFecha); }
window.fecharModal = fecharModal;

/* --- ficha do lead --- */
function modalLead(id){
  const l = id ? E.leads.find(x=>x.id===id) : null;
  if(id && !l) return;
  if(!id && !perm('criar')) return;
  const estagios = E.config?.estagios || ESTAGIOS_PADRAO;
  const origens  = E.config?.origens  || ORIGENS_PADRAO;
  const podeEditar = !l || perm('editarQualquer') || l.responsavelId === E.eu.id;

  const corpo = `
    <form id="form-lead">
      <div class="duplas">
        <div class="campo"><label for="ld-nome">Nome</label><input id="ld-nome" required value="${esc(l?.nome||'')}"></div>
        <div class="campo"><label for="ld-tel">WhatsApp</label><input id="ld-tel" required placeholder="(11) 98888-7777" value="${esc(l?.telefoneOriginal || (l?.telefone?exibirTelefone(l.telefone):''))}"></div>
        <div class="campo"><label for="ld-email">E-mail</label><input id="ld-email" type="email" value="${esc(l?.email||'')}"></div>
        <div class="campo"><label for="ld-origem">Origem</label>
          <select id="ld-origem">${(l?.origem && !origens.includes(l.origem) ? [...origens, l.origem] : origens).map(o=>`<option ${l?.origem===o?'selected':''}>${esc(o)}</option>`).join('')}</select></div>
        <div class="campo"><label for="ld-local">Localidade</label>
          <select id="ld-local"><option value="">— não informada —</option>${(l?.localidade && !localidadesDisponiveis().some(x=>semAcento(x)===semAcento(l.localidade)) ? [...localidadesDisponiveis(), l.localidade] : localidadesDisponiveis()).map(x=>`<option ${semAcento(l?.localidade)===semAcento(x)?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="campo"><label for="ld-interesse">Interesse</label><input id="ld-interesse" placeholder="Apto 2 quartos, zona sul" value="${esc(l?.interesse||'')}"></div>
        <div class="campo"><label for="ld-valor">Valor estimado (R$)</label><input id="ld-valor" type="number" min="0" step="1000" value="${l?.valor||''}"></div>
        <div class="campo"><label for="ld-status">Estágio</label>
          <select id="ld-status">${estagios.map(s=>`<option ${ (l?.status||estagios[0])===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="campo"><label for="ld-retorno">Próximo retorno</label><input id="ld-retorno" type="date" value="${esc(l?.proximoContato||'')}"></div>
      </div>
      ${perm('atribuir') ? `<div class="campo"><label for="ld-resp">Responsável</label>
        <select id="ld-resp"><option value="">sem responsável</option>${E.usuarios.filter(u=>u.ativo!==false).map(u=>`<option value="${u.id}" ${(l?.responsavelId||E.eu.id)===u.id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></div>` : ''}
      <div class="campo"><label for="ld-obs">Observações</label><textarea id="ld-obs" placeholder="O que foi conversado, preferências, restrições…">${esc(l?.obs||'')}</textarea></div>
    </form>
    ${l ? blocoVisitasDoLead(l) : ''}
    ${l ? `<div style="margin-top:6px">
      <div class="rotulo-min">Histórico</div>
      ${(l.historico||[]).length ? `<ul class="hist">${l.historico.slice().reverse().map(h=>`
        <li>${esc(h.texto)}<time>${dataHora(h.em)} · ${esc(h.por||'')}</time></li>`).join('')}</ul>`
        : '<p class="sub">Nada registrado ainda. Cada envio de WhatsApp e mudança de estágio entra aqui.</p>'}
    </div>` : ''}`;

  const pe = `
    ${l ? `<button class="btn btn-zap" onclick="modalZap('${l.id}')">WhatsApp</button>` : ''}
    ${l && podeEditar ? `<button class="btn" onclick="modalVisita(null,'${l.id}')">Agendar visita</button>` : ''}
    ${l && perm('excluir') ? `<button class="btn btn-perigo" onclick="excluirLead('${l.id}')">Excluir</button>` : ''}
    <span style="flex:1"></span>
    <button class="btn" onclick="fecharModal()">Cancelar</button>
    ${podeEditar ? `<button class="btn btn-primario" id="btn-salvar-lead">${l?'Salvar alterações':'Cadastrar lead'}</button>` : ''}`;

  abrirModal(l ? l.nome : 'Novo lead', corpo, pe);
  if(!podeEditar) $('#form-lead').querySelectorAll('input,select,textarea').forEach(i=>i.disabled=true);
  $('#btn-salvar-lead')?.addEventListener('click', ()=>salvarLead(l));
}
window.modalLead = modalLead;

async function salvarLead(antigo){
  const form = $('#form-lead');
  if(!form.reportValidity()) return;
  const btn = $('#btn-salvar-lead'); btn.disabled = true; btn.textContent = 'Salvando…';
  const telBruto = $('#ld-tel').value;
  const tel = normalizarTelefone(telBruto);
  if(!tel){
    torrada('Telefone precisa do DDD. Ex.: (11) 98888-7777');
    btn.disabled = false; btn.textContent = antigo?'Salvar alterações':'Cadastrar lead'; return;
  }
  const dados = {
    nome: $('#ld-nome').value.trim(),
    telefone: tel, telefoneOriginal: telBruto.trim(),
    email: $('#ld-email').value.trim(),
    origem: $('#ld-origem').value,
    interesse: $('#ld-interesse').value.trim(),
    localidade: $('#ld-local').value,
    valor: Number($('#ld-valor').value)||0,
    status: $('#ld-status').value,
    proximoContato: $('#ld-retorno').value || '',
    obs: $('#ld-obs').value.trim(),
    responsavelId: $('#ld-resp') ? $('#ld-resp').value : (antigo?.responsavelId || E.eu.id),
    atualizadoEm: agora()
  };
  try{
    if(antigo){
      const hist = (antigo.historico||[]).slice();
      if(antigo.status !== dados.status)
        hist.push({ em:agora(), por:E.eu.nome, tipo:'estagio', texto:`Estágio: ${antigo.status} → ${dados.status}` });
      const novo = { ...antigo, ...dados, historico: hist.slice(-60), criadoEm: antigo.criadoEm };
      delete novo.id;
      await refLeads().doc(antigo.id).set(novo);
      torrada('Lead atualizado.');
    }else{
      const dup = E.leads.find(x=>x.telefone === tel);
      await refLeads().add({ ...dados, criadoEm: agora(),
        historico:[{ em:agora(), por:E.eu.nome, tipo:'criado', texto:'Lead cadastrado' }] });
      torrada(dup ? 'Cadastrado — atenção, já existia um lead com esse telefone.' : 'Lead cadastrado.');
    }
    fecharModal();
  }catch(err){
    torrada(erroAmigavel(err));
    btn.disabled = false; btn.textContent = antigo?'Salvar alterações':'Cadastrar lead';
  }
}

function erroAmigavel(err){
  const c = err?.code;
  const mapa = {
    ja_existe: 'Já existe uma pessoa com esse e-mail.',
    responsavel_invalido: 'O responsável escolhido não existe mais — atualize a página.',
    nao_existe: 'Esse registro não existe mais — outra pessoa deve ter excluído. Atualize a página.',
    sem_permissao: 'Sua conta não tem permissão para isso.',
    nao_autenticado: 'Sua sessão expirou. Entre de novo.',
    senha_curta: 'A senha precisa ter pelo menos 8 caracteres.',
    email_invalido: 'Esse e-mail não parece válido.',
    nome_invalido: 'Informe o nome.',
    lead_invalido: 'Todo lead precisa de nome e telefone.',
    auto_rebaixamento: 'Você não pode tirar o próprio acesso de administração.',
    auto_remocao: 'Você não pode remover o próprio acesso.',
    sem_conexao: 'Não conectou ao banco agora. Tente de novo em instantes.',
    id_obrigatorio: 'Faltou um identificador nessa operação — atualize a página e tente de novo.',
    colecao_invalida: 'Pedido inválido — atualize a página.',
    corpo_invalido: 'Pedido inválido — atualize a página.',
    ja_trocado: 'Volte para a administração antes de trocar de novo.',
    alvo_invalido: 'Você já está na sua própria conta.',
    nao_encontrado: 'Essa conta não existe mais ou foi desativada.',
    sem_troca: 'Você não está vendo a central como outra pessoa.',
    lote_vazio: 'Nenhum lead selecionado.',
    lote_grande: 'Selecione no máximo 1000 leads por vez.',
    lote_sem_mudanca: 'Não há nada para alterar.',
    esquema_localidade: 'Não consegui criar o campo de localidade no banco. Importe o arquivo migracao_localidade.sql no phpMyAdmin.',
    esquema_distribuicao: 'Não consegui criar as tabelas da distribuição no banco. Importe o arquivo migracao_distribuicao.sql no phpMyAdmin.'
  };
  if(c && mapa[c]) return mapa[c];
  if(err?.message) return err.message;
  return 'Não foi possível salvar agora.';
}

window.excluirLead = async function(id){
  if(!perm('excluir')) return;
  if(!confirm('Excluir este lead e todo o histórico dele?')) return;
  try{ await refLeads().doc(id).delete(); fecharModal(); torrada('Lead excluído.'); }
  catch(err){ torrada(erroAmigavel(err)); }
};

async function excluirSelecionados(){
  if(!E.selecao.size) return;
  if(!confirm(`Excluir ${E.selecao.size} leads? Não dá para desfazer.`)) return;
  const ids = [...E.selecao];
  for(const id of ids){ try{ await refLeads().doc(id).delete(); }catch(e){} }
  E.selecao.clear(); torrada('Leads excluídos.'); desenhar();
}

/* --- WhatsApp --- */
function modalZap(id, visitaId){
  const l = E.leads.find(x=>x.id===id); if(!l) return;
  const visita = visitaId ? E.visitas.find(x=>x.id===visitaId) : null;
  const modelos = E.config?.modelos || MODELOS_PADRAO;
  // vindo de uma visita, já abre no modelo de confirmação (o primeiro cujo nome fala em "visita")
  const idx0 = visita ? Math.max(0, modelos.findIndex(m=>/visita/i.test(m.nome))) : 0;
  const inicial = montarMensagem(modelos[idx0]?.texto||'', l, visita);
  abrirModal('Mensagem para ' + l.nome, `
    <div class="campo"><label for="z-modelo">Modelo</label>
      <select id="z-modelo">${modelos.map((m,i)=>`<option value="${i}"${i===idx0?' selected':''}>${esc(m.nome)}</option>`).join('')}<option value="-1">Escrever do zero</option></select></div>
    <div class="campo"><label for="z-texto">Mensagem</label><textarea id="z-texto">${esc(inicial)}</textarea></div>
    <p class="sub">Vai para ${esc(exibirTelefone(l.telefone))} pelo WhatsApp Web ou pelo app, já com o texto preenchido. É só apertar enviar lá.</p>
  `, `
    <button class="btn" id="z-copiar">Copiar texto</button>
    <span style="flex:1"></span>
    <button class="btn" onclick="fecharModal()">Cancelar</button>
    <button class="btn btn-zap" id="z-enviar">Abrir no WhatsApp</button>
  `);
  $('#z-modelo').addEventListener('change', e=>{
    const i = Number(e.target.value);
    if(i>=0) $('#z-texto').value = montarMensagem(modelos[i].texto, l, visita);
  });
  $('#z-copiar').addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText($('#z-texto').value); torrada('Texto copiado.'); }
    catch(e){ torrada('Seu navegador bloqueou a cópia.'); }
  });
  $('#z-enviar').addEventListener('click', async ()=>{
    const texto = $('#z-texto').value;
    if(abrirZap(l, texto)) { await registrarEnvio(l, texto); fecharModal(); }
  });
}
window.modalZap = modalZap;

async function registrarEnvio(l, texto){
  const estagios = E.config?.estagios || ESTAGIOS_PADRAO;
  const hist = (l.historico||[]).slice();
  hist.push({ em:agora(), por:E.eu.nome, tipo:'whatsapp', texto:'WhatsApp enviado: ' + texto.slice(0,120) });
  const novo = { ...l, historico: hist.slice(-60), ultimoContato: agora(), atualizadoEm: agora() };
  if(novo.status === estagios[0]) novo.status = estagios[1] || estagios[0];
  delete novo.id;
  try{ await refLeads().doc(l.id).set(novo); }catch(e){}
}

function modalZapLote(){
  const ids = [...E.selecao];
  const alvos = E.leads.filter(l=>ids.includes(l.id) && l.telefone);
  const modelos = E.config?.modelos || MODELOS_PADRAO;
  abrirModal(`Disparo para ${alvos.length} leads`, `
    <div class="campo"><label for="zl-modelo">Modelo</label>
      <select id="zl-modelo">${modelos.map((m,i)=>`<option value="${i}">${esc(m.nome)}</option>`).join('')}</select></div>
    <div class="campo"><label for="zl-texto">Texto base</label><textarea id="zl-texto">${esc(modelos[0]?.texto||'')}</textarea></div>
    <p class="sub">O WhatsApp abre um lead por vez, com o nome de cada um já trocado no texto. Você envia e volta aqui para o próximo.</p>
    <div id="zl-fila"></div>
  `, `<button class="btn" onclick="fecharModal()">Fechar</button>
      <button class="btn btn-zap" id="zl-comecar">Começar pelo primeiro</button>`);
  $('#zl-modelo').addEventListener('change', e=>{ $('#zl-texto').value = modelos[Number(e.target.value)].texto; });
  let i = 0;
  const passo = async ()=>{
    if(i >= alvos.length){ torrada('Fila concluída.'); fecharModal(); E.selecao.clear(); desenhar(); return; }
    const l = alvos[i];
    const texto = montarMensagem($('#zl-texto').value, l);
    if(abrirZap(l, texto)) await registrarEnvio(l, texto);
    i++;
    $('#zl-fila').innerHTML = `<div class="progresso"><i style="width:${Math.round(i/alvos.length*100)}%"></i></div>
      <p class="sub" style="margin-top:8px">${i} de ${alvos.length} abertos.</p>`;
    $('#zl-comecar').textContent = i < alvos.length ? `Próximo: ${alvos[i].nome}` : 'Concluir';
  };
  $('#zl-comecar').addEventListener('click', passo);
}

/** Texto do aviso depois de uma ação em lote: quantos mudaram, quantos já estavam assim, quantos não foram achados. */
function resumoLote(r, verboUm, verboVarios){
  const n = Number(r?.alterados)||0, ja = Number(r?.jaEstavam)||0, ig = Number(r?.ignorados)||0;
  let t = n === 0 ? 'Nenhum lead mudou.' : (n === 1 ? `1 lead ${verboUm}.` : `${n} leads ${verboVarios}.`);
  if(ja) t += ` ${ja} já ${ja===1?'estava':'estavam'} assim.`;
  if(ig) t += ` ${ig} não ${ig===1?'foi encontrado':'foram encontrados'} — atualize a página.`;
  return t;
}

function modalAtribuir(){
  if(!E.selecao.size) return;
  const ativos = E.usuarios.filter(u=>u.ativo!==false);
  abrirModal('Atribuir responsável', `
    <p class="sub" style="margin-bottom:12px">${E.selecao.size} ${E.selecao.size===1?'lead selecionado':'leads selecionados'}.</p>
    <div class="campo"><label for="at-user">Passar para</label>
      <select id="at-user"><option value="" disabled selected>Escolha o responsável…</option>${ativos.map(u=>`<option value="${u.id}">${esc(u.nome)}${u.papel==='admin'?' (administração)':''}</option>`).join('')}</select></div>
  `, `<button class="btn" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primario" id="at-ok">Atribuir</button>`);
  $('#at-ok').addEventListener('click', async ()=>{
    const uid = $('#at-user').value;
    if(!uid){ torrada('Escolha para quem atribuir.'); return; }
    const btn = $('#at-ok'); btn.disabled = true; btn.textContent = 'Atribuindo…';
    try{
      // uma chamada só, em transação no servidor; se falhar, o erro aparece aqui (antes era engolido)
      const r = await E.db.lote('leads', { ids:[...E.selecao], responsavelId: uid });
      E.selecao.clear(); fecharModal(); desenhar();
      torrada(resumoLote(r, 'atribuído a ' + nomeUsuario(uid), 'atribuídos a ' + nomeUsuario(uid)));
    }catch(err){
      torrada(erroAmigavel(err));
      btn.disabled = false; btn.textContent = 'Atribuir';
    }
  });
}

function modalLocalidadeLote(){
  if(!E.selecao.size) return;
  abrirModal('Definir localidade', `
    <p class="sub" style="margin-bottom:12px">${E.selecao.size} ${E.selecao.size===1?'lead selecionado':'leads selecionados'}.</p>
    <div class="campo"><label for="lc-local">Localidade</label>
      <select id="lc-local"><option value="" disabled selected>Escolha…</option>${localidadesConhecidas().map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="__limpar__">— remover a localidade —</option></select>
      ${perm('config') ? '<p class="sub" style="margin-top:5px">Precisa de outra? Cadastre em Ajustes.</p>' : ''}</div>
  `, `<button class="btn" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primario" id="lc-ok">Aplicar</button>`);
  $('#lc-ok').addEventListener('click', async ()=>{
    const v = $('#lc-local').value;
    if(!v){ torrada('Escolha a localidade.'); return; }
    const limpar = v === '__limpar__';
    const btn = $('#lc-ok'); btn.disabled = true; btn.textContent = 'Aplicando…';
    try{
      const r = await E.db.lote('leads', { ids:[...E.selecao], localidade: limpar ? '' : v });
      E.selecao.clear(); fecharModal(); desenhar();
      torrada(resumoLote(r, limpar ? 'ficou sem localidade' : 'ficou em ' + v, limpar ? 'ficaram sem localidade' : 'ficaram em ' + v));
    }catch(err){
      torrada(erroAmigavel(err));
      btn.disabled = false; btn.textContent = 'Aplicar';
    }
  });
}

/* --- exportar --- */
async function exportarCSV(){
  const ls = leadsFiltrados();
  const cab = ['Nome','Telefone','E-mail','Origem','Interesse','Localidade','Valor','Estágio','Responsável','Próximo retorno','Criado em','Observações'];
  const linhas = ls.map(l=>[
    l.nome, exibirTelefone(l.telefone), l.email, l.origem, l.interesse, l.localidade, l.valor||0,
    l.status, nomeUsuario(l.responsavelId), l.proximoContato, dataCurta(l.criadoEm), (l.obs||'').replace(/\n/g,' ')
  ]);
  const csv = [cab, ...linhas].map(r => r.map(c => {
    const s = String(c??''); return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(';')).join('\r\n');
  const nome = 'leads-' + new Date().toISOString().slice(0,10) + '.csv';
  try{
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    torrada('Arquivo gerado.');
    return;
  }catch(e){ /* cai para o modal abaixo */ }
  abrirModal('Exportar leads', `<p class="sub" style="margin-bottom:10px">Copie o conteúdo e cole num arquivo .csv.</p>
    <textarea style="width:100%;min-height:220px;font-family:ui-monospace,monospace;font-size:.76rem" readonly>${esc(csv)}</textarea>`,
    `<button class="btn" onclick="fecharModal()">Fechar</button>`);
}

/* ------------------------- visitas ------------------------- */

/* Dia e horário da visita são "hora de parede" (sem fuso): o que a pessoa escolhe é o que fica salvo.
   Por isso as datas aqui usam sempre o relógio local, nunca toISOString() (que é UTC). */
function pad2(n){ return String(n).padStart(2,'0'); }
function dataLocal(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function hojeLocal(){ return dataLocal(new Date()); }
function agoraLocal(){ const d = new Date(); return `${dataLocal(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function dataDoDia(dia){ const [a,m,d] = dia.split('-').map(Number); return new Date(a, m-1, d); }
function somarDias(dia, n){ const [a,m,d] = dia.split('-').map(Number); return dataLocal(new Date(a, m-1, d+n)); }
function dataBR(dia){ const [a,m,d] = dia.split('-'); return `${d}/${m}/${a}`; }
function semanaDoDia(dia, formato){ return dataDoDia(dia).toLocaleDateString('pt-BR', { weekday: formato }); }
function diaExtenso(dia){
  const hoje = hojeLocal();
  const [a,m,d] = dia.split('-');
  const curto = `${semanaDoDia(dia,'long')}, ${d}/${m}${a !== hoje.slice(0,4) ? '/'+a : ''}`;
  if(dia === hoje) return `Hoje · ${curto}`;
  if(dia === somarDias(hoje,1)) return `Amanhã · ${curto}`;
  if(dia === somarDias(hoje,-1)) return `Ontem · ${curto}`;
  return curto.charAt(0).toUpperCase() + curto.slice(1);
}
function diaCurto(dia){
  const hoje = hojeLocal();
  if(dia === hoje) return 'Hoje';
  if(dia === somarDias(hoje,1)) return 'Amanhã';
  const [, m, d] = dia.split('-');
  return `${semanaDoDia(dia,'short').replace('.','')}, ${d}/${m}`;
}
const diaDaVisita  = v => String(v.dataHora||'').slice(0,10);
const horaDaVisita = v => String(v.dataHora||'').slice(11,16);

function nomeLead(id){
  const l = E.leads.find(x=>x.id===id);
  return l ? l.nome : (E.leads.length ? 'Lead não encontrado' : '…');
}
function proximaVisita(leadId){
  const ag = agoraLocal();
  return E.visitas
    .filter(v=>v.leadId===leadId && v.status==='agendada' && v.dataHora >= ag)
    .sort((a,b)=>a.dataHora.localeCompare(b.dataHora))[0] || null;
}
/** Variáveis {{empreendimento}}, {{data_visita}} e {{hora_visita}} para os modelos de mensagem. */
function extrasDaVisita(v){
  if(!v) return {};
  const dia = diaDaVisita(v);
  const cad = (E.config?.empreendimentos || []).find(e => e && e.nome === v.empreendimento);
  return { empreendimento: v.empreendimento, link_empreendimento: linkSeguro(cad?.link), data_visita: `${dia.slice(8)}/${dia.slice(5,7)} (${semanaDoDia(dia,'long')})`, hora_visita: horaDaVisita(v) };
}
/** Agendada que já passou do horário há mais de 1h30 e ninguém marcou como realizada / não compareceu. */
function semDesfecho(v){
  return v.status === 'agendada' && new Date(v.dataHora).getTime() + 90*60000 < Date.now();
}
function etiquetaVisita(v){
  if(semDesfecho(v)) return '<span class="etiqueta st-atrasada" title="Já passou do horário: marque como realizada ou não compareceu">Atualizar situação</span>';
  return `<span class="etiqueta st-${esc(v.status)}">${esc(STATUS_VISITA[v.status] || v.status)}</span>`;
}
/** Nomes da lista cadastrada em Empreendimentos (a lista guarda nome + endereço). */
function nomesEmpreendimentos(){
  return (E.config?.empreendimentos || []).map(e => typeof e === 'string' ? e : e.nome).filter(Boolean);
}
function empreendimentosConhecidos(){
  const lista = nomesEmpreendimentos();
  E.visitas.forEach(v=>{ if(v.empreendimento && !lista.includes(v.empreendimento)) lista.push(v.empreendimento); });
  return lista;
}

/** Só descobre se a tabela de visitas existe — a lista em si chega pela assinatura em assinar(). */
function verificarVisitas(){
  refVisitas().get()
    .then(()=>{ E.visitasErro = null; })
    .catch(err=>{ E.visitasErro = err?.code || 'erro'; if(E.vista === 'visitas') desenhar(); });
}

function visitasFiltradas(){
  const f = E.filtroVisitas, hoje = hojeLocal(), fim = somarDias(hoje, 6);
  const ls = E.visitas.filter(v=>{
    const d = diaDaVisita(v);
    if(f.periodo === 'hoje' && d !== hoje) return false;
    if(f.periodo === 'proximas' && d < hoje) return false;
    if(f.periodo === 'semana' && (d < hoje || d > fim)) return false;
    if(f.periodo === 'passadas' && d >= hoje) return false;
    if(f.status && v.status !== f.status) return false;
    if(f.empreendimento && v.empreendimento !== f.empreendimento) return false;
    if(f.responsavel){
      const l = E.leads.find(x=>x.id===v.leadId);
      if((l?.responsavelId || '') !== f.responsavel) return false;
    }
    return true;
  });
  const decrescente = f.periodo === 'passadas' || f.periodo === 'todas';
  return ls.sort((a,b)=> decrescente ? b.dataHora.localeCompare(a.dataHora) : a.dataHora.localeCompare(b.dataHora));
}

function linhaVisita(v){
  const l = E.leads.find(x=>x.id===v.leadId);
  const admin = perm('verTodos');
  const detalhes = [v.empreendimento];
  if(admin && l) detalhes.push(nomeUsuario(l.responsavelId));
  if(l) detalhes.push(exibirTelefone(l.telefone));
  return `
  <li class="${v.status==='cancelada' ? 'visita-cancelada' : ''}">
    <div class="visita-info">
      <div class="visita-hora num">${esc(horaDaVisita(v))}</div>
      <div class="visita-txt">
        <b class="nome-lead" data-abrir="${esc(v.leadId)}">${esc(nomeLead(v.leadId))}</b>
        <div class="linha2">${detalhes.map(esc).join(' · ')}</div>
        ${v.obs ? `<div class="linha2 visita-obs">${esc(v.obs)}</div>` : ''}
      </div>
    </div>
    <div class="acoes-linha visita-acoes">
      ${etiquetaVisita(v)}
      ${v.status==='agendada' && l?.telefone ? `<button class="btn btn-zap btn-min" data-visita-zap="${esc(v.id)}">Confirmar</button>` : ''}
      <button class="btn btn-min" data-visita="${esc(v.id)}">Editar</button>
    </div>
  </li>`;
}

function telaVisitas(){
  const f = E.filtroVisitas, admin = perm('verTodos');
  const hoje = hojeLocal(), fim = somarDias(hoje, 6);
  const agendadas = E.visitas.filter(v=>v.status==='agendada');
  const kHoje = agendadas.filter(v=>diaDaVisita(v)===hoje).length;
  const kSemana = agendadas.filter(v=>diaDaVisita(v)>=hoje && diaDaVisita(v)<=fim).length;
  const kPendentes = E.visitas.filter(semDesfecho).length;
  const kMes = E.visitas.filter(v=>v.status==='realizada' && diaDaVisita(v).slice(0,7)===hoje.slice(0,7)).length;

  const lista = visitasFiltradas();
  const grupos = new Map();
  lista.forEach(v=>{ const d = diaDaVisita(v); if(!grupos.has(d)) grupos.set(d, []); grupos.get(d).push(v); });

  let corpo;
  if(E.visitasErro){
    corpo = E.visitasErro === 'tabela_ausente'
      ? `<div class="painel destaque"><h3>Falta uma etapa no banco de dados</h3>
          <p class="sub">A tabela de visitas ainda não existe. Importe o arquivo <b>migracao_visitas.sql</b> no phpMyAdmin (o mesmo lugar onde você importou o database.sql) e recarregue esta página.</p></div>`
      : `<div class="painel destaque"><h3>Não consegui carregar as visitas agora</h3>
          <p class="sub">Confira a conexão e recarregue a página. Se continuar, veja se a pasta api foi enviada por inteiro.</p></div>`;
  } else if(grupos.size){
    corpo = [...grupos].map(([dia, vs])=>`
      <div class="painel" style="margin-bottom:14px">
        <h3>${esc(diaExtenso(dia))} <span class="sub">· ${vs.length} ${vs.length===1 ? 'visita' : 'visitas'}</span></h3>
        <ul class="lista-simples lista-visitas">${vs.map(linhaVisita).join('')}</ul>
      </div>`).join('');
  } else {
    corpo = `<div class="painel"><div class="vazio"><b>Nenhuma visita por aqui</b>${E.visitas.length
      ? 'Nada com esses filtros. Troque o período ou a situação para ver outras.'
      : 'Agende a primeira no botão acima, ou pela ficha de um lead.'}</div></div>`;
  }

  const opt = (valor, rotulo, atual) => `<option value="${esc(valor)}" ${atual===valor?'selected':''}>${esc(rotulo)}</option>`;
  return `
  <div class="cabecalho">
    <div><h1>Visitas</h1><p class="sub">${admin ? 'Agenda de toda a equipe' : 'Suas visitas agendadas'}</p></div>
    <button class="btn btn-primario" onclick="modalVisita()">Agendar visita</button>
  </div>

  <div class="grade-kpi">
    <div class="kpi"><div class="v num">${kHoje}</div><div class="l">visitas hoje</div></div>
    <div class="kpi"><div class="v num">${kSemana}</div><div class="l">nos próximos 7 dias</div></div>
    <div class="kpi"><div class="v num">${kPendentes}</div><div class="l">aguardando desfecho</div></div>
    <div class="kpi"><div class="v num">${kMes}</div><div class="l">realizadas neste mês</div></div>
  </div>

  <div class="filtros">
    <select id="fv-periodo" aria-label="Período">
      ${opt('proximas','A partir de hoje',f.periodo)}${opt('hoje','Só hoje',f.periodo)}${opt('semana','Próximos 7 dias',f.periodo)}${opt('passadas','Já passaram',f.periodo)}${opt('todas','Todas',f.periodo)}
    </select>
    <select id="fv-status" aria-label="Situação">
      ${opt('','Todas as situações',f.status)}${Object.entries(STATUS_VISITA).map(([k,r])=>opt(k,r,f.status)).join('')}
    </select>
    <select id="fv-emp" aria-label="Empreendimento">
      ${opt('','Todos os empreendimentos',f.empreendimento)}${empreendimentosConhecidos().map(e=>opt(e,e,f.empreendimento)).join('')}
    </select>
    ${admin ? `<select id="fv-resp" aria-label="Corretor">${opt('','Todos os corretores',f.responsavel)}${E.usuarios.map(u=>opt(u.id,u.nome,f.responsavel)).join('')}</select>` : ''}
  </div>

  ${corpo}`;
}

function ligarVisitas(){
  [['#fv-periodo','periodo'],['#fv-status','status'],['#fv-emp','empreendimento'],['#fv-resp','responsavel']].forEach(([id, campo])=>{
    const el = $(id);
    if(el) el.addEventListener('change', ()=>{ E.filtroVisitas[campo] = el.value; desenhar(); });
  });
}

/** Cartão do painel: as próximas visitas agendadas (hoje em diante). */
function cartaoProximasVisitas(){
  const hoje = hojeLocal();
  const prox = E.visitas.filter(v=>v.status==='agendada' && diaDaVisita(v) >= hoje)
    .sort((a,b)=>a.dataHora.localeCompare(b.dataHora)).slice(0,5);
  return `
  <div class="painel" style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h2>Próximas visitas</h2>
      <button class="btn btn-min" data-ir="visitas">Ver todas</button>
    </div>
    ${prox.length ? `<ul class="lista-simples">${prox.map(v=>`
      <li>
        <div><b class="nome-lead" onclick="modalLead('${v.leadId}')">${esc(nomeLead(v.leadId))}</b>
          <div class="linha2">${esc(diaCurto(diaDaVisita(v)))} às ${esc(horaDaVisita(v))} · ${esc(v.empreendimento)}</div></div>
        <button class="btn btn-zap btn-min" onclick="modalZap('${v.leadId}','${v.id}')">Confirmar</button>
      </li>`).join('')}</ul>`
      : `<p class="sub" style="margin-top:6px">Nenhuma visita agendada. Agende em Visitas ou pela ficha de um lead.</p>`}
  </div>`;
}

/** Bloco "Visitas" dentro da ficha do lead. */
function blocoVisitasDoLead(l){
  const vs = E.visitas.filter(v=>v.leadId===l.id).sort((a,b)=>b.dataHora.localeCompare(a.dataHora));
  return `
  <div style="margin:6px 0 14px">
    <div class="rotulo-min">Visitas</div>
    ${vs.length ? `<ul class="lista-simples">${vs.map(v=>`
      <li>
        <div><b class="num">${esc(dataBR(diaDaVisita(v)))}</b> às <b class="num">${esc(horaDaVisita(v))}</b>
          <div class="linha2">${esc(v.empreendimento)}</div></div>
        <div class="acoes-linha">${etiquetaVisita(v)}<button class="btn btn-min" onclick="modalVisita('${v.id}')">Editar</button></div>
      </li>`).join('')}</ul>`
      : '<p class="sub">Nenhuma visita agendada para este lead.</p>'}
  </div>`;
}

/** Aviso se a mesma pessoa já tem outra visita agendada a menos de 1 h desse horário. */
function choqueDeHorario(leadId, dataHora, ignorarId){
  const lead = E.leads.find(x=>x.id===leadId);
  if(!lead || !lead.responsavelId) return '';
  const t = new Date(dataHora).getTime();
  const outra = E.visitas.find(v=>{
    if(v.id === ignorarId || v.status !== 'agendada') return false;
    const l = E.leads.find(x=>x.id===v.leadId);
    if(!l || l.responsavelId !== lead.responsavelId) return false;
    return Math.abs(new Date(v.dataHora).getTime() - t) < 60*60000;
  });
  return outra
    ? `${nomeUsuario(lead.responsavelId)} já tem uma visita perto desse horário: ${nomeLead(outra.leadId)}, ${dataBR(diaDaVisita(outra))} às ${horaDaVisita(outra)}.\n\nAgendar mesmo assim?`
    : '';
}

/** Agendar (sem id) ou editar (com id). leadIdPre fixa o lead quando vem da ficha dele. */
function modalVisita(id, leadIdPre){
  const v = id ? E.visitas.find(x=>x.id===id) : null;
  if(id && !v) return;
  const leadId = v ? v.leadId : (leadIdPre || '');
  const lead = leadId ? E.leads.find(x=>x.id===leadId) : null;
  if(leadId && !lead){ torrada('Esse lead não está mais disponível. Atualize a página.'); return; }

  const atual = v?.empreendimento || '';
  const emps = nomesEmpreendimentos();
  if(atual && !emps.includes(atual)) emps.push(atual);   // visita antiga cujo empreendimento saiu da lista
  const campoEmp = emps.length
    ? `<select id="vs-emp" required><option value="">Escolha…</option>${emps.map(e=>`<option ${e===atual?'selected':''}>${esc(e)}</option>`).join('')}</select>`
    : `<input id="vs-emp" required maxlength="160" placeholder="Nome do empreendimento" value="${esc(atual)}">
       <p class="sub" style="margin-top:5px">${perm('config') ? 'Dica: cadastre em Empreendimentos e ela vira uma lista de escolha aqui.' : 'A administração pode cadastrar os empreendimentos em Empreendimentos.'}</p>`;

  const ordenados = leadsVisiveis().slice().sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
  const campoLead = lead
    ? `<div class="campo"><label>Lead</label><div class="lead-fixo"><b>${esc(lead.nome)}</b><span class="linha2">${esc(exibirTelefone(lead.telefone))}${lead.interesse ? ' · '+esc(lead.interesse) : ''}</span></div></div>`
    : `<div class="campo"><label for="vs-busca">Lead</label>
         <input id="vs-busca" type="search" placeholder="Buscar por nome ou telefone…" autocomplete="off" style="margin-bottom:6px">
         <select id="vs-lead" required></select></div>`;

  const corpo = `
    <form id="form-visita" onsubmit="return false">
      ${campoLead}
      <div class="campo"><label for="vs-emp">Empreendimento</label>${campoEmp}</div>
      <div class="duplas">
        <div class="campo"><label for="vs-data">Dia</label><input id="vs-data" type="date" required ${v ? '' : `min="${hojeLocal()}"`} value="${esc(v ? diaDaVisita(v) : '')}"></div>
        <div class="campo"><label for="vs-hora">Horário</label><input id="vs-hora" type="time" required value="${esc(v ? horaDaVisita(v) : '')}"></div>
      </div>
      ${v ? `<div class="campo"><label for="vs-status">Situação</label>
        <select id="vs-status">${Object.entries(STATUS_VISITA).map(([k,r])=>`<option value="${k}" ${v.status===k?'selected':''}>${esc(r)}</option>`).join('')}</select></div>` : ''}
      <div class="campo"><label for="vs-obs">Observações</label>
        <textarea id="vs-obs" placeholder="Ponto de encontro, quem vai junto, o que mostrar…">${esc(v?.obs || '')}</textarea></div>
    </form>`;

  const pe = `
    ${v && v.status==='agendada' && lead.telefone ? '<button class="btn btn-zap" id="vs-zap">Confirmar no WhatsApp</button>' : ''}
    ${v && perm('excluir') ? '<button class="btn btn-perigo" id="vs-excluir">Excluir</button>' : ''}
    <span style="flex:1"></span>
    <button class="btn" onclick="fecharModal()">Cancelar</button>
    <button class="btn btn-primario" id="btn-salvar-visita">${v ? 'Salvar alterações' : 'Agendar visita'}</button>`;

  abrirModal(v ? 'Editar visita' : 'Agendar visita', corpo, pe);

  if(!lead){
    const preencher = termo=>{
      const t = termo.trim().toLowerCase(), digitos = t.replace(/\D/g,'');
      const achados = ordenados.filter(l=> !t || String(l.nome).toLowerCase().includes(t) || (digitos && String(l.telefone).includes(digitos)));
      $('#vs-lead').innerHTML = achados.length
        ? achados.slice(0,300).map(l=>`<option value="${esc(l.id)}">${esc(l.nome)} — ${esc(exibirTelefone(l.telefone))}</option>`).join('')
        : '<option value="">Nenhum lead encontrado</option>';
    };
    preencher('');
    $('#vs-busca').addEventListener('input', e=>preencher(e.target.value));
    $('#vs-busca').focus();
  }
  $('#btn-salvar-visita').addEventListener('click', ()=>salvarVisita(v, lead ? lead.id : ''));
  $('#vs-zap')?.addEventListener('click', ()=>{ fecharModal(); modalZap(v.leadId, v.id); });
  $('#vs-excluir')?.addEventListener('click', ()=>excluirVisita(v.id));
}
window.modalVisita = modalVisita;

async function salvarVisita(antiga, leadIdFixo){
  if(!$('#form-visita').reportValidity()) return;
  const leadId = leadIdFixo || $('#vs-lead')?.value || '';
  const emp = $('#vs-emp').value.trim();
  const dia = $('#vs-data').value, hora = $('#vs-hora').value;
  const status = $('#vs-status') ? $('#vs-status').value : 'agendada';
  const obs = $('#vs-obs').value.trim();
  if(!leadId){ torrada('Escolha o lead da visita.'); return; }
  if(!emp){ torrada('Informe o empreendimento.'); return; }
  const dataHora = `${dia}T${hora}`;

  if(status === 'agendada'){
    if(!antiga && dataHora < agoraLocal() && !confirm('Esse horário já passou. Agendar mesmo assim?')) return;
    const choque = choqueDeHorario(leadId, dataHora, antiga?.id);
    if(choque && !confirm(choque)) return;
  }

  const btn = $('#btn-salvar-visita'), rotulo = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvando…';
  try{
    if(antiga){
      await refVisitas().doc(antiga.id).update({ empreendimento: emp, dataHora, status, obs });
      torrada('Visita atualizada.');
    }else{
      await refVisitas().add({ leadId, empreendimento: emp, dataHora, status: 'agendada', obs });
      torrada('Visita agendada.');
    }
    fecharModal();
  }catch(err){
    torrada(erroAmigavel(err));
    btn.disabled = false; btn.textContent = rotulo;
  }
}

async function excluirVisita(id){
  if(!perm('excluir')) return;
  if(!confirm('Excluir esta visita?')) return;
  try{ await refVisitas().doc(id).delete(); fecharModal(); torrada('Visita excluída.'); }
  catch(err){ torrada(erroAmigavel(err)); }
}

/* ------------------------- importar planilha ------------------------- */

const CAMPOS_IMPORT = [
  { k:'nome', r:'Nome', obrigatorio:true, pistas:['nome','cliente','lead','contato'] },
  { k:'telefone', r:'WhatsApp / telefone', obrigatorio:true, pistas:['telefone','whatsapp','celular','fone','tel','zap'] },
  { k:'email', r:'E-mail', pistas:['email','e-mail','mail'] },
  { k:'origem', r:'Origem', pistas:['origem','fonte','canal','midia'] },
  { k:'interesse', r:'Interesse', pistas:['interesse','produto','imovel','imóvel','empreendimento'] },
  { k:'localidade', r:'Localidade (Zona Norte, Zona Sul…)', pistas:['localidade','regiao','região','zona','bairro'] },
  { k:'valor', r:'Valor', pistas:['valor','preco','preço','ticket','orcamento'] },
  { k:'status', r:'Estágio', pistas:['status','estagio','estágio','etapa','fase'] },
  { k:'obs', r:'Observações', pistas:['obs','observa','anota','coment','descri'] }
];

function telaImportar(){
  const imp = E.importacao;
  if(!imp) return `
    <div class="cabecalho"><div><h1>Importar planilha</h1>
      <p class="sub">Traga seus leads de uma planilha CSV ou Excel. A primeira linha precisa ter os títulos das colunas.</p></div></div>
    <div class="solta" id="solta">
      <input type="file" id="arquivo" accept=".csv,.txt,.xlsx,.xls" class="oculto">
      <h3>Escolher arquivo</h3>
      <p class="sub">.csv, .xlsx ou .xls — até 500 linhas por importação</p>
    </div>

    <div class="painel" style="margin-top:16px">
      <h3>Como a planilha deve estar</h3>
      <p class="sub" style="margin-top:6px">A primeira linha tem os títulos das colunas (o nome que você quiser). A partir da segunda linha, cada linha vira um lead.</p>

      <div class="rotulo-min" style="margin-top:16px">Colunas que a planilha pode ter</div>
      <div style="overflow:auto"><table>
        <thead><tr><th>Coluna</th><th>Obrigatória?</th><th>Como preencher</th><th class="esconde-mob">Exemplo</th></tr></thead>
        <tbody>
          <tr><td><b>Nome</b></td><td>sim</td><td>o nome do lead</td><td class="esconde-mob">Maria Souza</td></tr>
          <tr><td><b>Telefone / WhatsApp</b></td><td>sim</td><td>com DDD — pode ter parênteses, espaço ou traço, o sistema limpa sozinho</td><td class="esconde-mob">(11) 98888-7777</td></tr>
          <tr><td>E-mail</td><td>não</td><td>fica em branco se a planilha não tiver</td><td class="esconde-mob">maria@email.com</td></tr>
          <tr><td>Origem</td><td>não</td><td>se a linha vier vazia, usa a "Origem padrão" que você define na próxima tela</td><td class="esconde-mob">Instagram</td></tr>
          <tr><td>Interesse</td><td>não</td><td>o que a pessoa procura</td><td class="esconde-mob">Apto 2 quartos, zona sul</td></tr>
          <tr><td>Localidade</td><td>não</td><td>região do lead. "zona norte", "Zona Norte" ou "ZONA NORTE" viram a mesma opção da lista de Ajustes</td><td class="esconde-mob">Zona Norte</td></tr>
          <tr><td>Valor</td><td>não</td><td>número, com ou sem "R$", ponto ou vírgula</td><td class="esconde-mob">350000 ou R$ 350.000,00</td></tr>
          <tr><td>Estágio</td><td>não</td><td>precisa ser <b>idêntico</b> a um dos estágios cadastrados em Ajustes — se não bater, o lead entra no primeiro estágio do funil</td><td class="esconde-mob">Novo</td></tr>
          <tr><td>Observações</td><td>não</td><td>qualquer anotação</td><td class="esconde-mob">Já visitou o showroom</td></tr>
        </tbody>
      </table></div>

      <div class="rotulo-min" style="margin-top:16px">A central tenta adivinhar as colunas sozinha</div>
      <p class="sub">Pelo nome do título, ela já reconhece variações comuns — por exemplo "Cliente" ou "Contato" viram Nome; "Celular" ou "Zap" viram Telefone; "Fonte" ou "Canal" viram Origem. Se ela errar alguma, dá pra corrigir manualmente na tela seguinte, antes de importar.</p>

      <div class="rotulo-min" style="margin-top:16px">O que acontece na hora de importar</div>
      <ul class="lista-simples">
        <li><span>Linha sem telefone válido (sem DDD, por exemplo)</span><b>é recusada</b></li>
        <li><div><span>Telefone que já existe na base</span><div class="linha2">dá pra desligar isso na tela seguinte</div></div><b>ignorado por padrão</b></li>
        <li><span>Linhas além da 500ª do arquivo</span><b>não entram</b></li>
      </ul>
      <p class="sub" style="margin-top:10px">Depois de escolher o arquivo, você ainda confere e ajusta tudo antes de confirmar — nada é gravado automaticamente.</p>
    </div>`;

  if(imp.etapa === 'mapear'){
    return `
    <div class="cabecalho"><div><h1>Conferir colunas</h1>
      <p class="sub">${imp.linhas.length} linhas encontradas em ${esc(imp.nomeArquivo)}</p></div>
      <button class="btn" id="btn-cancelar-imp">Trocar arquivo</button></div>
    <div class="painel">
      ${CAMPOS_IMPORT.map(c=>`
        <div class="mapa-col">
          <label for="mp-${c.k}">${c.r}${c.obrigatorio?' *':''}</label>
          <select id="mp-${c.k}" data-mapa="${c.k}">
            <option value="">— não importar —</option>
            ${imp.colunas.map((col,i)=>`<option value="${i}" ${imp.mapa[c.k]===i?'selected':''}>${esc(col)}</option>`).join('')}
          </select>
        </div>`).join('')}
      <div class="campo" style="margin-top:14px">
        <label for="mp-origem-fixa">Origem padrão para linhas sem origem</label>
        <input id="mp-origem-fixa" value="${esc(imp.origemFixa||'Planilha')}">
      </div>
      <div class="campo">
        <label for="mp-local-fixa">Localidade para linhas sem localidade</label>
        <select id="mp-local-fixa"><option value="">— nenhuma —</option>${localidadesDisponiveis().map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>
        <p class="sub" style="margin-top:5px">Se a planilha inteira é de uma região, escolha aqui e todos os leads já entram com ela.</p>
      </div>
      ${perm('atribuir')?`<div class="campo"><label for="mp-resp">Atribuir todos a</label>
        <select id="mp-resp"><option value="">Sem responsável (distribuir depois, em Distribuição)</option>${E.usuarios.filter(u=>u.ativo!==false).map(u=>`<option value="${u.id}" ${u.id===E.eu.id?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></div>`:''}
      <label style="display:flex;gap:8px;align-items:center;font-size:.88rem;margin:10px 0 16px">
        <input type="checkbox" id="mp-dedup" checked> Ignorar telefones que já estão na base
      </label>
      <button class="btn btn-primario" id="btn-importar">Importar ${imp.linhas.length} linhas</button>
    </div>
    <div class="painel" style="margin-top:16px">
      <h3>Prévia</h3>
      <div style="overflow:auto;margin-top:10px"><table>
        <thead><tr>${imp.colunas.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${imp.linhas.slice(0,5).map(l=>`<tr>${imp.colunas.map((_,i)=>`<td>${esc(l[i]||'')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  if(imp.etapa === 'rodando'){
    return `<div class="cabecalho"><div><h1>Importando…</h1><p class="sub">Não feche a página.</p></div></div>
      <div class="painel"><div class="progresso"><i style="width:${imp.pct}%"></i></div>
      <p class="sub num" style="margin-top:10px">${imp.feitos} de ${imp.total} gravados</p></div>`;
  }

  return `<div class="cabecalho"><div><h1>Importação concluída</h1></div></div>
    <div class="painel">
      <ul class="lista-simples">
        <li><span>Leads criados</span><b class="num">${imp.criados}</b></li>
        <li><span>Ignorados por telefone repetido</span><b class="num">${imp.repetidos}</b></li>
        <li><span>Recusados por telefone inválido</span><b class="num">${imp.invalidos}</b></li>
      </ul>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-primario" data-ir="leads">Ver os leads</button>
        <button class="btn" id="btn-nova-imp">Importar outra planilha</button>
      </div>
    </div>`;
}

function ligarImportar(){
  const solta = $('#solta');
  if(solta){
    const inp = $('#arquivo');
    solta.addEventListener('click', ()=>inp.click());
    inp.addEventListener('change', ()=>{ if(inp.files[0]) lerArquivo(inp.files[0]); });
    solta.addEventListener('dragover', e=>{ e.preventDefault(); });
    solta.addEventListener('drop', e=>{ e.preventDefault(); if(e.dataTransfer.files[0]) lerArquivo(e.dataTransfer.files[0]); });
  }
  $('#btn-cancelar-imp')?.addEventListener('click', ()=>{ E.importacao = null; desenhar(); });
  $('#btn-nova-imp')?.addEventListener('click', ()=>{ E.importacao = null; desenhar(); });
  $('#btn-importar')?.addEventListener('click', rodarImportacao);
}

function detectarSeparador(txt){
  const l = txt.split(/\r?\n/)[0] || '';
  const c = (l.match(/,/g)||[]).length, pv = (l.match(/;/g)||[]).length, tb = (l.match(/\t/g)||[]).length;
  return tb>c && tb>pv ? '\t' : (pv >= c ? ';' : ',');
}
function lerCSV(txt){
  const sep = detectarSeparador(txt);
  const linhas = []; let campo = '', linha = [], aspas = false;
  for(let i=0;i<txt.length;i++){
    const ch = txt[i];
    if(aspas){
      if(ch === '"'){ if(txt[i+1] === '"'){ campo += '"'; i++; } else aspas = false; }
      else campo += ch;
    }else{
      if(ch === '"') aspas = true;
      else if(ch === sep){ linha.push(campo); campo=''; }
      else if(ch === '\n'){ linha.push(campo); linhas.push(linha); linha=[]; campo=''; }
      else if(ch !== '\r') campo += ch;
    }
  }
  if(campo || linha.length){ linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(c => String(c).trim() !== ''));
}
function carregarSheetJS(){
  return new Promise((ok, falha)=>{
    if(window.XLSX) return ok(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ()=>ok(window.XLSX);
    s.onerror = ()=>falha(new Error('sem xlsx'));
    document.head.appendChild(s);
  });
}
async function lerArquivo(file){
  try{
    let matriz;
    if(/\.(xlsx|xls)$/i.test(file.name)){
      const XLSX = await carregarSheetJS();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      matriz = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''})
        .filter(l => l.some(c => String(c).trim() !== ''));
    }else{
      const txt = await file.text();
      matriz = lerCSV(txt);
    }
    if(matriz.length < 2){ torrada('A planilha precisa de títulos e pelo menos uma linha.'); return; }
    const colunas = matriz[0].map(c => String(c).trim());
    const linhas = matriz.slice(1, 501).map(l => colunas.map((_,i)=> String(l[i] ?? '').trim()));

    const mapa = {};
    CAMPOS_IMPORT.forEach(c=>{
      const i = colunas.findIndex(col=>{
        const n = col.toLowerCase();
        return c.pistas.some(p => n.includes(p));
      });
      mapa[c.k] = i >= 0 ? i : null;
    });
    E.importacao = { etapa:'mapear', nomeArquivo:file.name, colunas, linhas, mapa, origemFixa:'Planilha' };
    desenhar(); ligarImportar();
  }catch(err){
    torrada('Não consegui ler esse arquivo. Tente salvar como CSV.');
  }
}

async function rodarImportacao(){
  const imp = E.importacao;
  if(imp.mapa.nome === null || imp.mapa.telefone === null){
    torrada('Aponte pelo menos as colunas de nome e telefone.'); return;
  }
  const dedup = $('#mp-dedup').checked;
  const origemFixa = $('#mp-origem-fixa').value.trim() || 'Planilha';
  const localFixa = $('#mp-local-fixa') ? $('#mp-local-fixa').value : '';
  const resp = $('#mp-resp') ? $('#mp-resp').value : E.eu.id;
  const estagios = E.config?.estagios || ESTAGIOS_PADRAO;
  const jaTem = new Set(E.leads.map(l=>l.telefone));

  const pegar = (linha, k) => imp.mapa[k] === null ? '' : (linha[imp.mapa[k]] || '');

  const pendentes = [];
  let invalidos = 0, repetidos = 0;
  for(const linha of imp.linhas){
    const tel = normalizarTelefone(pegar(linha,'telefone'));
    if(!tel){ invalidos++; continue; }
    if(dedup && jaTem.has(tel)){ repetidos++; continue; }
    jaTem.add(tel);
    const statusBruto = pegar(linha,'status');
    pendentes.push({
      nome: pegar(linha,'nome') || 'Sem nome',
      telefone: tel, telefoneOriginal: pegar(linha,'telefone'),
      email: pegar(linha,'email'),
      origem: pegar(linha,'origem') || origemFixa,
      interesse: pegar(linha,'interesse'),
      localidade: acharLocalidade(pegar(linha,'localidade')) || localFixa,
      valor: Number(String(pegar(linha,'valor')).replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.')) || 0,
      status: estagios.includes(statusBruto) ? statusBruto : estagios[0],
      obs: pegar(linha,'obs'),
      responsavelId: resp,
      criadoEm: agora(), atualizadoEm: agora(),
      historico: [{ em:agora(), por:E.eu.nome, tipo:'importado', texto:'Importado de ' + imp.nomeArquivo }]
    });
  }

  E.importacao = { etapa:'rodando', pct:0, feitos:0, total:pendentes.length };
  desenhar();

  let criados = 0;
  for(let i=0;i<pendentes.length;i++){
    try{ await refLeads().add(pendentes[i]); criados++; }
    catch(err){
      if(err.code === 'quota_exceeded'){ torrada('Limite de registros atingido. Parei a importação.'); break; }
      if(err.code === 'resource_exhausted'){ await new Promise(r=>setTimeout(r,1200)); i--; continue; }
    }
    E.importacao.feitos = i+1;
    E.importacao.pct = Math.round((i+1)/pendentes.length*100);
    if(i % 5 === 0 || i === pendentes.length-1) desenhar();
    if(i % 10 === 9) await new Promise(r=>setTimeout(r,120));
  }
  E.importacao = { etapa:'fim', criados, repetidos, invalidos };
  desenhar(); ligarImportar();
}

/* ------------------------- modelos de mensagem ------------------------- */

function telaModelos(){
  const modelos = E.config?.modelos || MODELOS_PADRAO;
  const pode = perm('modelos');
  return `
  <div class="cabecalho">
    <div><h1>Mensagens</h1><p class="sub">Os textos que aparecem na hora de abrir o WhatsApp.</p></div>
    ${pode?'<button class="btn btn-primario" onclick="modalModelo()">Novo modelo</button>':''}
  </div>
  ${modelos.map((m,i)=>`
    <div class="painel" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:start">
        <h3>${esc(m.nome)}</h3>
        ${pode?`<div style="display:flex;gap:6px">
          <button class="btn btn-min" onclick="modalModelo(${i})">Editar</button>
          <button class="btn btn-min btn-perigo" onclick="apagarModelo(${i})">Excluir</button></div>`:''}
      </div>
      <p style="margin:8px 0 0;color:var(--tinta-2);white-space:pre-wrap">${esc(m.texto)}</p>
    </div>`).join('')}
  <div class="painel">
    <h3>Variáveis disponíveis</h3>
    <p class="sub" style="margin-top:6px">Elas são trocadas pelos dados do lead no momento do envio: {{nome}}, {{primeiro_nome}}, {{telefone}}, {{email}}, {{interesse}}, {{localidade}}, {{origem}}, {{status}}, {{corretor}}, {{empresa}}. Da visita agendada do lead: {{empreendimento}}, {{link_empreendimento}}, {{data_visita}} e {{hora_visita}}.</p>
  </div>`;
}

window.modalModelo = function(i){
  const modelos = (E.config?.modelos || MODELOS_PADRAO).slice();
  const m = i===undefined ? {nome:'',texto:''} : modelos[i];
  abrirModal(i===undefined?'Novo modelo':'Editar modelo', `
    <div class="campo"><label for="md-nome">Nome do modelo</label><input id="md-nome" value="${esc(m.nome)}" placeholder="Primeiro contato"></div>
    <div class="campo"><label for="md-texto">Texto</label><textarea id="md-texto">${esc(m.texto)}</textarea></div>
    <div class="variaveis">${['nome','primeiro_nome','interesse','localidade','origem','corretor','empresa','empreendimento','link_empreendimento','data_visita','hora_visita'].map(v=>`<button type="button" data-var="${v}">{{${v}}}</button>`).join('')}</div>
  `, `<button class="btn" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primario" id="md-salvar">Salvar</button>`);
  document.querySelectorAll('#area-modal [data-var]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const ta = $('#md-texto'); const p = ta.selectionStart;
      const tk = '{{'+b.dataset.var+'}}';
      ta.value = ta.value.slice(0,p) + tk + ta.value.slice(ta.selectionEnd);
      ta.focus(); ta.setSelectionRange(p+tk.length, p+tk.length);
    });
  });
  $('#md-salvar').addEventListener('click', async ()=>{
    const novo = { id: m.id || 'm'+Date.now(), nome: $('#md-nome').value.trim()||'Sem nome', texto: $('#md-texto').value };
    if(i===undefined) modelos.push(novo); else modelos[i] = novo;
    try{ await refConfig().update({ modelos }); fecharModal(); torrada('Modelo salvo.'); }
    catch(err){ torrada(erroAmigavel(err)); }
  });
};
window.apagarModelo = async function(i){
  const modelos = (E.config?.modelos||[]).slice();
  if(!confirm('Excluir o modelo "'+modelos[i].nome+'"?')) return;
  modelos.splice(i,1);
  try{ await refConfig().update({ modelos }); torrada('Modelo excluído.'); }catch(err){ torrada(erroAmigavel(err)); }
};

/* ------------------------- equipe ------------------------- */

function telaUsuarios(){
  const semAcesso = usuariosSemAcesso();
  const comAcesso = E.usuarios.filter(u=>u.ativo!==false);
  const caixaPendentes = semAcesso.length ? `
  <div class="painel destaque" style="margin-bottom:16px">
    <h3>Aguardando liberação (${semAcesso.length})</h3>
    <p class="sub" style="margin-bottom:6px">Cadastros novos feitos em cadastro.html e acessos desativados. Enquanto não liberar, a pessoa não consegue entrar.</p>
    <ul class="lista-simples">${semAcesso.map(u=>`
      <li>
        <div><b>${esc(u.nome)}</b><div class="linha2">${esc(u.email)} · cadastrou em ${dataCurta(u.criadoEm)}</div></div>
        <div class="acoes-linha">
          <button class="btn btn-primario btn-min" onclick="liberarUsuario('${u.id}')">Liberar acesso</button>
          <button class="btn btn-min" onclick="modalUsuario('${u.id}')">Editar</button>
          <button class="btn btn-min btn-perigo" onclick="recusarUsuario('${u.id}')">Recusar</button>
        </div>
      </li>`).join('')}</ul>
  </div>` : '';

  return `
  <div class="cabecalho">
    <div><h1>Equipe</h1><p class="sub">Quem entra na central e o que cada um enxerga.</p></div>
    <button class="btn btn-primario" onclick="modalUsuario()">Cadastrar acesso</button>
  </div>
  ${caixaPendentes}
  <div class="tabela-caixa">
    <table>
      <thead><tr><th>Pessoa</th><th>Permissão</th><th class="esconde-mob">Leads</th><th></th></tr></thead>
      <tbody>${comAcesso.map(u=>`
        <tr>
          <td><b>${esc(u.nome)}</b>
            <div class="linha2">${esc(u.email)}</div></td>
          <td><span class="chip-papel ${u.papel==='admin'?'chip-admin':'chip-corretor'}">${u.papel==='admin'?'Administração':'Corretor'}</span></td>
          <td class="esconde-mob num">${E.leads.filter(l=>l.responsavelId===u.id).length}</td>
          <td><div class="acoes-linha">
            <button class="btn btn-min" onclick="modalUsuario('${u.id}')">Editar</button>
          </div></td>
        </tr>`).join('')}</tbody>
    </table>
  </div>
  <div class="painel" style="margin-top:16px">
    <h3>O que muda entre os dois perfis</h3>
    <ul class="lista-simples" style="margin-top:8px">
      <li><span>Ver os leads e as métricas dos que são dele</span><b>todos</b></li>
      <li><span>Mudar estágio, anotar e mandar WhatsApp nos leads dele</span><b>todos</b></li>
      <li><span>Cadastrar leads (para si mesmo) e importar planilha (só os dele)</span><b>todos</b></li>
      <li><span>Ver os leads de toda a equipe</span><b>só administração</b></li>
      <li><span>Exportar CSV, atribuir e excluir leads</span><b>só administração</b></li>
      <li><span>Equipe, modelos de mensagem e ajustes</span><b>só administração</b></li>
    </ul>
  </div>`;
}

window.liberarUsuario = async function(id){
  try{ await refUsuarios().doc(id).update({ ativo:true }); torrada('Acesso liberado.'); }
  catch(err){ torrada(erroAmigavel(err)); }
};
window.recusarUsuario = async function(id){
  const u = E.usuarios.find(x=>x.id===id); if(!u) return;
  if(!confirm('Recusar e apagar o cadastro de '+u.nome+' ('+u.email+')?')) return;
  try{ await refUsuarios().doc(id).delete(); torrada('Cadastro removido.'); }
  catch(err){ torrada(erroAmigavel(err)); }
};

window.modalUsuario = function(id){
  const u = id ? E.usuarios.find(x=>x.id===id) : null;
  const souEu = u && u.id === E.eu.id;
  abrirModal(u ? 'Editar acesso' : 'Cadastrar acesso', `
    <div class="campo"><label for="us-nome">Nome</label><input id="us-nome" value="${esc(u?.nome||'')}"></div>
    <div class="campo"><label for="us-email">E-mail</label><input id="us-email" type="email" value="${esc(u?.email||'')}"></div>
    <div class="campo"><label for="us-papel">Permissão</label>
      <select id="us-papel" ${souEu?'disabled':''}>
        <option value="corretor" ${u?.papel==='corretor'?'selected':''}>Corretor — vê só os próprios leads</option>
        <option value="admin" ${u?.papel==='admin'?'selected':''}>Administração — vê tudo e gerencia</option>
      </select>${souEu?'<p class="sub" style="margin-top:6px">Você não pode rebaixar o próprio acesso.</p>':''}</div>
    <div class="campo"><label for="us-senha">${u?'Nova senha (deixe em branco para manter)':'Senha'}</label>
      <input id="us-senha" type="password" minlength="8" autocomplete="new-password">
      <div class="dica" style="font-size:.76rem;color:var(--tinta-3);margin-top:5px">Mínimo de 8 caracteres.</div></div>
    ${u && !souEu ? `<label style="display:flex;gap:8px;align-items:center;font-size:.88rem">
      <input type="checkbox" id="us-ativo" ${u.ativo!==false?'checked':''}> Acesso liberado</label>` : ''}
  `, `${u && !souEu ? `<button class="btn btn-perigo" id="us-excluir">Remover</button>` : ''}
      <span style="flex:1"></span>
      <button class="btn" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primario" id="us-salvar">Salvar</button>`);

  $('#us-salvar').addEventListener('click', async ()=>{
    const nome = $('#us-nome').value.trim();
    const email = $('#us-email').value.trim().toLowerCase();
    const senha = $('#us-senha').value;
    if(!nome || !email){ torrada('Nome e e-mail são obrigatórios.'); return; }
    if((!u || senha) && senha.length < 8){ torrada('A senha precisa de 8 caracteres ou mais.'); return; }
    if(E.usuarios.some(x=>x.email===email && x.id!==id)){ torrada('Esse e-mail já tem acesso.'); return; }
    const btn = $('#us-salvar'); btn.disabled = true; btn.textContent='Salvando…';
    try{
      if(u){
        const dados = { nome, email, papel: souEu ? u.papel : $('#us-papel').value,
                        ativo: $('#us-ativo') ? $('#us-ativo').checked : true };
        if(senha) dados.senha = senha;   // o servidor faz o hash
        await refUsuarios().doc(id).update(dados);
      }else{
        await refUsuarios().add({ nome, email, papel: $('#us-papel').value, ativo:true, senha });
      }
      fecharModal(); torrada('Acesso salvo.');
    }catch(err){ torrada(erroAmigavel(err)); btn.disabled=false; btn.textContent='Salvar'; }
  });

  $('#us-excluir')?.addEventListener('click', async ()=>{
    if(!confirm('Remover o acesso de '+u.nome+'? Os leads dele continuam na base, sem responsável.')) return;
    try{ await refUsuarios().doc(id).delete(); fecharModal(); torrada('Acesso removido.'); }
    catch(err){ torrada(erroAmigavel(err)); }
  });
};

/* ------------------------- empreendimentos ------------------------- */

/**
 * Empreendimentos da Cury que estão à venda na Guerato (guerato.com.br), conferidos em 07/10/2026.
 * Só entram os que têm estoque na página de Tabelas da Guerato (os com estoque 0 ficaram de fora).
 * - Endereço, entrega, tipologia e diferenciais dos 5 primeiros vêm da página do produto na Guerato;
 *   nos demais o endereço é só a região e o bairro (enderecoOficial ausente) — complete na página do produto.
 * - Preço (ficha.preco) só existe onde a tabela de vendas estava VIGENTE em 07/10/2026; é o menor valor
 *   com unidade disponível na tabela. ficha.precoAte é o último dia de validade: depois dele a vitrine e a
 *   área do corretor passam a mostrar "sob consulta" sozinhas. Para atualizar, mude preco e precoAte aqui
 *   (ou em Empreendimentos → Editar) e rode o botão de novo.
 * - Metragem/tipologias de Alto Granja Julieta, Caminhos da Liberdade, Cidade Parque Guarapiranga Atlântica,
 *   Cidade Lapa Perdizes, Nova Leopoldina Art e Parque das Nações Granja Julieta vieram de portais de terceiros
 *   (apto.vc, Lopes, myside, Loft, corretores), NÃO da página da Guerato. Confira na página oficial antes de divulgar.
 * - status: "Lançamento" = aparece como lançamento na home da Guerato; "Pronto para morar" = entrega já vencida;
 *   o resto ficou "Em obras" (regra simples, confira se quiser).
 */
const GUERATO_ATUALIZADO_EM = '07/10/2026';
const GUERATO_EMPREENDIMENTOS = [
  {"nome": "Urban Vila Guilherme", "link": "https://www.guerato.com.br/zona-norte/urban-vila-guilherme", "endereco": "R. Amadeu, 207 - Vila Guilherme, São Paulo - SP", "localidade": "Zona Norte", "status": "Lançamento", "descricao": "Vila Guilherme · Zona Norte. Entrega prevista: Abr/2030. Stand de vendas: Rua José Bernardo Pinto, 1400 - Vila Guilherme.", "ficha": {"dormitorios": "2", "entrega": "Abr/2030", "metragem": "32 a 53 m²", "tipologias": ["2 dorms · 32 m²", "2 dorms com terraço · 37, 38, 42, 50 e 53 m²", "2 dorms com terraço, suíte e vaga · 45 m²"], "preco": "R$ 282.800", "precoAte": "2026-11-02"}, "enderecoOficial": true, "diferenciais": ["Piso laminado nos dormitórios", "Duplo acionamento nos vasos sanitários", "Arejadores nas torneiras", "Persianas de enrolar e infra de ar-condicionado (46 m²)", "Bancada de granito na cozinha e banheiro (46 m²)"]},
  {"nome": "Alto São Domingos", "link": "https://www.guerato.com.br/zona-norte/alto-sao-domingos", "endereco": "Zona Norte - Pirituba, São Paulo - SP", "localidade": "Zona Norte", "status": "Em obras", "descricao": "Pirituba · Zona Norte. Entrega prevista: Nov/2027.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Nov/2027"}},
  {"nome": "Dez Limão", "link": "https://www.guerato.com.br/zona-norte/dez-limao", "endereco": "Zona Norte - Limão, São Paulo - SP", "localidade": "Zona Norte", "status": "Pronto para morar", "descricao": "Limão · Zona Norte. Entrega prevista: Jun/2026.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Jun/2026"}},
  {"nome": "Marco Freguesia", "link": "https://www.guerato.com.br/zona-norte/marco-freguesia", "endereco": "Zona Norte - Freguesia do Ó, São Paulo - SP", "localidade": "Zona Norte", "status": "Em obras", "descricao": "Freguesia do Ó · Zona Norte. Entrega prevista: Mar/2029.", "ficha": {"dormitorios": "2", "entrega": "Mar/2029"}},
  {"nome": "Urban Vila Maria II", "link": "https://www.guerato.com.br/zona-norte/urban-vila-maria-2", "endereco": "Zona Norte - Vila Maria, São Paulo - SP", "localidade": "Zona Norte", "status": "Em obras", "descricao": "Vila Maria · Zona Norte. Entrega prevista: Abr/2027.", "ficha": {"dormitorios": "Studio e 2 (opção de suíte)", "entrega": "Abr/2027"}},
  {"nome": "360º Park View", "link": "https://www.guerato.com.br/zona-norte/360-park-view", "endereco": "Zona Norte - City América, São Paulo - SP", "localidade": "Zona Norte", "status": "Em obras", "descricao": "City América · Zona Norte. Entrega prevista: Jan/2028.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Jan/2028"}},
  {"nome": "Urban Vila Maria", "link": "https://www.guerato.com.br/zona-norte/urban-vila-maria", "endereco": "Zona Norte - Vila Maria, São Paulo - SP", "localidade": "Zona Norte", "status": "Pronto para morar", "descricao": "Vila Maria · Zona Norte. Entrega prevista: Jun/2026.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Jun/2026"}},
  {"nome": "WL Boa Vista", "link": "https://www.guerato.com.br/zona-sul/wl-boa-vista", "endereco": "R. Dr. Ferreira Lopes, 97 - Vila Campo Grande, São Paulo - SP", "localidade": "Zona Sul", "status": "Lançamento", "descricao": "Jurubatuba · Zona Sul. Entrega prevista: Mar/2030. Stand de vendas: Av. Washington Luís, 354 - Santo Amaro.", "ficha": {"dormitorios": "2", "entrega": "Mar/2030", "metragem": "32 a 46 m²", "tipologias": ["2 dorms · 32 m²", "2 dorms com terraço · 36, 37 e 42 m²", "2 dorms com terraço e suíte · 46 m²"], "preco": "R$ 247.450", "precoAte": "2026-11-01"}, "enderecoOficial": true, "diferenciais": ["Piso laminado nos dormitórios", "Duplo acionamento nos vasos sanitários", "Arejadores nas torneiras", "Persianas de enrolar e infra de ar-condicionado (46 m²)", "Bancada de granito na cozinha e banheiro (46 m²)"]},
  {"nome": "Parque das Nações - Cond. Granja Julieta", "link": "https://www.guerato.com.br/zona-sul/parque-das-nacoes-condominio-granja-julieta", "endereco": "Zona Sul - Rio Bonito, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Rio Bonito · Zona Sul. Entrega prevista: Nov/2029.", "ficha": {"dormitorios": "1 e 2", "entrega": "Nov/2029", "metragem": "32 a 53 m²"}},
  {"nome": "Praça Santo Antônio", "link": "https://www.guerato.com.br/zona-sul/chacara-santo-antonio", "endereco": "Zona Sul - Santo Amaro, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Santo Amaro · Zona Sul. Entrega prevista: Mai/2029.", "ficha": {"dormitorios": "2", "entrega": "Mai/2029"}},
  {"nome": "Lyke Campo Limpo", "link": "https://www.guerato.com.br/zona-sul/like-campo-limpo", "endereco": "Zona Sul - Campo Limpo, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Campo Limpo · Zona Sul. Entrega prevista: Abr/2028.", "ficha": {"dormitorios": "2", "entrega": "Abr/2028"}},
  {"nome": "Cidade Parque Guarapiranga - Atlântica", "link": "https://www.guerato.com.br/zona-sul/cidade-parque-guarapiranga", "endereco": "Zona Sul - Rio Bonito, São Paulo - SP", "localidade": "Zona Sul", "status": "Lançamento", "descricao": "Rio Bonito · Zona Sul. Entrega prevista: Mar/2030.", "ficha": {"dormitorios": "2", "entrega": "Mar/2030", "metragem": "27 a 42 m²", "tipologias": ["Plantas de 27, 37 e 42 m² com varanda"]}, "alias": ["Cidade Parque Guarapiranga - Condomínio Atlântica"]},
  {"nome": "Cidade Parque Guarapiranga - Rio Bonito", "link": "https://www.guerato.com.br/zona-sul/cidade-parque-guarapiranga", "endereco": "Zona Sul - Rio Bonito, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Rio Bonito · Zona Sul. Entrega prevista: Set/2029.", "ficha": {"dormitorios": "1 e 2", "entrega": "Set/2029"}},
  {"nome": "Alto Chácara Santo Antônio", "link": "https://www.guerato.com.br/zona-sul/alto-chacara-santo-antonio", "endereco": "Zona Sul - Chácara Santo Antônio, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Chácara Santo Antônio · Zona Sul. Entrega prevista: Dez/2028.", "ficha": {"dormitorios": "2", "entrega": "Dez/2028"}},
  {"nome": "The One Granja Julieta", "link": "https://www.guerato.com.br/zona-sul/the-one-granja-julieta", "endereco": "Zona Sul - Chácara Santo Antônio, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Chácara Santo Antônio · Zona Sul. Entrega prevista: Abr/2028.", "ficha": {"dormitorios": "2", "entrega": "Abr/2028"}},
  {"nome": "Alto Granja Julieta", "link": "https://www.guerato.com.br/zona-sul/alto-granja-julieta", "endereco": "Zona Sul - Chácara Santo Antônio, São Paulo - SP", "localidade": "Zona Sul", "status": "Lançamento", "descricao": "Chácara Santo Antônio · Zona Sul. Entrega prevista: Jan/2030.", "ficha": {"dormitorios": "2", "entrega": "Jan/2030", "metragem": "33 a 53 m²", "tipologias": ["2 dorms sem terraço · 33 m²", "2 dorms com terraço · 37, 43 e 44 m²", "2 dorms com suíte · 53 m²"]}},
  {"nome": "Parque das Nações - Cond. Laguna", "link": "https://www.guerato.com.br/zona-sul/parque-das-nacoes-cond-laguna", "endereco": "Zona Sul - Chácara Santo Antônio, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Chácara Santo Antônio · Zona Sul. Entrega prevista: Fev/2029.", "ficha": {"dormitorios": "1 e 2", "entrega": "Fev/2029"}},
  {"nome": "Neo Sacomã", "link": "https://www.guerato.com.br/zona-sul/neo-sacoma", "endereco": "Zona Sul - Sacomã, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Sacomã · Zona Sul. Entrega prevista: Ago/2028.", "ficha": {"dormitorios": "2", "entrega": "Ago/2028"}},
  {"nome": "The One Chácara Santo Antônio", "link": "https://www.guerato.com.br/zona-sul/the-one-chacara-santo-antonio", "endereco": "Zona Sul - Chácara Santo Antônio, São Paulo - SP", "localidade": "Zona Sul", "status": "Em obras", "descricao": "Chácara Santo Antônio · Zona Sul. Entrega prevista: Mar/2028.", "ficha": {"dormitorios": "2", "entrega": "Mar/2028"}},
  {"nome": "Novo Mundo Carrão II", "link": "https://www.guerato.com.br/zona-leste/novo-mundo-carrao-2", "endereco": "Zona Leste - Vila Carrão, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Vila Carrão · Zona Leste. Entrega prevista: Out/2029.", "ficha": {"dormitorios": "1 e 2", "entrega": "Out/2029"}},
  {"nome": "Supreme Anália Franco", "link": "https://www.guerato.com.br/zona-leste/supreme-analia-franco", "endereco": "Zona Leste - Anália Franco, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Anália Franco · Zona Leste. Entrega prevista: Fev/2028.", "ficha": {"dormitorios": "2", "entrega": "Fev/2028"}},
  {"nome": "Novo Mundo Carrão", "link": "https://www.guerato.com.br/zona-leste/novo-mundo-carrao", "endereco": "Zona Leste - Vila Carrão, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Vila Carrão · Zona Leste. Entrega prevista: Jul/2029.", "ficha": {"dormitorios": "1 e 2", "entrega": "Jul/2029"}},
  {"nome": "Cidade Mooca - Venezia", "link": "https://www.guerato.com.br/zona-leste/cidade-mooca-venezia", "endereco": "Zona Leste - Mooca, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Mooca · Zona Leste. Entrega prevista: Jan/2028.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Jan/2028"}},
  {"nome": "Cidade Mooca - Navona", "link": "https://www.guerato.com.br/zona-leste/cidade-mooca-navona", "endereco": "Zona Leste - Mooca, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Mooca · Zona Leste. Entrega prevista: Jun/2027.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Jun/2027"}},
  {"nome": "Modern Mooca", "link": "https://www.guerato.com.br/zona-leste/modern-mooca", "endereco": "Zona Leste - Mooca, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Mooca · Zona Leste. Entrega prevista: Jun/2028.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Jun/2028"}},
  {"nome": "Mérito Belenzinho", "link": "https://www.guerato.com.br/zona-leste/merito-belenzinho", "endereco": "Zona Leste - Belenzinho, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Belenzinho · Zona Leste. Entrega prevista: Set/2027.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Set/2027"}},
  {"nome": "Cidade Mooca - Duomo", "link": "https://www.guerato.com.br/zona-leste/cidade-mooca-duomo", "endereco": "Zona Leste - Mooca, São Paulo - SP", "localidade": "Zona Leste", "status": "Em obras", "descricao": "Mooca · Zona Leste. Entrega prevista: Fev/2027.", "ficha": {"dormitorios": "2 (opção de suíte)", "entrega": "Fev/2027"}},
  {"nome": "Parque das Perdizes", "link": "https://www.guerato.com.br/zona-oeste/parque-das-perdizes", "endereco": "Av. Thomas Edison - Barra Funda, São Paulo - SP", "localidade": "Zona Oeste", "status": "Lançamento", "descricao": "Barra Funda · Zona Oeste. Entrega prevista: Breve lançamento. Stand de vendas: R. Padre Luís Alves de Siqueira, 953 - Barra Funda.", "ficha": {"dormitorios": "1 e 2", "entrega": "Breve lançamento", "metragem": "25 a 52 m²", "tipologias": ["1 dorm com terraço · 25 m²", "2 dorms com terraço · 37 e 38 m²", "2 dorms com terraço e suíte · 52 m²"], "preco": "R$ 239.000", "precoAte": "2026-11-01"}, "enderecoOficial": true, "diferenciais": ["Piso laminado nos dormitórios", "Duplo acionamento nos vasos sanitários", "Arejadores nas torneiras", "Persianas de enrolar e infra de ar-condicionado (52 m²)", "Bancada de granito na cozinha e banheiro (52 m²)"]},
  {"nome": "Cidade Lapa - Perdizes", "link": "https://www.guerato.com.br/zona-oeste/cidade-lapa-perdizes", "endereco": "Zona Oeste - Lapa de Baixo, São Paulo - SP", "localidade": "Zona Oeste", "status": "Lançamento", "descricao": "Lapa de Baixo · Zona Oeste. Entrega prevista: Set/2029.", "ficha": {"dormitorios": "2", "entrega": "Set/2029", "metragem": "34 a 46 m²", "tipologias": ["Plantas de 34, 37, 42 e 46 m²"]}},
  {"nome": "Cidade Villa Lobos - Tenor", "link": "https://www.guerato.com.br/zona-oeste/cidade-villa-lobos-condominio-tenor", "endereco": "Zona Oeste - Jaguaré, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Jaguaré · Zona Oeste. Entrega prevista: Abr/2029.", "ficha": {"dormitorios": "2", "entrega": "Abr/2029"}},
  {"nome": "Barra Funda 900", "link": "https://www.guerato.com.br/zona-oeste/barra-funda-900", "endereco": "Zona Oeste - Barra Funda, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Barra Funda · Zona Oeste. Entrega prevista: Mar/2029.", "ficha": {"dormitorios": "2", "entrega": "Mar/2029"}},
  {"nome": "Mérito Lapa", "link": "https://www.guerato.com.br/zona-oeste/merito-lapa", "endereco": "Zona Oeste - Lapa, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Lapa · Zona Oeste. Entrega prevista: Jan/2029.", "ficha": {"dormitorios": "2", "entrega": "Jan/2029"}},
  {"nome": "Barra Funda 930", "link": "https://www.guerato.com.br/zona-oeste/barra-funda-930", "endereco": "Zona Oeste - Barra Funda, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Barra Funda · Zona Oeste. Entrega prevista: Out/2028.", "ficha": {"dormitorios": "2", "entrega": "Out/2028"}},
  {"nome": "Bosque da Barra", "link": "https://www.guerato.com.br/zona-oeste/bosque-da-barra", "endereco": "R. Cônego Vicente Miguel Marino, 134 - Barra Funda, São Paulo - SP", "localidade": "Zona Oeste", "status": "Lançamento", "descricao": "Barra Funda · Zona Oeste. Entrega prevista: Set/2029. Stand de vendas: Av. Ermano Marchetti, 1009 - Água Branca.", "ficha": {"dormitorios": "2", "entrega": "Set/2029", "metragem": "32 a 46 m²", "tipologias": ["2 dorms · 32 e 34 m²", "2 dorms com terraço · 37, 41 e 42 m²", "2 dorms com terraço e suíte · 46 m²"], "preco": "R$ 299.599", "precoAte": "2026-11-01"}, "enderecoOficial": true, "diferenciais": ["Piso laminado nos dormitórios", "Duplo acionamento nos vasos sanitários", "Arejadores nas torneiras", "Persianas de enrolar e infra de ar-condicionado (46 m²)", "Bancada de granito na cozinha e banheiro (46 m²)"]},
  {"nome": "Nova Leopoldina - Cond. Art", "link": "https://www.guerato.com.br/zona-oeste/nova-leopoldina-condominio-art", "endereco": "Zona Oeste - Vila Leopoldina, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Vila Leopoldina · Zona Oeste. Entrega prevista: Mai/2029.", "ficha": {"dormitorios": "2", "entrega": "Mai/2029", "metragem": "37 a 42 m²", "vagas": "Sem vaga"}},
  {"nome": "Lyne Água Branca", "link": "https://www.guerato.com.br/zona-oeste/lyne-agua-branca", "endereco": "Zona Oeste - Água Branca, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Água Branca · Zona Oeste. Entrega prevista: Dez/2029.", "ficha": {"dormitorios": "2", "entrega": "Dez/2029"}},
  {"nome": "Supreme Vila Romana", "link": "https://www.guerato.com.br/zona-oeste/supreme-vila-romana", "endereco": "Zona Oeste - Vila Romana, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Vila Romana · Zona Oeste. Entrega prevista: Jan/2029.", "ficha": {"dormitorios": "1 e 2", "entrega": "Jan/2029"}},
  {"nome": "Atmosfera", "link": "https://www.guerato.com.br/zona-oeste/atmosfera", "endereco": "Zona Oeste - Jaguaré, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Jaguaré · Zona Oeste. Entrega prevista: Nov/2028.", "ficha": {"dormitorios": "1 e 2", "entrega": "Nov/2028"}},
  {"nome": "Astro Santa Marina", "link": "https://www.guerato.com.br/zona-oeste/astro-santa-marina", "endereco": "Zona Oeste - Santa Marina, São Paulo - SP", "localidade": "Zona Oeste", "status": "Em obras", "descricao": "Santa Marina · Zona Oeste. Entrega prevista: Set/2028.", "ficha": {"dormitorios": "1 e 2", "entrega": "Set/2028"}},
  {"nome": "Mérito Ipiranga", "link": "https://www.guerato.com.br/cury-centro/merito-ipiranga", "endereco": "R. Hipólito Soares, 176 - Ipiranga, São Paulo - SP", "localidade": "Centro", "status": "Lançamento", "descricao": "Ipiranga · Centro. Entrega prevista: Abr/2030. Stand de vendas: R. Clímaco Barbosa, 750 - Cambuci.", "ficha": {"dormitorios": "1 e 2", "entrega": "Abr/2030", "metragem": "26 a 46 m²", "tipologias": ["1 dorm · 26 m²", "2 dorms com terraço · 37, 41 e 42 m²", "2 dorms com terraço e suíte · 46 m²"]}, "enderecoOficial": true, "diferenciais": ["Piso laminado nos dormitórios", "Duplo acionamento nos vasos sanitários", "Arejadores nas torneiras", "Persianas de enrolar e infra de ar-condicionado (46 m²)", "Bancada de granito na cozinha e banheiro (46 m²)"]},
  {"nome": "Caminhos da Liberdade", "link": "https://www.guerato.com.br/cury-centro/caminhos-da-liberdade", "endereco": "Centro - Cambuci, São Paulo - SP", "localidade": "Centro", "status": "Lançamento", "descricao": "Cambuci · Centro. Entrega prevista: Set/2029.", "ficha": {"dormitorios": "2", "entrega": "Set/2029", "metragem": "32 a 53 m²"}},
  {"nome": "Next Guarulhos", "link": "https://www.guerato.com.br/guarulhos/next-guarulhos", "endereco": "Guarulhos - SP", "localidade": "Guarulhos", "status": "Em obras", "descricao": "Guarulhos. Entrega prevista: Abr/2029.", "ficha": {"dormitorios": "2", "entrega": "Abr/2029"}},
  {"nome": "Mérito Guarulhos", "link": "https://www.guerato.com.br/guarulhos/merito-guarulhos", "endereco": "Guarulhos - SP", "localidade": "Guarulhos", "status": "Em obras", "descricao": "Guarulhos. Entrega prevista: Ago/2028.", "ficha": {"dormitorios": "2", "entrega": "Ago/2028"}}
];

/** Só aceita link http(s): evita javascript: e afins vindos de dados gravados. */
function linkSeguro(l){ return typeof l==='string' && /^https?:\/\/\S+$/i.test(l.trim()) ? l.trim() : ''; }

/** Pede ao servidor a foto de destaque da página do empreendimento. Devolve a URL ou lança Error com mensagem amigável. */
async function buscarCapaDetalhe(link){
  let r, j = null;
  try{
    r = await fetch('api/capa.php', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json','X-Requested-With':'fetch'}, body: JSON.stringify({ link }) });
    j = await r.json();
  }catch(e){ throw new Error('Sem conexão com o servidor.'); }
  if(!r.ok) throw new Error(j && j.mensagem ? j.mensagem : 'Não consegui buscar a capa.');
  return { url: j.url || '', candidatas: j.candidatas || [] };
}
/** Links possíveis para a capa: o do cadastro e, se houver, o da Guerato para o mesmo empreendimento. */
function linksParaCapa(e){
  const lista = [];
  if(linkSeguro(e.link)) lista.push(linkSeguro(e.link));
  const g = (typeof GUERATO_EMPREENDIMENTOS !== 'undefined' ? GUERATO_EMPREENDIMENTOS : [])
    .find(x => [x.nome].concat(x.alias||[]).some(n => chaveEmp(n) === chaveEmp(e.nome)));
  if(g && linkSeguro(g.link) && !lista.includes(g.link)) lista.push(g.link);
  // mesmo caminho na Guerato: cury.net/imovel/SP/zona-sul/slug  ->  guerato.com.br/zona-sul/slug
  const m = String(e.link||'').match(/cury\.net\/imovel\/[A-Za-z]{2}\/([\w-]+\/[\w-]+)/i);
  if(m){ const l = 'https://www.guerato.com.br/' + m[1].toLowerCase(); if(!lista.includes(l)) lista.push(l); }
  return lista;
}
async function capaDetalheComFallback(e){
  let ultimoErro = null;
  for(const l of linksParaCapa(e)){
    try{ const d = await buscarCapaDetalhe(l); if(d.url) return d; }
    catch(err){ ultimoErro = err; if(/curl/i.test(err.message)) throw err; }
  }
  if(ultimoErro) throw ultimoErro;
  return { url:'', candidatas:[] };
}
const capaPareceLogo = u => /\.png(\?|#|$)|logo/i.test(String(u||''));
window.buscarCapasQueFaltam = async function(modo){
  // modo: (vazio) só as sem capa | true = todas | 'logos' = as que parecem logo (PNG ou "logo" no endereço)
  const refazer = modo === true, soLogos = modo === 'logos';
  const lista = (E.config?.empreendimentos || []).slice();
  const alvo = lista.map((e,i)=>({e,i})).filter(x => (refazer || (soLogos ? capaPareceLogo(x.e.fotoCapa) : !x.e.fotoCapa)) && linksParaCapa(x.e).length);
  if(!alvo.length){ torrada('Nenhum empreendimento para buscar.'); return; }
  const aviso = soLogos ? 'Trocar a capa de '+alvo.length+' empreendimento'+(alvo.length>1?'s':'')+' que parece'+(alvo.length>1?'m':'')+' ser logo? Só troca se achar uma foto melhor; senão a atual fica.'
              : refazer ? 'Refazer a capa de TODOS os '+alvo.length+' empreendimentos? As capas atuais serão trocadas pelas encontradas (se não achar uma, a atual fica).'
                        : 'Buscar a capa de '+alvo.length+' empreendimento'+(alvo.length>1?'s':'')+'? Quem já tem capa não muda.';
  if(!confirm(aviso + '\n\nTenta o site de cada um (Cury) e, se não der, a página da Guerato.')) return;
  const achadas = [], falhou = [];
  for(const {e,i} of alvo){
    torrada('Buscando capa: '+e.nome+' ('+(achadas.length+falhou.length+1)+'/'+alvo.length+')…');
    try{ const d = await capaDetalheComFallback(e); if(d.url) achadas.push({ i, nome:e.nome, url:d.url }); else falhou.push(e.nome); }
    catch(err){ falhou.push(e.nome); if(/curl/i.test(err.message)) break; }
  }
  // a mesma imagem em dois empreendimentos é quase sempre o logo/imagem genérica do site: não usa
  const uso = {}; achadas.forEach(x => { uso[x.url] = (uso[x.url]||0) + 1; });
  const boas = achadas.filter(x => uso[x.url] === 1);
  achadas.filter(x => uso[x.url] > 1).forEach(x => falhou.push(x.nome));
  boas.forEach(x => { lista[x.i] = { ...lista[x.i], fotoCapa: x.url }; });
  if(boas.length){
    try{ await refConfig().update({ empreendimentos: lista }); }
    catch(err){ torrada(erroAmigavel(err)); return; }
  }
  torrada(boas.length+' capa'+(boas.length===1?'':'s')+' encontrada'+(boas.length===1?'':'s')+(falhou.length ? '. Sem capa própria: '+falhou.join(', ')+'.' : '.'));
};

function telaEmpreendimentos(){
  const lista = E.config?.empreendimentos || [];
  return `
  <div class="cabecalho">
    <div><h1>Empreendimentos</h1><p class="sub">Nome, endereço, link, diferenciais e os dados da vitrine do Portal do Cliente. Vira a lista de escolha ao agendar uma visita.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="buscarCapasQueFaltam()" title="Abre a página oficial de cada empreendimento sem capa e pega a foto de destaque">Buscar capas pelo site</button>
      <button class="btn" onclick="buscarCapasQueFaltam('logos')" title="Procura foto do projeto no lugar das capas que são logo (PNG)">Trocar capas de logo</button>
      <button class="btn" onclick="buscarCapasQueFaltam(true)" title="Busca de novo e troca as capas atuais (use se saiu o logo em vez da foto)">Refazer todas as capas</button>
      <button class="btn" onclick="importarEmpreendimentosGuerato()" title="Traz os empreendimentos da Cury que estão à venda na Guerato (guerato.com.br), com preço só onde a tabela está vigente">Atualizar pela Guerato</button>
      <button class="btn btn-primario" onclick="modalEmpreendimento()">Novo empreendimento</button>
    </div>
  </div>
  ${lista.length ? `
  <div class="tabela-caixa">
    <table>
      <thead><tr><th>Nome</th><th class="esconde-mob">Endereço</th><th class="esconde-mob">Região</th><th>Site</th><th></th></tr></thead>
      <tbody>${lista.map((e,i)=>`
        <tr>
          <td><b>${esc(e.nome)}</b></td>
          <td class="esconde-mob">${esc(e.endereco || '—')}</td>
          <td class="esconde-mob">${esc(e.localidade || '—')}</td>
          <td>${linkSeguro(e.link) ? `<a class="btn btn-min" href="${esc(linkSeguro(e.link))}" target="_blank" rel="noopener noreferrer">Abrir no site</a>` : '—'}</td>
          <td><div class="acoes-linha">
            <button class="btn btn-min" onclick="modalEmpreendimento(${i})">Editar</button>
            <button class="btn btn-min btn-perigo" onclick="apagarEmpreendimento(${i})">Excluir</button>
          </div></td>
        </tr>`).join('')}</tbody>
    </table>
  </div>`
  : `<div class="painel"><div class="vazio"><b>Nenhum empreendimento cadastrado</b>Cadastre o primeiro no botão acima. Renomear ou excluir depois não muda visitas já marcadas.</div></div>`}`;
}

window.modalEmpreendimento = function(i){
  const lista = (E.config?.empreendimentos || []).slice();
  const e = i===undefined ? {nome:'',endereco:'',link:'',localidade:'',descricao:'',fotoCapa:'',status:'',diferenciais:[],ficha:{}} : lista[i];
  const localidades = E.config?.localidades || [];
  abrirModal(i===undefined ? 'Novo empreendimento' : 'Editar empreendimento', `
    <div class="campo"><label for="ep-nome">Nome</label><input id="ep-nome" maxlength="160" value="${esc(e.nome)}" placeholder="Residencial Aurora"></div>
    <div class="campo"><label for="ep-endereco">Endereço</label><input id="ep-endereco" maxlength="255" value="${esc(e.endereco||'')}" placeholder="Rua, número, bairro"></div>
    <div class="campo"><label for="ep-link">Link do site (opcional)</label><input id="ep-link" type="url" maxlength="500" value="${esc(e.link||'')}" placeholder="https://cury.net/imovel/..."></div>
    <p class="rotulo-min" style="margin-top:6px">Vitrine do Portal do Cliente</p>
    <div class="duplas">
      <div class="campo"><label for="ep-localidade">Região</label>
        <select id="ep-localidade"><option value="">Sem região</option>
          ${localidades.map(l=>`<option value="${esc(l)}"${e.localidade===l?' selected':''}>${esc(l)}</option>`).join('')}
        </select></div>
      <div class="campo"><label for="ep-status">Status (opcional)</label><input id="ep-status" maxlength="60" value="${esc(e.status||'')}" placeholder="Lançamento, Em obras, Pronto..."></div>
    </div>
    <div class="campo"><label for="ep-foto">Foto de capa — link da imagem (opcional)</label><div style="display:flex;gap:8px"><input id="ep-foto" type="url" maxlength="500" style="flex:1" value="${esc(e.fotoCapa||'')}" placeholder="https://..."><button type="button" class="btn" id="ep-foto-buscar" title="Pega a foto de destaque da página do campo Link do site">Buscar pelo site</button></div><div id="ep-foto-prev" class="capa-prev" hidden></div><div id="ep-foto-opcoes" hidden></div><p class="rotulo-min" style="margin:4px 0 0">Aceita link direto da imagem (JPG, PNG, WEBP) ou link de compartilhamento do Google Drive/Dropbox. Sem foto, a vitrine mostra uma fachada desenhada.</p></div>
    <div class="campo"><label for="ep-descricao">Descrição na vitrine (opcional)</label><textarea id="ep-descricao" maxlength="2000" placeholder="Texto que o cliente vê ao abrir os detalhes do empreendimento">${esc(e.descricao||'')}</textarea></div>
    <p class="rotulo-min" style="margin-top:10px">Ficha do empreendimento (aparece nos detalhes para o cliente)</p>
    <div class="duplas">
      <div class="campo"><label for="ep-metragem">Metragem</label><input id="ep-metragem" maxlength="60" value="${esc((e.ficha||{}).metragem||'')}" placeholder="34 a 52 m²"></div>
      <div class="campo"><label for="ep-dorms">Dormitórios</label><input id="ep-dorms" maxlength="60" value="${esc((e.ficha||{}).dormitorios||'')}" placeholder="2 e 3"></div>
      <div class="campo"><label for="ep-vagas">Vagas</label><input id="ep-vagas" maxlength="60" value="${esc((e.ficha||{}).vagas||'')}" placeholder="1 vaga"></div>
      <div class="campo"><label for="ep-entrega">Entrega prevista</label><input id="ep-entrega" maxlength="60" value="${esc((e.ficha||{}).entrega||'')}" placeholder="Dez/2028"></div>
    </div>
    <div class="campo"><label for="ep-tipo">Tipo de imóvel (opcional)</label><input id="ep-tipo" maxlength="60" value="${esc((e.ficha||{}).tipo||'')}" placeholder="Apartamento, Casa, Studio…"></div>
    <div class="duplas">
      <div class="campo"><label for="ep-preco">Preço a partir de</label><input id="ep-preco" maxlength="60" value="${esc((e.ficha||{}).preco||'')}" placeholder="R$ 289 mil"></div>
      <div class="campo"><label for="ep-preco-ate">Preço válido até</label><input id="ep-preco-ate" type="date" value="${esc((e.ficha||{}).precoAte||'')}"></div>
    </div>
    <div class="campo"><label for="ep-tipologias">Plantas (uma por linha)</label><textarea id="ep-tipologias" maxlength="1400" placeholder="2 dorm · 38 m² · 1 vaga&#10;2 dorm com varanda · 44 m² · 1 vaga">${esc(((e.ficha||{}).tipologias||[]).join('\n'))}</textarea></div>
    <div class="campo"><label for="ep-lazer">Lazer (um por linha)</label><textarea id="ep-lazer" maxlength="1400" placeholder="Piscina&#10;Churrasqueira&#10;Playground">${esc(((e.ficha||{}).lazer||[]).join('\n'))}</textarea></div>
    <div class="campo"><label for="ep-documentos">Documentos (opcional, um por linha: Nome | link)</label><textarea id="ep-documentos" maxlength="3000" placeholder="Memorial descritivo | https://...&#10;Tabela de valores | https://...">${esc(((e.ficha||{}).documentos||[]).join('\n'))}</textarea></div>
    <div class="campo"><label for="ep-galeria">Fotos da galeria — links, um por linha (opcional)</label><textarea id="ep-galeria" maxlength="4000" placeholder="https://...">${esc(((e.ficha||{}).galeria||[]).join('\n'))}</textarea></div>
    <div class="campo"><label for="ep-diferenciais">Diferenciais (opcional, um por linha)</label><textarea id="ep-diferenciais" maxlength="800" placeholder="Perto de metrô&#10;Perto de parque&#10;Fácil acesso à Marginal">${esc((e.diferenciais||[]).join('\n'))}</textarea></div>
  `, `<button class="btn" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primario" id="ep-salvar">Salvar</button>`);

  (function(){
    const campo=$('#ep-foto'), prev=$('#ep-foto-prev');
    const conv=u=>{
      if(!linkSeguro(u)) return '';
      const m=u.match(/drive\.google\.com\/file\/d\/([\w-]+)/i)||u.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/i);
      if(m) return 'https://drive.google.com/thumbnail?id='+m[1]+'&sz=w800';
      return /^https?:\/\/(www\.)?dropbox\.com\//i.test(u) ? u.replace(/^https?:\/\/(www\.)?dropbox\.com/i,'https://dl.dropboxusercontent.com').replace(/[?&]dl=0/,'') : u;
    };
    const atualizar=()=>{
      const u=conv(campo.value.trim());
      prev.innerHTML=''; prev.hidden=!u; if(!u) return;
      const img=new Image(); img.alt='Pré-visualização da capa'; img.referrerPolicy='no-referrer';
      img.onerror=()=>{ prev.innerHTML='<span>Não consegui carregar essa imagem. Confira o link.</span>'; };
      img.src=u; prev.appendChild(img);
    };
    campo.addEventListener('change',atualizar); campo.addEventListener('input',()=>{ clearTimeout(campo._t); campo._t=setTimeout(atualizar,500); });
    const opcoes=$('#ep-foto-opcoes');
    function mostrarCandidatas(lista){
      opcoes.innerHTML=''; if(!lista || lista.length<2){ opcoes.hidden=true; return; }
      opcoes.hidden=false;
      const t=document.createElement('p'); t.className='rotulo-min'; t.style.margin='8px 0 4px'; t.textContent='Não é essa? Clique em outra:'; opcoes.appendChild(t);
      const gal=document.createElement('button'); gal.type='button'; gal.className='btn btn-min'; gal.style.marginBottom='6px';
      gal.textContent='Usar estas fotos na galeria';
      gal.addEventListener('click',()=>{
        const g=$('#ep-galeria'), ja=new Set(g.value.split('\n').map(x=>x.trim()).filter(Boolean));
        lista.filter(u=>u!==campo.value.trim()).slice(0,8).forEach(u=>ja.add(u));
        g.value=Array.from(ja).join('\n'); torrada('Fotos colocadas na galeria. Apague abaixo as que não forem do empreendimento.');
      });
      opcoes.appendChild(gal);
      const fila=document.createElement('div'); fila.className='capa-opcoes';
      lista.forEach(u=>{ const b=document.createElement('button'); b.type='button'; b.title=u;
        const im=new Image(); im.src=u; im.alt=''; im.referrerPolicy='no-referrer'; im.loading='lazy'; im.onerror=()=>b.remove();
        b.appendChild(im); b.addEventListener('click',()=>{ campo.value=u; atualizar(); }); fila.appendChild(b); });
      opcoes.appendChild(fila);
    }
    atualizar();
    $('#ep-foto-buscar').addEventListener('click', async ()=>{
      const b=$('#ep-foto-buscar'), nomeAtual=$('#ep-nome').value.trim(), l=linkSeguro($('#ep-link').value.trim());
      const alvo={ nome: nomeAtual, link: l };
      if(!linksParaCapa(alvo).length){ torrada('Preencha o Link do site primeiro.'); return; }
      b.disabled=true; b.textContent='Buscando…';
      try{
        const d=await capaDetalheComFallback(alvo);
        if(d.url){ campo.value=d.url; atualizar(); mostrarCandidatas(d.candidatas); $('#ep-foto-opcoes').scrollIntoView({block:'nearest'}); }
        else torrada('A página não tem imagem de destaque. Cole o link da foto à mão.');
      }
      catch(err){ torrada(err.message); }
      b.disabled=false; b.textContent='Buscar pelo site';
    });
  })();

  $('#ep-salvar').addEventListener('click', async ()=>{
    const nome = $('#ep-nome').value.trim();
    const endereco = $('#ep-endereco').value.trim();
    const link = $('#ep-link').value.trim();
    const foto = $('#ep-foto').value.trim();
    if(link && !linkSeguro(link)){ torrada('O link precisa começar com http:// ou https://.'); return; }
    if(foto && !linkSeguro(foto)){ torrada('O link da foto de capa precisa começar com http:// ou https://.'); return; }
    if(!nome){ torrada('Informe o nome do empreendimento.'); return; }
    if(lista.some((x,idx)=>idx!==i && x.nome.trim().toLowerCase()===nome.toLowerCase())){ torrada('Já existe um empreendimento com esse nome.'); return; }
    const salvos = lista.slice();
    const novo = {
      nome, endereco, link,
      localidade: $('#ep-localidade').value,
      status: $('#ep-status').value.trim(),
      fotoCapa: foto,
      descricao: $('#ep-descricao').value.trim(),
      diferenciais: $('#ep-diferenciais').value.split('\n').map(s=>s.trim()).filter(Boolean),
      ficha: {
        metragem: $('#ep-metragem').value.trim(), dormitorios: $('#ep-dorms').value.trim(),
        vagas: $('#ep-vagas').value.trim(), entrega: $('#ep-entrega').value.trim(), preco: $('#ep-preco').value.trim(), precoAte: $('#ep-preco-ate').value, tipo: $('#ep-tipo').value.trim(),
        tipologias: $('#ep-tipologias').value.split('\n').map(s=>s.trim()).filter(Boolean),
        lazer: $('#ep-lazer').value.split('\n').map(s=>s.trim()).filter(Boolean),
        galeria: $('#ep-galeria').value.split('\n').map(s=>s.trim()).filter(Boolean),
        documentos: $('#ep-documentos').value.split('\n').map(s=>s.trim()).filter(Boolean)
      }
    };
    if(i===undefined) salvos.push(novo); else salvos[i] = novo;
    const btn = $('#ep-salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try{ await refConfig().update({ empreendimentos: salvos }); fecharModal(); torrada('Empreendimento salvo.'); }
    catch(err){ torrada(erroAmigavel(err)); btn.disabled=false; btn.textContent='Salvar'; }
  });
};
const chaveEmp = t => String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/condominio/g,'cond').replace(/[^a-z0-9]/g,'');
function mesclarEmpreendimento(velho, g){
  const v = velho || {};
  const ficha = { ...(v.ficha||{}) };
  Object.entries(g.ficha||{}).forEach(([k,val])=>{ if(val!=null && val!=='' && !(Array.isArray(val) && !val.length)) ficha[k] = val; });
  // sem tabela vigente, o preço antigo (de outra fonte ou vencido) sai: melhor "sob consulta" do que valor errado
  if(!(g.ficha||{}).preco){ delete ficha.preco; delete ficha.precoAte; }
  return {
    nome: v.nome || g.nome,
    endereco: g.enderecoOficial ? g.endereco : (v.endereco || g.endereco || ''),
    link: v.link || g.link || '',
    localidade: v.localidade || g.localidade || '',
    status: v.status || g.status || '',
    fotoCapa: v.fotoCapa || '',
    descricao: v.descricao || g.descricao || '',
    diferenciais: (g.diferenciais && g.diferenciais.length) ? g.diferenciais : (v.diferenciais || []),
    ficha
  };
}
window.importarEmpreendimentosGuerato = async function(){
  const lista = (E.config?.empreendimentos || []).slice();
  const achar = g => lista.findIndex(e => [g.nome].concat(g.alias||[]).some(n => chaveEmp(n) === chaveEmp(e.nome)));
  const novos = [], atualizar = [];
  GUERATO_EMPREENDIMENTOS.forEach(g => { const i = achar(g); if(i < 0) novos.push(g); else atualizar.push({ i, g }); });
  const comPreco = GUERATO_EMPREENDIMENTOS.filter(g => (g.ficha||{}).preco);
  const linhas = [
    'Lista da Guerato de '+GUERATO_ATUALIZADO_EM+': '+GUERATO_EMPREENDIMENTOS.length+' empreendimentos com estoque.',
    novos.length ? 'Adicionar '+novos.length+' novo'+(novos.length>1?'s':'')+'.' : 'Nenhum novo a adicionar.',
    'Atualizar '+atualizar.length+' já cadastrado'+(atualizar.length!==1?'s':'')+' (preço, entrega, região, status; o que você escreveu à mão fica).',
    'Preço só em '+comPreco.length+' ('+comPreco.map(g=>g.nome).join(', ')+'), onde a tabela está vigente; nos outros a vitrine mostra "sob consulta".'
  ];
  if(!confirm(linhas.join('\n\n'))) return;
  atualizar.forEach(({ i, g }) => { lista[i] = mesclarEmpreendimento(lista[i], g); });
  novos.forEach(g => lista.push(mesclarEmpreendimento(null, g)));
  const locs = localidadesDisponiveis();
  const faltam = [...new Set(GUERATO_EMPREENDIMENTOS.map(g => g.localidade))].filter(l => l && !locs.includes(l));
  try{
    await refConfig().update(faltam.length ? { empreendimentos: lista, localidades: locs.concat(faltam) } : { empreendimentos: lista });
    torrada(novos.length+' adicionado'+(novos.length===1?'':'s')+', '+atualizar.length+' atualizado'+(atualizar.length===1?'':'s')+'.');
  }catch(err){ torrada(erroAmigavel(err)); }
};
window.apagarEmpreendimento = async function(i){
  const lista = (E.config?.empreendimentos || []).slice();
  const e = lista[i]; if(!e) return;
  if(!confirm('Excluir o empreendimento "'+e.nome+'"? Visitas já marcadas não mudam.')) return;
  lista.splice(i,1);
  try{ await refConfig().update({ empreendimentos: lista }); torrada('Empreendimento excluído.'); }
  catch(err){ torrada(erroAmigavel(err)); }
};

/* ------------------------- distribuição ------------------------- */

const DIST = { dados:null, erro:null, offset:0, form:null, previaSeq:0, prefs:{ porRodada:'1', intervalo:'10', sup:'' } };   // prefs: o que a pessoa costuma usar, lembrado entre visitas à tela

function formDistribuicaoNovo(){
  return { de:null, loc:'', orig:'', est:'', sel:null, qtd:{}, manual:false, disponiveis:null, ...DIST.prefs };
}
const agoraServidor = () => Date.now() + DIST.offset;
function horaCurta(iso){
  const d = new Date(iso); if(isNaN(d)) return '';
  return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
/** "às 20:24" se for hoje; "20/09 às 08:14" se for outro dia. */
function quandoDist(iso){
  const d = new Date(iso); if(isNaN(d)) return '';
  const hoje = new Date(agoraServidor()).toDateString() === d.toDateString();
  return (hoje ? '' : d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' ') + 'às ' + horaCurta(iso);
}
function emMinutos(iso){
  const m = Math.round((Date.parse(iso) - agoraServidor()) / 60000);
  if(!(m > 0)) return 'agora';
  if(m < 60) return 'em ' + m + ' min';
  return 'em ' + Math.floor(m/60) + ' h' + (m%60 ? ' ' + String(m%60).padStart(2,'0') + ' min' : '');
}
const plural = (n, um, varios) => n === 1 ? um : varios;

function nomeDoGrupo(de){
  if(de === '__sem__') return 'Sem responsável';
  return E.usuarios.find(u=>u.id===de)?.nome || 'Pessoa removida';
}

function telaDistribuicao(){
  return `
  <div class="cabecalho"><div>
    <h1>Distribuição</h1>
    <p class="sub">Reparte leads entre a equipe aos poucos: a cada X minutos, cada pessoa recebe N leads. Os leads só passam para o corretor na hora de cada rodada.</p>
  </div></div>
  <div id="ds-form"></div>
  <div id="ds-lista"></div>`;
}

async function carregarDistribuicao(){
  try{
    const r = await requisicao('api/distribuicao.php?acao=resumo','GET');
    DIST.offset = Date.parse(r.agora) - Date.now();
    DIST.dados = r; DIST.erro = null;
  }catch(err){ DIST.erro = err; }
  if(E.vista !== 'distribuicao') return;
  if(DIST.dados && !DIST.form) iniciarFormDistribuicao();
  desenharDistribuicaoLista();
}

/** Escolhe o grupo de leads inicial (sem responsável, ou o do próprio admin) e marca a equipe. */
function iniciarFormDistribuicao(){
  DIST.form = formDistribuicaoNovo();
  const f = DIST.form, pools = DIST.dados.pools.filter(p=>p.n>0);
  const escolhido = pools.find(p=>p.de==='__sem__') || pools.find(p=>p.de===E.eu.id) || pools.slice().sort((a,b)=>b.n-a.n)[0];
  f.de = escolhido ? escolhido.de : '__sem__';
  const ativos = E.usuarios.filter(u=>u.ativo!==false);
  const corretores = ativos.filter(u=>u.papel==='corretor');
  f.sel = new Set((corretores.length ? corretores : ativos).map(u=>u.id));
  f.disponiveis = escolhido ? escolhido.n : 0;
  dividirIgual();
  desenharDistribuicaoForm();
  if(escolhido) atualizarDisponiveis();
}

function dividirIgual(){
  const f = DIST.form, ids = E.usuarios.filter(u=>f.sel.has(u.id)).map(u=>u.id);
  f.qtd = {}; f.manual = false;
  if(!ids.length) return;
  const disp = f.disponiveis || 0, base = Math.floor(disp/ids.length), resto = disp % ids.length;
  ids.forEach((id,i)=>{ f.qtd[id] = base + (i < resto ? 1 : 0); });
}

async function atualizarDisponiveis(){
  const f = DIST.form, seq = ++DIST.previaSeq;
  const q = new URLSearchParams({ acao:'previa', de:f.de, localidade:f.loc, origem:f.orig, status:f.est });
  try{
    const r = await requisicao('api/distribuicao.php?' + q.toString(), 'GET');
    if(seq !== DIST.previaSeq) return;
    f.disponiveis = r.disponiveis;
  }catch(err){
    if(seq !== DIST.previaSeq) return;
    f.disponiveis = null; torrada(erroAmigavel(err));
  }
  if(!f.manual) dividirIgual();
  if(E.vista === 'distribuicao') desenharDistribuicaoForm();
}

/** Confere o que está no formulário e monta a frase de resumo. */
function resumoDistribuicao(){
  const f = DIST.form;
  const ids = E.usuarios.filter(u=>f.sel.has(u.id)).map(u=>u.id);
  const porRodada = Number(f.porRodada), intervalo = Number(f.intervalo);
  if(f.disponiveis === null) return { ok:false, msg:'Calculando os leads disponíveis…' };
  if(!ids.length) return { ok:false, msg:'Escolha pelo menos uma pessoa para receber os leads.' };
  if(!Number.isInteger(porRodada) || porRodada < 1) return { ok:false, msg:'Informe quantos leads cada pessoa recebe por rodada (1 ou mais).' };
  if(!Number.isInteger(intervalo) || intervalo < 1) return { ok:false, msg:'Informe o intervalo entre as rodadas, em minutos (1 ou mais).' };
  let total = 0, rodadas = 0;
  for(const id of ids){
    const q = Number(f.qtd[id]);
    if(!Number.isInteger(q) || q < 1) return { ok:false, msg:'Cada pessoa escolhida precisa receber pelo menos 1 lead.' };
    total += q; rodadas = Math.max(rodadas, Math.ceil(q / porRodada));
  }
  if(total > f.disponiveis) return { ok:false, msg:`Você pediu ${total} leads, mas só há ${f.disponiveis} disponíveis com esses filtros.` };
  const ultima = new Date(agoraServidor() + (rodadas - 1) * intervalo * 60000).toISOString();
  const restam = f.disponiveis - total;
  return { ok:true, ids, total, rodadas, porRodada, intervalo, ultima,
    msg:`${total} ${plural(total,'lead','leads')} em ${rodadas} ${plural(rodadas,'rodada','rodadas')}. A primeira cai agora e a última ${quandoDist(ultima)}.` + (restam ? ` (${restam} ${plural(restam,'fica','ficam')} de fora.)` : '') };
}

function desenharDistribuicaoForm(){
  const el = $('#ds-form'); if(!el || !DIST.form || !DIST.dados) return;
  const f = DIST.form;
  const pools = DIST.dados.pools.filter(p=>p.n>0);
  if(!pools.length){
    el.innerHTML = `<div class="painel" style="margin-bottom:14px"><div class="vazio"><b>Não há leads para distribuir</b>Importe uma planilha em <b>Importar</b> e, em "Atribuir todos a", escolha <b>Sem responsável</b>. Os leads que ainda não têm dono aparecem aqui.</div></div>`;
    return;
  }
  const opt = (v, t, atual) => `<option value="${esc(v)}" ${String(v)===String(atual)?'selected':''}>${esc(t)}</option>`;
  const gente = E.usuarios.filter(u=>u.ativo!==false);
  const r = resumoDistribuicao();
  el.innerHTML = `
  <div class="painel" style="margin-bottom:14px">
    <h3>Nova distribuição</h3>
    <div class="duplas" style="margin-top:12px">
      <div class="campo"><label for="ds-de">Leads que estão com</label>
        <select id="ds-de">${pools.map(p=>opt(p.de, `${nomeDoGrupo(p.de)} (${p.n})`, f.de)).join('')}</select></div>
      <div class="campo"><label for="ds-est">Estágio</label>
        <select id="ds-est">${opt('','Todos os estágios',f.est)}${(E.config?.estagios||ESTAGIOS_PADRAO).map(x=>opt(x,x,f.est)).join('')}</select></div>
    </div>
    <div class="duplas">
      <div class="campo"><label for="ds-loc">Localidade</label>
        <select id="ds-loc">${opt('','Todas as localidades',f.loc)}${localidadesConhecidas().map(x=>opt(x,x,f.loc)).join('')}</select></div>
      <div class="campo"><label for="ds-orig">Origem</label>
        <select id="ds-orig">${opt('','Todas as origens',f.orig)}${(E.config?.origens||ORIGENS_PADRAO).map(x=>opt(x,x,f.orig)).join('')}</select></div>
    </div>
    <p class="sub" style="margin:-4px 0 14px"><b>${f.disponiveis === null ? '…' : f.disponiveis}</b> ${f.disponiveis === 1 ? 'lead disponível' : 'leads disponíveis'} com esses filtros. Sai primeiro quem foi cadastrado antes.</p>

    <label class="sub" style="display:block;margin-bottom:4px;font-weight:500">Quem recebe, e quantos leads cada um</label>
    <div id="ds-gente">${gente.map(u=>{
      const marcado = f.sel.has(u.id);
      return `<label class="dist-linha">
        <input type="checkbox" data-ds-sel="${esc(u.id)}" ${marcado?'checked':''}>
        <span style="flex:1"><b>${esc(u.nome)}</b>${u.papel==='admin'?' <span class="linha2">· administração</span>':''}</span>
        <input type="number" class="dist-qtd" min="1" step="1" data-ds-qtd="${esc(u.id)}" value="${marcado && f.qtd[u.id] !== undefined ? esc(f.qtd[u.id]) : ''}" ${marcado?'':'disabled'} aria-label="Quantidade para ${esc(u.nome)}">
      </label>`; }).join('')}</div>
    <div style="margin:8px 0 16px"><button type="button" class="btn btn-min" id="ds-igual">Dividir igualmente</button></div>

    <div class="duplas">
      <div class="campo"><label for="ds-rodada">Leads por pessoa a cada rodada</label><input id="ds-rodada" type="number" min="1" step="1" value="${esc(f.porRodada)}"></div>
      <div class="campo"><label for="ds-intervalo">Intervalo entre rodadas (minutos)</label><input id="ds-intervalo" type="number" min="1" step="1" value="${esc(f.intervalo)}"></div>
    </div>
    <div class="campo"><label for="ds-sup">Superintendência (opcional)</label>
      <input id="ds-sup" list="ds-sup-lista" maxlength="120" value="${esc(f.sup)}" placeholder="Ex.: Superintendência Zona Norte" autocomplete="off">
      <datalist id="ds-sup-lista">${(DIST.dados.superintendencias||[]).map(s=>`<option value="${esc(s)}">`).join('')}</datalist>
      <p class="sub" style="margin-top:5px">Fica registrada na distribuição e no histórico de cada lead, junto com o seu nome.</p></div>

    <p class="sub" id="ds-resumo" style="margin-bottom:12px"></p>
    <button class="btn btn-primario" id="ds-iniciar">Iniciar distribuição</button>
  </div>`;
  atualizarResumoDistribuicao();
}

/** Atualiza só a frase de resumo e o botão — sem redesenhar o formulário, para não roubar o foco de quem digita. */
function atualizarResumoDistribuicao(){
  const r = resumoDistribuicao();
  const p = $('#ds-resumo'), b = $('#ds-iniciar');
  if(p){ p.textContent = r.msg; p.style.color = r.ok ? '' : 'var(--perigo)'; }
  if(b) b.disabled = !r.ok;
}

async function iniciarDistribuicao(){
  const r = resumoDistribuicao(); if(!r.ok){ torrada(r.msg); return; }
  const f = DIST.form;
  const corretores = r.ids.map(id=>({ id, quantidade:Number(f.qtd[id]) }));
  const linhas = corretores.map(c=>`• ${nomeDoGrupo(c.id)}: ${c.quantidade}`).join('\n');
  const sup = f.sup.trim();
  if(!confirm(`Distribuir ${r.total} ${plural(r.total,'lead','leads')}?\n\n${linhas}\n\nA cada ${r.intervalo} min, cada pessoa recebe ${r.porRodada} ${plural(r.porRodada,'lead','leads')}. A primeira rodada cai agora e a última ${quandoDist(r.ultima)}.` + (sup ? `\nSuperintendência: ${sup}` : '') + `\nDistribuição em nome de: ${E.eu.nome}`)) return;
  const btn = $('#ds-iniciar'); if(btn){ btn.disabled = true; btn.textContent = 'Iniciando…'; }
  try{
    const res = await requisicao('api/distribuicao.php?acao=criar','POST',{
      de:f.de, localidade:f.loc, origem:f.orig, status:f.est,
      corretores, porRodada:Number(f.porRodada), intervaloMin:Number(f.intervalo), superintendencia:sup });
    torrada(`Distribuição iniciada: ${res.total} ${plural(res.total,'lead','leads')}.`);
    DIST.form = null;                 // recomeça o formulário com os números novos
    await carregarDistribuicao();
    if(DIST.dados && !DIST.form && E.vista==='distribuicao') iniciarFormDistribuicao();
  }catch(err){
    torrada(erroAmigavel(err));
    if(btn){ btn.textContent = 'Iniciar distribuição'; atualizarResumoDistribuicao(); }
  }
}

function cartaoDistribuicao(x){
  const pct = x.total ? Math.round(x.liberados / x.total * 100) : 0;
  const [rot, cls] = { ativa:['Em andamento','st-agendada'], concluida:['Concluída','st-realizada'], cancelada:['Cancelada','st-cancelada'] }[x.situacao] || [x.situacao,''];
  const extras = [];
  if(x.ignorados) extras.push(`${x.ignorados} ${plural(x.ignorados,'lead não foi entregue','leads não foram entregues')} porque já tinham ${plural(x.ignorados,'outro responsável','outro responsável')}`);
  if(x.cancelados && x.situacao !== 'cancelada') extras.push(`${x.cancelados} ${plural(x.cancelados,'não foi entregue','não foram entregues')} (pessoa sem acesso)`);
  let andamento = '';
  if(x.situacao === 'ativa' && x.proxima){
    andamento = `Próxima rodada ${quandoDist(x.proxima)} (${emMinutos(x.proxima)}) · termina ${quandoDist(x.ultima)}`;
  }else if(x.situacao === 'cancelada'){
    andamento = `Cancelada por ${esc(x.encerradaPor||'—')} em ${esc(dataHora(x.encerradaEm))}. ${x.cancelados} ${plural(x.cancelados,'lead não entregue continua','leads não entregues continuam')} como estavam.`;
  }else if(x.situacao === 'concluida'){
    andamento = `Terminou em ${esc(dataHora(x.encerradaEm || x.ultima))}.`;
  }
  return `
  <div class="painel">
    <div class="dist-cab">
      <div>
        <b>${x.total} ${plural(x.total,'lead','leads')}${x.superintendencia ? ` · Superintendência ${esc(x.superintendencia)}` : ''}</b>
        <div class="linha2">Distribuído por <b>${esc(x.criadoPor)}</b> em ${esc(dataHora(x.criadoEm))} · ${x.porRodada} ${plural(x.porRodada,'lead','leads')} por pessoa a cada ${x.intervaloMin} min</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="etiqueta ${cls}">${esc(rot)}</span>
        ${x.situacao==='ativa' ? `<button class="btn btn-min btn-perigo" data-ds-cancelar="${esc(x.id)}">Cancelar o que falta</button>` : ''}
      </div>
    </div>
    <div class="progresso"><i style="width:${pct}%"></i></div>
    <p class="sub num" style="margin-top:8px">${x.liberados} de ${x.total} entregues (${pct}%)${extras.length ? ' · ' + extras.join(' · ') : ''}</p>
    ${andamento ? `<p class="sub" style="margin-top:2px">${andamento}</p>` : ''}
    <div class="dist-corretores">${x.corretores.map(c=>`<span><b>${esc(c.nome)}</b> ${c.liberados}/${c.total}</span>`).join('')}</div>
  </div>`;
}

function desenharDistribuicaoLista(){
  const el = $('#ds-lista'); if(!el) return;
  if(!DIST.dados){
    el.innerHTML = DIST.erro
      ? `<div class="painel"><div class="vazio"><b>Não consegui abrir a distribuição</b>${esc(erroAmigavel(DIST.erro))}</div></div>`
      : `<p class="sub">Carregando…</p>`;
    return;
  }
  const itens = DIST.dados.distribuicoes;
  el.innerHTML = `<h3 style="margin:6px 0 10px">Distribuições</h3>` + (itens.length
    ? `<div class="dist-lista">${itens.map(cartaoDistribuicao).join('')}</div>`
    : `<div class="painel"><div class="vazio"><b>Nenhuma distribuição ainda</b>Quando você iniciar a primeira, o andamento aparece aqui, com quem distribuiu e quantos leads já caíram para cada pessoa.</div></div>`);
}

function ligarDistribuicao(){
  const c = $('#conteudo');
  DIST.dados = null; DIST.form = null; DIST.erro = null;   // a cada visita: números frescos (importações e distribuições mudam a lista)
  desenharDistribuicaoLista();
  carregarDistribuicao();

  const f = () => DIST.form;
  const recalc = () => { const x = f(); if(x && !x.manual) dividirIgual(); desenharDistribuicaoForm(); };
  // ligado uma vez só ao #conteudo (que nunca é substituído): o handler confere se a tela ainda é a da distribuição
  if(c._distLigado) return;
  c._distLigado = true;

  c.addEventListener('change', ev=>{
    if(E.vista !== 'distribuicao' || !f()) return;
    const t = ev.target, x = f();
    if(t.id === 'ds-de'){ x.de = t.value; x.disponiveis = null; desenharDistribuicaoForm(); atualizarDisponiveis(); return; }
    if(t.id === 'ds-est'){ x.est = t.value; x.disponiveis = null; desenharDistribuicaoForm(); atualizarDisponiveis(); return; }
    if(t.id === 'ds-loc'){ x.loc = t.value; x.disponiveis = null; desenharDistribuicaoForm(); atualizarDisponiveis(); return; }
    if(t.id === 'ds-orig'){ x.orig = t.value; x.disponiveis = null; desenharDistribuicaoForm(); atualizarDisponiveis(); return; }
    if(t.dataset && t.dataset.dsSel !== undefined){
      t.checked ? x.sel.add(t.dataset.dsSel) : x.sel.delete(t.dataset.dsSel);
      if(!t.checked) delete x.qtd[t.dataset.dsSel];
      x.manual = false; recalc(); return;
    }
  });
  c.addEventListener('input', ev=>{
    if(E.vista !== 'distribuicao' || !f()) return;
    const t = ev.target, x = f();
    if(t.dataset && t.dataset.dsQtd !== undefined){ x.qtd[t.dataset.dsQtd] = t.value === '' ? '' : Number(t.value); x.manual = true; atualizarResumoDistribuicao(); return; }
    if(t.id === 'ds-rodada'){ x.porRodada = DIST.prefs.porRodada = t.value; atualizarResumoDistribuicao(); return; }
    if(t.id === 'ds-intervalo'){ x.intervalo = DIST.prefs.intervalo = t.value; atualizarResumoDistribuicao(); return; }
    if(t.id === 'ds-sup'){ x.sup = DIST.prefs.sup = t.value; return; }
  });
  c.addEventListener('click', async ev=>{
    if(E.vista !== 'distribuicao') return;
    if(ev.target.closest('#ds-igual') && f()){ dividirIgual(); desenharDistribuicaoForm(); return; }
    if(ev.target.closest('#ds-iniciar')){ iniciarDistribuicao(); return; }
    const can = ev.target.closest('[data-ds-cancelar]');
    if(can){
      if(!confirm('Cancelar o que ainda não foi entregue? Os leads que já caíram continuam com quem recebeu; os outros ficam como estavam.')) return;
      try{
        const r = await requisicao('api/distribuicao.php?acao=cancelar','POST',{ id:can.dataset.dsCancelar });
        torrada(`Cancelado. ${r.cancelados} ${plural(r.cancelados,'lead não foi entregue','leads não foram entregues')}.`);
        DIST.form = null;             // recomeça o formulário: os leads não entregues voltaram a estar disponíveis
        carregarDistribuicao();
      }catch(err){ torrada(erroAmigavel(err)); }
    }
  });
}
// enquanto a tela está aberta, o andamento se atualiza sozinho
setInterval(()=>{ if(E.vista==='distribuicao' && !document.hidden) carregarDistribuicao(); }, 5000);

/* ------------------------- ajustes ------------------------- */

function telaConfig(){
  const c = E.config || {};
  return `
  <div class="cabecalho"><div><h1>Ajustes</h1><p class="sub">Vale para toda a equipe.</p></div></div>
  <div class="painel" style="margin-bottom:14px">
    <div class="campo"><label for="cf-empresa">Nome da empresa</label><input id="cf-empresa" value="${esc(c.empresa||'')}"></div>
    <div class="campo"><label for="cf-estagios">Estágios do funil (um por linha, do primeiro ao último)</label>
      <textarea id="cf-estagios">${esc((c.estagios||ESTAGIOS_PADRAO).join('\n'))}</textarea></div>
    <div class="campo"><label for="cf-origens">Origens de lead (uma por linha)</label>
      <textarea id="cf-origens">${esc((c.origens||ORIGENS_PADRAO).join('\n'))}</textarea></div>
    <div class="campo"><label for="cf-localidades">Localidades (uma por linha)</label>
      <textarea id="cf-localidades" placeholder="Zona Norte&#10;Zona Sul">${esc(localidadesDisponiveis().join('\n'))}</textarea>
      <p class="sub" style="margin-top:5px">Viram as opções do campo Localidade do lead, do filtro e da importação. Leads que já têm uma localidade não mudam se você renomear ou tirar uma da lista. Deixando vazio, volta à lista padrão.</p></div>
    <p class="sub" style="margin-bottom:12px">O penúltimo estágio conta como fechamento e o último como perda nos números do painel. A lista de empreendimentos agora tem página própria, em <b>Empreendimentos</b>.</p>
    <button class="btn btn-primario" id="cf-salvar">Salvar ajustes</button>
  </div>`;
}

/* ------------------------- configurações pessoais ------------------------- */

function telaPerfil(){
  const u = E.eu;
  return `
  <div class="cabecalho"><div><h1>Configurações</h1><p class="sub">Só da sua conta — não afeta o resto da equipe.</p></div></div>

  <div class="painel" style="margin-bottom:14px">
    <h3>Meus dados</h3>
    <p class="sub" style="margin:4px 0 12px">Acesso: <b>${u.papel==='admin'?'Administração':'Corretor'}</b></p>
    <div class="duplas">
      <div class="campo"><label for="pf-nome">Nome</label><input id="pf-nome" value="${esc(u.nome||'')}"></div>
      <div class="campo"><label for="pf-email">E-mail</label><input id="pf-email" type="email" value="${esc(u.email||'')}"></div>
    </div>
    <button class="btn btn-primario" id="pf-salvar-dados">Salvar dados</button>
  </div>

  <div class="painel" style="margin-bottom:14px">
    <h3>Trocar senha</h3>
    <div class="duplas">
      <div class="campo"><label for="pf-senha">Nova senha</label><input id="pf-senha" type="password" minlength="8" autocomplete="new-password"></div>
      <div class="campo"><label for="pf-senha2">Confirmar nova senha</label><input id="pf-senha2" type="password" minlength="8" autocomplete="new-password"></div>
    </div>
    <p class="sub" style="margin-bottom:12px">Mínimo de 8 caracteres. Deixe em branco se não quiser trocar agora.</p>
    <button class="btn btn-primario" id="pf-salvar-senha">Trocar senha</button>
  </div>

  <div class="painel">
    <h3>Tema</h3>
    <p class="sub" style="margin-bottom:10px">Vale só para este navegador.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-min" data-tema="light">Claro</button>
      <button class="btn btn-min" data-tema="dark">Escuro</button>
      <button class="btn btn-min" data-tema="">Seguir o sistema</button>
    </div>
  </div>`;
}
document.addEventListener('click', ev=>{
  const t = ev.target.closest('[data-tema]');
  if(t){
    const v = t.dataset.tema;
    if(v) document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
    try{ v ? localStorage.setItem('cl_tema', v) : localStorage.removeItem('cl_tema'); }catch(e){}
  }
  if(ev.target.id === 'cf-salvar'){
    const estagios = $('#cf-estagios').value.split('\n').map(s=>s.trim()).filter(Boolean);
    const origens  = $('#cf-origens').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(estagios.length < 3){ torrada('Deixe pelo menos três estágios.'); return; }
    const localidades = [...new Set($('#cf-localidades').value.split('\n').map(s=>s.trim()).filter(Boolean))];
    refConfig().update({ empresa: $('#cf-empresa').value.trim(), estagios, origens, localidades })
      .then(()=>torrada('Ajustes salvos.')).catch(err=>torrada(erroAmigavel(err)));
  }
  if(ev.target.id === 'pf-salvar-dados'){
    const nome = $('#pf-nome').value.trim();
    const email = $('#pf-email').value.trim().toLowerCase();
    if(!nome || !email){ torrada('Nome e e-mail são obrigatórios.'); return; }
    const btn = ev.target, rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando…';
    refUsuarios().doc(E.eu.id).update({ nome, email })
      .then(()=>{ E.eu.nome = nome; E.eu.email = email; $('#meu-nome').textContent = nome; $('#meu-avatar').textContent = iniciais(nome); $('#meu-avatar-mob').textContent = iniciais(nome); torrada('Dados atualizados.'); })
      .catch(err=>torrada(erroAmigavel(err)))
      .finally(()=>{ btn.disabled = false; btn.textContent = rotulo; });
  }
  if(ev.target.id === 'pf-salvar-senha'){
    const senha = $('#pf-senha').value, senha2 = $('#pf-senha2').value;
    if(!senha){ torrada('Digite a nova senha.'); return; }
    if(senha.length < 8){ torrada('A senha precisa de 8 caracteres ou mais.'); return; }
    if(senha !== senha2){ torrada('As duas senhas não são iguais.'); return; }
    const btn = ev.target, rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando…';
    refUsuarios().doc(E.eu.id).update({ senha })
      .then(()=>{ $('#pf-senha').value=''; $('#pf-senha2').value=''; torrada('Senha alterada.'); })
      .catch(err=>torrada(erroAmigavel(err)))
      .finally(()=>{ btn.disabled = false; btn.textContent = rotulo; });
  }
});

/* ------------------------- partida ------------------------- */
try{ const t = localStorage.getItem('cl_tema'); if(t) document.documentElement.setAttribute('data-theme', t); }catch(e){}

iniciar().catch(err=>{
  console.error(err);
  $('#tela-carregando').innerHTML = '<div style="text-align:center;max-width:380px"><h2>Não deu para abrir</h2><p class="sub">Recarregue a página. Se insistir, veja o console do navegador.</p></div>';
});
