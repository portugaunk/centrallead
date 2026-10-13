/* =====================================================================
   portal.js — portal.html, entrar-cliente.html, cadastro-cliente.html
   e empreendimentos.html (a vitrine). Qual página é vem de
   <body data-pagina="...">, igual ao padrão de acesso.js/app.js.
   ===================================================================== */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pagina = document.body.dataset.pagina;
  const CAMINHO_PORTAL = 'api/portal.php';

  /* link do corretor: empreendimentos.html?c=ID. Guarda o ID aqui porque o cliente ainda vai criar conta/entrar (outras páginas). */
  try { const c = new URLSearchParams(location.search).get('c'); if (c && /^[a-f0-9]{20}$/i.test(c)) localStorage.setItem('cl_corretor', c.toLowerCase()); } catch (e) {}
  const corretorDoLink = () => { try { return localStorage.getItem('cl_corretor') || ''; } catch (e) { return ''; } };
  const formatarTelefone = n => { const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(String(n || '')); return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : (n || ''); };

  const Portal = {
    sessao: () => requisicao(CAMINHO_PORTAL + '?acao=sessao', 'GET'),
    cadastrar: dados => requisicao(CAMINHO_PORTAL + '?acao=cadastro', 'POST', dados),
    login: (email, senha) => requisicao(CAMINHO_PORTAL + '?acao=login', 'POST', { email, senha }),
    sair: () => requisicao(CAMINHO_PORTAL + '?acao=sair', 'POST', {}),
    interesse: dados => requisicao(CAMINHO_PORTAL + '?acao=interesse', 'POST', dados),
    favoritosDoServidor: () => requisicao(CAMINHO_PORTAL + '?acao=favoritos', 'GET'),
    favoritar: (empreendimentoId, ligado) => requisicao(CAMINHO_PORTAL + '?acao=favoritar', 'POST', { empreendimentoId, ligado }),
    mesclarFavoritos: ids => requisicao(CAMINHO_PORTAL + '?acao=favoritar', 'POST', { mesclar: ids }),
    empreendimentos: localidade => requisicao(
      CAMINHO_PORTAL + '?acao=empreendimentos' + (localidade ? '&localidade=' + encodeURIComponent(localidade) : ''), 'GET'
    )
  };

  function revelar() {
    const c = $('#tela-carregando'), t = $('#tela-conteudo');
    if (c) c.classList.add('oculto');
    if (t) t.classList.remove('oculto');
  }
  function erroDeConexao() {
    const c = $('#tela-carregando');
    if (!c) return;
    c.innerHTML = '<div style="max-width:420px;text-align:center;padding:0 20px"><h2>Não consegui abrir o portal</h2>' +
      '<p class="sub">Confira sua conexão e tente de novo.</p>' +
      '<button class="btn btn-primario" id="btn-de-novo" style="margin-top:14px">Tentar de novo</button></div>';
    $('#btn-de-novo').addEventListener('click', () => location.reload());
  }
  function ligarMostrarSenha() {
    document.querySelectorAll('.mostrar-senha').forEach(b => {
      b.addEventListener('click', () => {
        const campo = document.getElementById(b.dataset.alvo);
        const escondida = campo.type === 'password';
        campo.type = escondida ? 'text' : 'password';
        b.textContent = escondida ? 'Ocultar' : 'Mostrar';
      });
    });
  }
  async function lerSessao() {
    try { return await Portal.sessao(); }
    catch (err) { erroDeConexao(); return null; }
  }

  /* ------------------------- portal.html (frente) ------------------------- */
  async function iniciarPortal() {
    const s = await lerSessao(); if (!s) return;
    if (s.podeVerVitrine) {
      $('#cta-principal').href = 'empreendimentos.html';
      $('#cta-principal').textContent = 'Ver empreendimentos';
      $('#cta-secundario').classList.add('oculto');
      $('#topo-entrar').classList.add('oculto');
      $('#topo-criar').href = 'empreendimentos.html';
      $('#topo-criar').textContent = 'Ver empreendimentos';
      $('#cta-final').href = 'empreendimentos.html';
      $('#cta-final').textContent = 'Ver empreendimentos';
      $('#cta-final-2').classList.add('oculto');
    }
    revelar();
    try {
      const r = await requisicao(CAMINHO_PORTAL + '?acao=resumo', 'GET');
      const contar = (id, n) => { const el = $(id); el.dataset.contar = n; el.textContent = n; if (window.animarContagem && el.closest('.visivel')) window.animarContagem(el); };
      contar('#fd-total', r.total || 0); contar('#fd-regioes', (r.regioes || []).length);
      if (r.total > 0) {
        const alvo = s.podeVerVitrine ? 'empreendimentos.html' : 'cadastro-cliente.html';
        const n = (r.regioes || []).length;
        $('#hero-numeros').innerHTML =
          '<div><b>' + r.total + '</b><span>' + (r.total === 1 ? 'empreendimento' : 'empreendimentos') + '</span></div>' +
          (n ? '<div><b>' + n + '</b><span>' + (n === 1 ? 'região' : 'regiões') + '</span></div>' : '');
        $('#hero-numeros').classList.remove('oculto');
        if (n) {
          $('#regioes-chips').innerHTML = r.regioes.map(g =>
            '<a href="' + alvo + '">' + esc(g.nome) + '<small>' + g.total + '</small></a>').join('');
          $('#bloco-regioes').classList.remove('oculto');
        }
      }
    } catch (e) { /* o resumo é só enfeite: sem ele a página funciona igual */ }
  }

  /* ------------------------- entrar-cliente.html ------------------------- */
  async function iniciarLoginCliente() {
    const s = await lerSessao(); if (!s) return;
    if (s.podeVerVitrine) { location.replace('empreendimentos.html'); return; }
    ligarMostrarSenha(); revelar();
    $('#form-login-cliente').addEventListener('submit', async ev => {
      ev.preventDefault();
      const caixa = $('#erro-login-cliente'); caixa.innerHTML = '';
      const btn = $('#btn-entrar-cliente'); btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        await Portal.login($('#pl-email').value.trim().toLowerCase(), $('#pl-senha').value);
        location.replace('empreendimentos.html');
      } catch (err) {
        caixa.innerHTML = '<div class="erro">' + esc(err.message || 'Não consegui entrar.') + '</div>';
        $('#pl-senha').value = '';
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  /* ------------------------- cadastro-cliente.html ------------------------- */
  async function iniciarCadastroCliente() {
    const s = await lerSessao(); if (!s) return;
    if (s.podeVerVitrine) { location.replace('empreendimentos.html'); return; }
    ligarMostrarSenha(); revelar();
    $('#form-cadastro-cliente').addEventListener('submit', async ev => {
      ev.preventDefault();
      const caixa = $('#erro-cadastro-cliente'); caixa.innerHTML = '';
      const senha = $('#pc-senha').value;
      if (senha !== $('#pc-senha2').value) {
        caixa.innerHTML = '<div class="erro">As duas senhas não são iguais.</div>'; return;
      }
      const btn = $('#btn-cadastrar-cliente'); btn.disabled = true; btn.textContent = 'Criando…';
      try {
        await Portal.cadastrar({
          nome: $('#pc-nome').value.trim(),
          email: $('#pc-email').value.trim().toLowerCase(),
          telefone: $('#pc-telefone').value.trim(),
          senha: senha
        });
        location.replace('empreendimentos.html');
      } catch (err) {
        let texto = err.message || 'Não consegui criar a conta.';
        let extra = err.code === 'ja_existe' ? ' <a href="entrar-cliente.html">Ir para o login</a>.' : '';
        caixa.innerHTML = '<div class="erro">' + esc(texto) + extra + '</div>';
        btn.disabled = false; btn.textContent = 'Criar conta';
      }
    });
  }

  /* ------------------------- empreendimentos.html (vitrine) ------------------------- */
  /* Número do WhatsApp do consultor, só dígitos com país e DDD (ex.: '5511999999999').
     Vazio = ainda não configurado: o botão do WhatsApp fica desativado e o resto da janela
     de contato continua funcionando (copiar mensagem, abrir a página do empreendimento). */
  const WHATSAPP_CONSULTOR = '';
  const MAX_COMPARAR = 3;

  function linkSeguro(l) { return typeof l === 'string' && /^https?:\/\/\S+$/i.test(l.trim()) ? l.trim() : ''; }
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fundo = u => " style=\"background-image:url('" + esc(u).replace(/'/g, '') + "')\"";
  let todos = [], favoritos = [], comparar = [], vista = 'lista', mapaSel = null, clienteAtual = null;
  try { favoritos = JSON.parse(localStorage.getItem('cl_fav') || '[]'); } catch (e) {}
  function salvarFavoritos() { try { localStorage.setItem('cl_fav', JSON.stringify(favoritos)); } catch (e) {} }
  const ehFav = id => favoritos.indexOf(id) >= 0;
  function alternarFav(id) {
    favoritos = ehFav(id) ? favoritos.filter(x => x !== id) : favoritos.concat(id);
    salvarFavoritos();
    if (clienteAtual) Portal.favoritar(id, ehFav(id)).catch(() => {});   // guarda também na conta (se falhar, fica no navegador)
  }
  const ehComp = id => comparar.indexOf(id) >= 0;
  const fi = e => e.ficha || {};
  /* Preço vigente: depois de ficha.precoAte (último dia de validade da tabela) o valor some e vira "sob consulta" */
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const precoDe = f => (f && f.preco && (!f.precoAte || f.precoAte >= hojeISO())) ? f.preco : '';

  /* ---- leitura dos textos livres da ficha (preço, área, dormitórios, vagas) ---- */
  const numPt = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  function precoNum(t) {
    const m = String(t || '').match(/(\d[\d.]*(?:,\d+)?)/);
    if (!m) return null;
    let v = m[1];
    if (/milh/i.test(t)) return numPt(v) * 1e6;
    if (/\bmil\b/i.test(t)) return numPt(v) * 1e3;
    return numPt(v);
  }
  function numeros(t) { return (String(t || '').match(/\d+(?:,\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.'))); }
  function faixaArea(t) { const n = numeros(t); return n.length ? [Math.min.apply(null, n), Math.max.apply(null, n)] : null; }
  function qtdDorms(t) { return numeros(t); }
  function qtdVagas(t) { const n = numeros(t); return n.length ? n : (/vaga/i.test(t || '') && !/sem vaga/i.test(t || '') ? [1] : []); }
  /* "Rua X, 10 - Bairro, São Paulo - SP" → bairro e cidade (só quando o endereço segue esse formato) */
  function partesEndereco(end) {
    const m = String(end || '').match(/-\s*([^,\-]+?),\s*([^,\-]+?)\s*-\s*([A-Za-z]{2})\s*$/);
    return m ? { bairro: m[1].trim(), cidade: m[2].trim(), uf: m[3].toUpperCase() } : { bairro: '', cidade: '', uf: '' };
  }
  function enriquecer(e, ordem) {
    const f = fi(e), p = partesEndereco(e.endereco), ar = faixaArea(f.metragem);
    e._ordem = ordem; e._preco = precoNum(precoDe(f)); e._area = ar; e._dorms = qtdDorms(f.dormitorios); e._vagas = qtdVagas(f.vagas);
    e._bairro = p.bairro; e._cidade = p.cidade; e._uf = p.uf;
    e._busca = norm([e.nome, e.endereco, e.localidade, p.bairro, f.tipo].join(' '));
    return e;
  }
  const localTexto = e => {
    if (e._bairro) return e._bairro + (e._cidade ? ' · ' + e._cidade + (e._uf ? ' - ' + e._uf : '') : '');
    return e.endereco || e.localidade || '';
  };

  /* ---- rótulos ---- */
  const plural = (n, s, p) => n === 1 ? s : p;
  function rotDorms(v) { if (/dorm/i.test(v)) return v; const r = /^\s*1\s*(\(|$)/.test(v) ? ' dormitório' : ' dormitórios'; return /\(/.test(v) ? v.replace(/\s*\(/, r + ' (') : v + r; }
  function rotVagas(v) { return /vaga/i.test(v) ? v : v + (/^\s*1\s*(\(|$)/.test(v) ? ' vaga' : ' vagas'); }
  function rotArea(v) { return /m²|m2/i.test(v) ? v : v + ' m²'; }
  const brl = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');

  /* ---- ícones ---- */
  const svg = (d, extra) => '<svg viewBox="0 0 24 24" aria-hidden="true" ' + (extra || '') + '>' + d + '</svg>';
  const ICONE_FAV = svg('<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.800-8 11-8 11Z"/>');
  const ICONE_PIN = svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.800 12 21 12 21Z"/><circle cx="12" cy="9.500" r="2.500"/>');
  const ICONE_PLANTA = '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p" d="M52 52V12H12v40h16"/><path class="a" d="M28 52V28a24 24 0 0 1 24 24"/></svg>';
  const ICONES_LAZER = [
    [/piscina|raia|aqu[aá]tic/i, '<path d="M3 17c2 0 2-1.500 4.500-1.500S10 17 12 17s2-1.500 4.500-1.500S19 17 21 17"/><path d="M3 21c2 0 2-1.500 4.500-1.500S10 21 12 21s2-1.500 4.500-1.500S19 21 21 21"/><path d="M8 13V5a2 2 0 0 1 4 0M16 13V5a2 2 0 0 0-2-2"/><path d="M8 9h8"/>'],
    [/academia|fitness|muscula|gin[aá]stica/i, '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>'],
    [/sal[aã]o|festa|gourmet|espa[cç]o/i, '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0Z"/><path d="M12 13v8M8 21h8"/>'],
    [/playground|brinquedoteca|infantil|kids|crian/i, '<circle cx="12" cy="6" r="2.500"/><path d="M12 9v5M8 12l4 2 4-2M9 21l3-7 3 7"/>'],
    [/churrasq|grill|forno/i, '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M8 21l1-3M16 21l-1-3M9 3c-1 1.500 1 2 0 4M13 3c-1 1.500 1 2 0 4"/>'],
    [/verde|bosque|parque|jardim|horta|pomar|[aá]rvore/i, '<path d="M12 21v-7"/><path d="M12 14c-4 0-6-3-6-6 4 0 6 2 6 6Zm0 0c4 0 6-3 6-6-4 0-6 2-6 6Z"/>'],
    [/sauna|spa|relax/i, '<path d="M4 20h16M7 16c0-2 2-2 2-4s-2-2-2-4M12 16c0-2 2-2 2-4s-2-2-2-4M17 16c0-2 2-2 2-4s-2-2-2-4"/>'],
    [/quadra|esporte|sport|beach|t[eê]nis|campo/i, '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4v16"/>'],
    [/pet/i, '<circle cx="8" cy="9" r="1.500"/><circle cx="16" cy="9" r="1.500"/><circle cx="5" cy="14" r="1.500"/><circle cx="19" cy="14" r="1.500"/><path d="M12 13c-3 0-5 3-4 5s3 1 4 1 3 1 4-1-1-5-4-5Z"/>'],
    [/cinema|home|coworking|escrit|workspace|biciclet/i, '<rect x="4" y="5" width="16" height="11" rx="1"/><path d="M8 20h8M12 16v4"/>']
  ];
  const iconeLazer = t => svg((ICONES_LAZER.find(p => p[0].test(t)) || [0, '<path d="m5 12 5 5 9-10"/>'])[1]);

  /* ---- etiquetas de status ---- */
  function seloHtml(e) {
    if (!e.status) return '';
    const s = norm(e.status);
    const cls = /lancamento/.test(s) ? 'lanc' : /pronto/.test(s) ? 'pronto' : /ultim/.test(s) ? 'ultimas' : /obra/.test(s) ? 'obras' : '';
    return '<span class="selo ' + cls + '">' + esc(e.status.toUpperCase()) + '</span>';
  }

  function tagsDiferenciais(lista, limite) {
    const itens = (lista || []).filter(Boolean);
    if (!itens.length) return '';
    const mostrar = limite ? itens.slice(0, limite) : itens;
    const resto = limite && itens.length > limite ? itens.length - limite : 0;
    return '<div class="tags-diferenciais">' + mostrar.map(d => '<span class="tag-diferencial">' + esc(d) + '</span>').join('') +
      (resto ? '<span class="tag-diferencial tag-diferencial-mais">+' + resto + '</span>' : '') + '</div>';
  }

  /* sem foto, a capa é uma fachada desenhada: prédio com janelas, uma delas acesa (laranja) */
  function fachada(nome) {
    let h = 0; for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const cols = 4 + (h % 3), lin = 5 + ((h >> 3) % 3), acesa = (h >> 5) % (cols * lin);
    const L = 44, larg = cols * L + 16, alt = lin * 18 + 24, x0 = 200 - larg / 2, y0 = 178 - alt;
    let j = '';
    for (let i = 0; i < cols * lin; i++) {
      j += '<rect x="' + (x0 + 18 + (i % cols) * L) + '" y="' + (y0 + 12 + Math.floor(i / cols) * 18) + '" width="24" height="10" fill="' + (i === acesa ? 'var(--sinal)' : 'var(--linha-forte)') + '"/>';
    }
    return '<svg class="fachada" viewBox="0 0 400 178" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<rect width="400" height="178" fill="var(--acento-suave)"/><rect x="' + x0 + '" y="' + y0 + '" width="' + larg + '" height="' + alt + '" fill="var(--superficie)" stroke="var(--tinta)" stroke-width="2.5"/>' +
      j + '<path d="M0 176.500H400" stroke="var(--tinta)" stroke-width="3"/></svg>';
  }
  /* link da capa: aceita só http(s) e converte links de compartilhamento comuns (Drive, Dropbox) em link direto da imagem */
  function urlCapa(u) {
    u = linkSeguro(u);
    if (!u) return '';
    let m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/i) || u.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/i);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1600';
    if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(u)) return u.replace(/^https?:\/\/(www\.)?dropbox\.com/i, 'https://dl.dropboxusercontent.com').replace(/[?&]dl=0/, '');
    return u;
  }
  /* a fachada desenhada fica sempre por baixo; a foto vai por cima e, se o link falhar, sai de cena e a fachada aparece */
  const capaHtml = (e, selo, foto) => {
    const u = urlCapa(foto !== undefined ? foto : e.fotoCapa);
    return '<div class="capa-vitrine">' + fachada(e.nome) +
      (u ? '<img class="capa-img" src="' + esc(u) + '" alt="' + esc('Fachada do ' + e.nome) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') +
      (selo || '') + '</div>';
  };
  document.addEventListener('error', ev => {
    const t = ev.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('capa-img')) t.remove();
  }, true);

  /* ---- card ---- */
  function cartaoVitrine(e, i) {
    const f = fi(e);
    const specs = [];
    if (f.dormitorios) specs.push(['dorm', rotDorms(f.dormitorios)]);
    if (f.metragem) specs.push(['area', rotArea(f.metragem)]);
    if (f.vagas) specs.push(['vaga', rotVagas(f.vagas)]);
    return '<article class="cartao-vitrine" data-reveal style="--d:' + (((i || 0) % 3) * 0.09).toFixed(2) + 's" data-emp="' + e.id + '" tabindex="0" aria-label="' + esc(e.nome) + '">' +
      capaHtml(e, seloHtml(e)) +
      '<button class="fav" data-fav="' + e.id + '" aria-pressed="' + ehFav(e.id) + '" aria-label="' + (ehFav(e.id) ? 'Remover ' : 'Favoritar ') + esc(e.nome) + '">' + ICONE_FAV + '</button>' +
      '<div class="corpo-vitrine"><div><h3>' + esc(e.nome) + '</h3>' +
      (localTexto(e) ? '<div class="local">' + ICONE_PIN + '<span>' + esc(localTexto(e)) + '</span></div>' : '') + '</div>' +
      (specs.length ? '<ul class="specs">' + specs.map(s => '<li class="sp-' + s[0] + '">' + esc(s[1]) + '</li>').join('') + '</ul>' : '') +
      '<div class="preco">' + (precoDe(f) ? '<small>A partir de</small><b>' + esc(precoDe(f)) + '</b>' : '<small>Valores sob consulta</small>') + '</div>' +
      '<div class="acoes-card"><button class="btn btn-primario" data-ver="' + e.id + '">Ver empreendimento</button>' +
      '<button class="btn btn-comparar" data-comp="' + e.id + '" aria-pressed="' + ehComp(e.id) + '" title="Adicionar à comparação">Comparar</button></div>' +
      '</div></article>';
  }

  /* ---- filtros ---- */
  const F = { pmin: null, pmax: null, amin: null, amax: null, dorms: new Set(), vagas: new Set(), loc: '', bairro: '', status: '', tipo: '', fav: false, q: '' };
  const lerNum = id => { const v = $('#' + id).value.trim(); return v === '' ? null : Math.max(0, parseFloat(v)); };
  function filtrosAtivos() {
    let n = 0;
    if (F.pmin != null || F.pmax != null) n++;
    if (F.amin != null || F.amax != null) n++;
    if (F.dorms.size) n++;
    if (F.vagas.size) n++;
    ['loc', 'bairro', 'status', 'tipo'].forEach(k => { if (F[k]) n++; });
    return n;
  }
  function passa(e) {
    if (F.q && e._busca.indexOf(F.q) < 0) return false;
    if (F.fav && !ehFav(e.id)) return false;
    if (F.loc && e.localidade !== F.loc) return false;
    if (F.status && e.status !== F.status) return false;
    if (F.bairro && e._bairro !== F.bairro) return false;
    if (F.tipo && fi(e).tipo !== F.tipo) return false;
    if (F.pmin != null || F.pmax != null) {
      if (e._preco == null) return false;
      if (F.pmin != null && e._preco < F.pmin * 1000) return false;
      if (F.pmax != null && e._preco > F.pmax * 1000) return false;
    }
    if (F.amin != null || F.amax != null) {
      if (!e._area) return false;
      if (F.amin != null && e._area[1] < F.amin) return false;
      if (F.amax != null && e._area[0] > F.amax) return false;
    }
    if (F.dorms.size && !e._dorms.some(n => F.dorms.has(n >= 4 ? 4 : n))) return false;
    if (F.vagas.size && !e._vagas.some(n => F.vagas.has(n >= 3 ? 3 : n))) return false;
    return true;
  }
  const semNulo = (v, pad) => v == null ? pad : v;
  const ORDENS = {
    relevantes: (a, b) => a._ordem - b._ordem,
    'menor-preco': (a, b) => semNulo(a._preco, Infinity) - semNulo(b._preco, Infinity) || a._ordem - b._ordem,
    'maior-preco': (a, b) => semNulo(b._preco, -1) - semNulo(a._preco, -1) || a._ordem - b._ordem,
    'menor-area': (a, b) => semNulo(a._area && a._area[0], Infinity) - semNulo(b._area && b._area[0], Infinity) || a._ordem - b._ordem,
    'maior-area': (a, b) => semNulo(b._area && b._area[1], -1) - semNulo(a._area && a._area[1], -1) || a._ordem - b._ordem,
    recentes: (a, b) => b.id - a.id   /* sem data de cadastro na API: o id mais alto é o mais novo */
  };
  const resultado = () => todos.filter(passa).sort(ORDENS[$('#ordenar').value] || ORDENS.relevantes);

  function vazioHtml() {
    const semFav = F.fav && !favoritos.length;
    return '<div class="vazio" style="grid-column:1/-1"><b>' + (semFav ? 'Você ainda não guardou nenhum favorito' : 'Nenhum empreendimento encontrado') + '</b>' +
      (semFav ? 'Toque no coração de um empreendimento para guardá-lo aqui.' : 'Tire algum filtro ou busque por outro nome.') + '</div>';
  }

  /* ---- mapa (lista + mapa do empreendimento selecionado) ---- */
  function desenharMapa(itens) {
    if (!itens.some(e => e.id === mapaSel)) mapaSel = itens.length ? itens[0].id : null;
    $('#mapa-lista').innerHTML = itens.length ? itens.map((e, i) =>
      '<li><button class="mapa-item" data-mapa="' + e.id + '" aria-pressed="' + (e.id === mapaSel) + '"><span class="pino">' + (i + 1) + '</span>' +
      '<span><b>' + esc(e.nome) + '</b><small>' + esc(localTexto(e) || 'Endereço não informado') + '</small></span></button></li>').join('') :
      '<li class="vazio">Nenhum empreendimento para mostrar.</li>';
    const sel = itens.find(e => e.id === mapaSel);
    const fr = $('#mapa-iframe');
    if (sel) {
      const src = 'https://www.google.com/maps?q=' + encodeURIComponent((sel.endereco || sel.nome) + (sel._cidade ? '' : ', São Paulo, SP')) + '&output=embed';
      if (fr.getAttribute('src') !== src) fr.setAttribute('src', src);
      fr.classList.remove('oculto');
    } else { fr.removeAttribute('src'); fr.classList.add('oculto'); }
  }

  /* ---- recomendações: lógica simples com base nos favoritos (futuramente também buscas e interesses) ---- */
  function desenharRecomendados(itens) {
    const alvo = $('#recomendados');
    const favs = todos.filter(e => ehFav(e.id));
    const cand = todos.filter(e => !ehFav(e.id));
    if (!cand.length || vista !== 'lista' || /^#emp-/.test(location.hash)) { alvo.classList.add('oculto'); return; }
    const locs = new Set(favs.map(e => e.localidade).filter(Boolean)), sts = new Set(favs.map(e => e.status).filter(Boolean));
    const pontos = e => (locs.has(e.localidade) ? 2 : 0) + (sts.has(e.status) ? 1 : 0);
    const top = cand.slice().sort((a, b) => pontos(b) - pontos(a) || a._ordem - b._ordem).slice(0, 3);
    $('#rec-sub').textContent = favs.length ? 'Selecionados a partir da região e do estágio dos empreendimentos que você favoritou.' :
      'Destaques do portal. As sugestões passam a considerar seus favoritos assim que você guardar algum.';
    $('#grade-rec').innerHTML = top.map(cartaoVitrine).join('');
    alvo.classList.remove('oculto');
  }

  function atualizarContadores() {
    const nf = favoritos.filter(id => todos.some(e => e.id === id)).length;
    $('#nav-fav-n').textContent = nf; $('#nav-fav-n').classList.toggle('oculto', !nf);
    $('#chip-fav-n').textContent = nf ? '(' + nf + ')' : '';
    const na = filtrosAtivos();
    $('#filtros-n').textContent = na; $('#filtros-n').classList.toggle('oculto', !na);
    const bar = $('#barra-comparar');
    bar.classList.toggle('oculto', !comparar.length);
    $('#comparar-texto').textContent = comparar.length + ' de ' + MAX_COMPARAR + ' selecionados para comparar';
    $('#comparar-abrir').disabled = comparar.length < 2;
  }

  function desenharVitrine() {
    const itens = resultado();
    $('#contagem').textContent = itens.length + (itens.length === 1 ? ' empreendimento' : ' empreendimentos') + (F.fav ? ' nos favoritos' : '');
    $('#chip-favoritos').setAttribute('aria-pressed', F.fav);
    $('#grade-vitrine').innerHTML = itens.length ? itens.map(cartaoVitrine).join('') : vazioHtml();
    if (vista === 'mapa') desenharMapa(itens);
    desenharRecomendados(itens);
    atualizarContadores();
    if (window.observarRevelar) window.observarRevelar();
  }

  function indicadores() {
    const regs = new Set(todos.map(e => e.localidade).filter(Boolean));
    const tipos = new Set(todos.map(e => fi(e).tipo).filter(Boolean));
    const dorms = todos.reduce((a, e) => a.concat(e._dorms), []);
    const it = [[todos.length, plural(todos.length, 'empreendimento', 'empreendimentos')]];
    if (regs.size) it.push([regs.size, plural(regs.size, 'região', 'regiões')]);
    if (tipos.size) it.push([tipos.size, plural(tipos.size, 'tipo de imóvel', 'tipos de imóvel')]);
    else if (dorms.length) { const a = Math.min.apply(null, dorms), b = Math.max.apply(null, dorms); it.push([a === b ? a : a + ' a ' + b, 'dormitórios']); }
    $('#indicadores').innerHTML = it.map(p => '<div><b>' + esc(p[0]) + '</b><span>' + p[1] + '</span></div>').join('');
    $('#indicadores').classList.remove('oculto');
  }

  /* ---- janelas (contato e comparação) ---- */
  let fecharAtual = null;
  function abrirModal(titulo, corpo, classe) {
    const origem = document.activeElement;
    $('#area-modal').innerHTML = '<div class="fundo-modal"><div class="modal ' + (classe || '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">' +
      '<div class="modal-topo"><h2 id="modal-titulo">' + esc(titulo) + '</h2><button class="fechar" id="fechar-modal" aria-label="Fechar">×</button></div>' +
      '<div class="modal-corpo">' + corpo + '</div></div></div>';
    const fechar = () => { $('#area-modal').innerHTML = ''; document.removeEventListener('keydown', tecla); fecharAtual = null; if (origem && origem.focus) origem.focus(); };
    const tecla = ev => { if (ev.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    $('#fechar-modal').addEventListener('click', fechar);
    $('#fechar-modal').focus();
    $('.fundo-modal').addEventListener('click', ev => { if (ev.target.classList.contains('fundo-modal')) fechar(); });
    fecharAtual = fechar;
    return fechar;
  }

  function abrirContato(e) {
    const nome = clienteAtual ? clienteAtual.nome : '';
    const texto = 'Olá! ' + (nome ? 'Sou ' + nome + ' e t' : 'T') + 'enho interesse ' + (e ? 'no empreendimento ' + e.nome + (e._bairro ? ' (' + e._bairro + ')' : '') : 'nos empreendimentos do portal') + '. Pode me passar mais informações?';
    const zap = /^\d{10,15}$/.test(WHATSAPP_CONSULTOR) ? 'https://wa.me/' + WHATSAPP_CONSULTOR + '?text=' + encodeURIComponent(texto) : '';
    const podeEnviar = !!(clienteAtual && e);
    const doisDig = n => String(n).padStart(2, '0');
    const dataIso = d => d.getFullYear() + '-' + doisDig(d.getMonth() + 1) + '-' + doisDig(d.getDate());
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const limite = new Date(); limite.setDate(limite.getDate() + 90);
    const horas = []; for (let h = 8; h <= 19; h++) horas.push(doisDig(h) + ':00', doisDig(h) + ':30');
    abrirModal(e ? 'Tenho interesse' : 'Atendimento',
      '<p class="sub" style="margin-top:0">' + (e ? (podeEnviar ? 'Envie seu interesse em <b>' + esc(e.nome) + '</b> e um consultor entra em contato com você.' : 'Fale com um consultor sobre <b>' + esc(e.nome) + '</b>.') : 'Fale com um consultor para tirar dúvidas ou agendar uma conversa.') + '</p>' +
      (clienteAtual ? '<div class="contato-dados"><div><span>Seu nome</span><b>' + esc(clienteAtual.nome) + '</b></div><div><span>E-mail</span><b>' + esc(clienteAtual.email) + '</b></div>' +
        (!podeEnviar && clienteAtual.telefone ? '<div><span>Telefone</span><b>' + esc(formatarTelefone(clienteAtual.telefone)) + '</b></div>' : '') + '</div>' : '') +
      (podeEnviar ? '<div class="campo"><label for="contato-tel">Telefone / WhatsApp (com DDD)</label><input id="contato-tel" type="tel" maxlength="20" autocomplete="tel" placeholder="(11) 98888-7777" value="' + esc(formatarTelefone(clienteAtual.telefone)) + '"></div>' : '') +
      '<div class="campo"><label for="contato-msg">Mensagem</label><textarea id="contato-msg" maxlength="500">' + esc(texto) + '</textarea></div>' +
      (podeEnviar ? '<details class="contato-visita"><summary>Quer já pedir uma visita? (opcional)</summary><div class="duplas">' +
        '<div class="campo"><label for="contato-dia">Dia</label><input id="contato-dia" type="date" min="' + dataIso(amanha) + '" max="' + dataIso(limite) + '"></div>' +
        '<div class="campo"><label for="contato-hora">Horário</label><select id="contato-hora">' + horas.map(h => '<option' + (h === '10:00' ? ' selected' : '') + '>' + h + '</option>').join('') + '</select></div></div>' +
        '<p class="contato-nota" style="margin-top:0">É um pedido: o consultor confirma o dia e o horário com você.</p></details>' : '') +
      '<p class="contato-erro" id="contato-erro" role="alert" hidden></p>' +
      '<div class="contato-acoes">' +
      (podeEnviar ? '<button class="btn btn-primario" id="contato-enviar" type="button">Enviar meu interesse</button>' : '') +
      (zap ? '<a class="btn btn-zap" id="contato-zap" href="' + esc(zap) + '" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>'
           : (podeEnviar ? '' : '<button class="btn btn-zap" disabled title="O número do consultor ainda não foi configurado">Falar no WhatsApp</button>')) +
      '<button class="btn" id="contato-copiar" type="button">Copiar mensagem</button>' +
      (e && linkSeguro(e.link) ? '<a class="btn" href="' + esc(linkSeguro(e.link)) + '" target="_blank" rel="noopener noreferrer">Abrir página oficial</a>' : '') + '</div>' +
      (zap || podeEnviar ? '' : '<p class="contato-nota">O contato direto pelo WhatsApp será ativado quando o número do consultor for configurado. Enquanto isso, copie a mensagem e envie ao seu consultor.</p>'));
    const msg = $('#contato-msg');
    if (zap) msg.addEventListener('input', () => { $('#contato-zap').href = 'https://wa.me/' + WHATSAPP_CONSULTOR + '?text=' + encodeURIComponent(msg.value); });
    $('#contato-copiar').addEventListener('click', async ev => {
      try { await navigator.clipboard.writeText(msg.value); ev.currentTarget.textContent = 'Mensagem copiada'; }
      catch (err) { msg.select(); ev.currentTarget.textContent = 'Selecione e copie (Ctrl+C)'; }
    });
    if (!podeEnviar) return;
    $('#contato-enviar').addEventListener('click', async ev => {
      const btn = ev.currentTarget, erroEl = $('#contato-erro');
      const mostrarErro = t => { erroEl.textContent = t; erroEl.hidden = false; };
      erroEl.hidden = true;
      const dia = $('#contato-dia').value;
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const r = await Portal.interesse({
          empreendimentoId: e.id,
          telefone: $('#contato-tel').value,
          mensagem: msg.value.trim() !== texto ? msg.value.trim() : '',
          visita: dia ? { data: dia, hora: $('#contato-hora').value } : null,
          corretor: corretorDoLink()
        });
        $('#area-modal .modal-corpo').innerHTML =
          '<div class="contato-ok"><h3>Recebemos seu interesse!</h3><p>Um consultor vai falar com você no WhatsApp' + (r.visita ? ' para confirmar a visita' : '') + '. Você pode continuar olhando os empreendimentos.</p>' +
          '<div class="contato-acoes">' + (zap ? '<a class="btn btn-zap" href="' + esc(zap) + '" target="_blank" rel="noopener noreferrer">Falar agora no WhatsApp</a>' : '') +
          '<button class="btn btn-primario" id="contato-fechar" type="button">Continuar navegando</button></div></div>';
        $('#contato-fechar').addEventListener('click', () => $('#fechar-modal').click());
      } catch (err) {
        mostrarErro(err.message || 'Não consegui enviar agora. Tente de novo.');
        btn.disabled = false; btn.textContent = 'Enviar meu interesse';
      }
    });
  }

  function abrirComparacao() {
    const itens = comparar.map(id => todos.find(e => e.id === id)).filter(Boolean);
    if (itens.length < 2) return;
    const menor = Math.min.apply(null, itens.map(e => e._preco == null ? Infinity : e._preco));
    const linhas = [
      ['Preço inicial', e => precoDe(fi(e)) ? '<b class="' + (e._preco === menor ? 'melhor' : '') + '">' + esc(precoDe(fi(e))) + '</b>' : '—'],
      ['Área', e => fi(e).metragem ? esc(rotArea(fi(e).metragem)) : '—'],
      ['Dormitórios', e => fi(e).dormitorios ? esc(fi(e).dormitorios) : '—'],
      ['Vagas', e => fi(e).vagas ? esc(fi(e).vagas) : '—'],
      ['Lazer', e => (fi(e).lazer || []).length ? '<ul class="lista-simples">' + fi(e).lazer.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '—'],
      ['Localização', e => esc(localTexto(e) || '—')],
      ['Status da obra', e => e.status ? esc(e.status) : '—'],
      ['Entrega prevista', e => fi(e).entrega ? esc(fi(e).entrega) : '—']
    ];
    abrirModal('Comparar empreendimentos',
      '<div class="comp-rolagem"><table class="comp"><thead><tr><th></th>' + itens.map(e => '<th><div class="comp-cab">' + capaHtml(e, '') + '<b>' + esc(e.nome) + '</b>' +
        '<button class="btn btn-min" data-ver-comp="' + e.id + '">Ver empreendimento</button></div></th>').join('') + '</tr></thead><tbody>' +
      linhas.map(l => '<tr><th scope="row">' + l[0] + '</th>' + itens.map(e => '<td>' + l[1](e) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>', 'modal-largo');
    document.querySelectorAll('[data-ver-comp]').forEach(b => b.addEventListener('click', () => { fecharAtual && fecharAtual(); location.hash = 'emp-' + b.dataset.verComp; }));
  }

  /* ---- página do empreendimento (#emp-ID) ---- */
  function desenharDetalhe(e) {
    const f = fi(e), fotos = [e.fotoCapa].concat(f.galeria || []).map(urlCapa).filter(Boolean);
    const fatos = [['Área', f.metragem && rotArea(f.metragem)], ['Dormitórios', f.dormitorios], ['Vagas', f.vagas], ['Entrega prevista', f.entrega], ['Status da obra', e.status], ['Tipo', f.tipo]].filter(p => p[1]);
    const mapaUrl = e.endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.endereco) : '';
    const docs = (f.documentos || []).map(d => { const i = d.indexOf('|'); return { nome: d.slice(0, i).trim(), url: linkSeguro(d.slice(i + 1)) }; }).filter(d => d.nome && d.url);
    $('#detalhe-pagina').innerHTML =
      '<div class="det-pagina">' +
      '<nav class="det-voltar"><a href="#" id="det-voltar">← Todos os empreendimentos</a></nav>' +
      '<div class="det-topo"><div><div class="det-selos">' + seloHtml(e) + '</div><h1>' + esc(e.nome) + '</h1>' +
      (localTexto(e) || e.localidade ? '<p class="local">' + ICONE_PIN + '<span>' + esc([localTexto(e), e._bairro ? e.localidade : ''].filter(Boolean).join(' · ')) + '</span></p>' : '') + '</div></div>' +
      '<div class="det-galeria2" data-reveal><div id="det-capa">' + capaHtml(e, '', fotos[0]) + '</div>' +
      (fotos.length > 1 ? '<div class="det-miniaturas2">' + fotos.slice(0, 8).map((u, i) => '<button data-foto="' + i + '"' + fundo(u) + (i === 0 ? ' aria-current="true"' : '') + ' aria-label="Foto ' + (i + 1) + '"></button>').join('') + '</div>' : '') + '</div>' +
      '<div class="det-grid"><div class="det-principal">' +
      (fatos.length ? '<div class="det-ficha2" data-reveal>' + fatos.map(p => '<div><b>' + esc(p[1]) + '</b><span>' + p[0] + '</span></div>').join('') + '</div>' : '') +
      (e.descricao ? '<section class="det-bloco" data-reveal><h2>Sobre o empreendimento</h2><p>' + esc(e.descricao) + '</p></section>' : '') +
      ((f.tipologias || []).length ? '<section class="det-bloco" data-reveal><h2>Unidades e plantas</h2><ul class="plantas">' + f.tipologias.map(t => '<li>' + ICONE_PLANTA + '<span>' + esc(t) + '</span></li>').join('') + '</ul></section>' : '') +
      ((f.lazer || []).length ? '<section class="det-bloco" data-reveal><h2>Área de lazer</h2><ul class="lazer-cards">' + f.lazer.map(t => '<li>' + iconeLazer(t) + '<span>' + esc(t) + '</span></li>').join('') + '</ul></section>' : '') +
      ((e.diferenciais || []).length ? '<section class="det-bloco" data-reveal><h2>Na vizinhança</h2>' + tagsDiferenciais(e.diferenciais) + '</section>' : '') +
      (e.endereco ? '<section class="det-bloco" data-reveal><h2>Localização</h2><p>' + esc(e.endereco) + '</p>' +
        '<iframe class="mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mapa de ' + esc(e.nome) + '" src="https://www.google.com/maps?q=' + encodeURIComponent(e.endereco + (e._cidade ? '' : ', São Paulo, SP')) + '&output=embed"></iframe></section>' : '') +
      (docs.length ? '<section class="det-bloco" data-reveal><h2>Documentos</h2><ul class="docs">' + docs.map(d => '<li><a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + svg('<path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/>') + esc(d.nome) + '</a></li>').join('') + '</ul></section>' : '') +
      '</div><aside class="det-lateral2">' +
      '<div class="det-preco"><small>' + (precoDe(f) ? 'A partir de' : 'Valores') + '</small><b>' + (precoDe(f) ? esc(precoDe(f)) : 'Sob consulta') + '</b></div>' +
      '<div class="det-acoes"><button class="btn btn-cta" id="det-interesse">Tenho interesse</button>' +
      '<button class="btn" id="det-fav" aria-pressed="' + ehFav(e.id) + '">' + (ehFav(e.id) ? '♥ Nos favoritos' : '♡ Guardar nos favoritos') + '</button>' +
      '<button class="btn" id="det-comp" aria-pressed="' + ehComp(e.id) + '">' + (ehComp(e.id) ? 'Na comparação' : 'Adicionar à comparação') + '</button>' +
      (linkSeguro(e.link) ? '<a class="btn" href="' + esc(linkSeguro(e.link)) + '" target="_blank" rel="noopener noreferrer">Abrir página oficial</a>' : '') +
      (mapaUrl ? '<a class="btn" href="' + esc(mapaUrl) + '" target="_blank" rel="noopener noreferrer">Ver no mapa</a>' : '') +
      '</div></aside></div></div>';
    if (window.observarRevelar) window.observarRevelar();
    $('#det-voltar').addEventListener('click', ev => { ev.preventDefault(); history.length > 1 && document.referrer.indexOf(location.pathname) >= 0 ? history.back() : (location.hash = ''); });
    $('#det-interesse').addEventListener('click', () => abrirContato(e));
    $('#det-fav').addEventListener('click', ev => {
      alternarFav(e.id);
      ev.currentTarget.setAttribute('aria-pressed', ehFav(e.id));
      ev.currentTarget.textContent = ehFav(e.id) ? '♥ Nos favoritos' : '♡ Guardar nos favoritos';
      desenharVitrine();
    });
    $('#det-comp').addEventListener('click', ev => {
      alternarComparar(e.id);
      ev.currentTarget.setAttribute('aria-pressed', ehComp(e.id));
      ev.currentTarget.textContent = ehComp(e.id) ? 'Na comparação' : 'Adicionar à comparação';
    });
    document.querySelectorAll('[data-foto]').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('[data-foto]').forEach(x => x.removeAttribute('aria-current'));
      b.setAttribute('aria-current', 'true');
      $('#det-capa').innerHTML = capaHtml(e, '', fotos[+b.dataset.foto]);
    }));
  }

  function alternarComparar(id) {
    if (ehComp(id)) comparar = comparar.filter(x => x !== id);
    else if (comparar.length >= MAX_COMPARAR) { alert('Você pode comparar até ' + MAX_COMPARAR + ' empreendimentos. Tire um para adicionar outro.'); return; }
    else comparar = comparar.concat(id);
    document.querySelectorAll('[data-comp="' + id + '"]').forEach(b => b.setAttribute('aria-pressed', ehComp(id)));
    atualizarContadores();
  }

  /* ---- navegação entre lista e página do empreendimento ---- */
  function rota() {
    const m = location.hash.match(/^#emp-(\d+)$/);
    const e = m && todos.find(x => x.id === +m[1]);
    const det = $('#detalhe-pagina');
    const lista = ['.banner-marca', '.intro-vitrine', '.barra-vitrine', '#painel-filtros', '.linha-resultado', '#grade-vitrine', '#vista-mapa-area', '#recomendados'];
    if (e) {
      desenharDetalhe(e);
      det.classList.remove('oculto');
      lista.forEach(s => $(s).classList.add('oculto'));
      document.title = e.nome + ' — Portal do Cliente';
      window.scrollTo(0, 0);
    } else {
      det.classList.add('oculto'); det.innerHTML = '';
      $('.banner-marca').classList.remove('oculto'); $('.intro-vitrine').classList.remove('oculto'); $('.barra-vitrine').classList.remove('oculto');
      $('.linha-resultado').classList.remove('oculto');
      $('#painel-filtros').classList.toggle('oculto', $('#btn-filtros').getAttribute('aria-expanded') !== 'true');
      aplicarVista();
      document.title = 'Empreendimentos — Portal do Cliente';
    }
  }
  function aplicarVista() {
    const mapa = vista === 'mapa';
    $('#grade-vitrine').classList.toggle('oculto', mapa);
    $('#vista-mapa-area').classList.toggle('oculto', !mapa);
    $('#vista-lista').setAttribute('aria-pressed', !mapa);
    $('#vista-mapa').setAttribute('aria-pressed', mapa);
    desenharVitrine();
  }

  /* ---- ligações dos filtros ---- */
  function sincronizarFiltros() {
    F.q = norm($('#busca-vitrine').value);
    F.pmin = lerNum('f-preco-min'); F.pmax = lerNum('f-preco-max');
    F.amin = lerNum('f-area-min'); F.amax = lerNum('f-area-max');
    F.bairro = $('#f-bairro').value; F.tipo = $('#f-tipo').value;
  }
  function ligarFiltros() {
    $('#busca-vitrine').addEventListener('input', () => { sincronizarFiltros(); desenharVitrine(); });
    const regiao = v => { F.loc = v; $('#filtro-localidade').value = v; $('#f-localidade').value = v; desenharVitrine(); };
    const estagio = v => { F.status = v; $('#filtro-status').value = v; $('#f-status').value = v; desenharVitrine(); };
    $('#filtro-localidade').addEventListener('change', ev => regiao(ev.target.value));
    $('#f-localidade').addEventListener('change', ev => regiao(ev.target.value));
    $('#filtro-status').addEventListener('change', ev => estagio(ev.target.value));
    $('#f-status').addEventListener('change', ev => estagio(ev.target.value));
    ['f-preco-min', 'f-preco-max', 'f-area-min', 'f-area-max', 'f-bairro', 'f-tipo'].forEach(id =>
      $('#' + id).addEventListener('input', () => { sincronizarFiltros(); desenharVitrine(); }));
    document.querySelectorAll('.seg[data-grupo] button').forEach(b => b.addEventListener('click', () => {
      const g = b.parentElement.dataset.grupo, v = +b.dataset.v, conj = F[g];
      conj.has(v) ? conj.delete(v) : conj.add(v);
      b.setAttribute('aria-pressed', conj.has(v));
      desenharVitrine();
    }));
    $('#btn-filtros').addEventListener('click', ev => {
      const aberto = ev.currentTarget.getAttribute('aria-expanded') !== 'true';
      ev.currentTarget.setAttribute('aria-expanded', aberto);
      $('#painel-filtros').classList.toggle('oculto', !aberto);
    });
    $('#f-aplicar').addEventListener('click', () => {
      $('#btn-filtros').setAttribute('aria-expanded', 'false'); $('#painel-filtros').classList.add('oculto');
      $('#contagem').scrollIntoView({ block: 'nearest' });
    });
    $('#f-limpar').addEventListener('click', () => {
      ['f-preco-min', 'f-preco-max', 'f-area-min', 'f-area-max'].forEach(id => { $('#' + id).value = ''; });
      ['f-bairro', 'f-tipo'].forEach(id => { $('#' + id).value = ''; });
      F.dorms.clear(); F.vagas.clear();
      document.querySelectorAll('.seg[data-grupo] button').forEach(b => b.setAttribute('aria-pressed', 'false'));
      sincronizarFiltros(); regiao(''); estagio('');
    });
    const favFiltro = ligado => { F.fav = ligado; desenharVitrine(); };
    $('#chip-favoritos').addEventListener('click', () => favFiltro(!F.fav));
    $('#nav-fav').addEventListener('click', () => { location.hash = ''; setTimeout(() => { favFiltro(true); window.scrollTo(0, 0); }, 0); });
    $('#nav-atendimento').addEventListener('click', () => abrirContato(null));
    $('#ordenar').addEventListener('change', desenharVitrine);
    $('#vista-lista').addEventListener('click', () => { vista = 'lista'; aplicarVista(); });
    $('#vista-mapa').addEventListener('click', () => { vista = 'mapa'; aplicarVista(); });
    $('#comparar-limpar').addEventListener('click', () => { comparar = []; desenharVitrine(); });
    $('#comparar-abrir').addEventListener('click', abrirComparacao);
    window.addEventListener('hashchange', rota);
  }

  function ligarCartoes() {
    const clique = ev => {
      const f = ev.target.closest('[data-fav]');
      if (f) { alternarFav(+f.dataset.fav); if (F.fav) desenharVitrine(); else { document.querySelectorAll('[data-fav="' + f.dataset.fav + '"]').forEach(b => b.setAttribute('aria-pressed', ehFav(+f.dataset.fav))); desenharRecomendados(); atualizarContadores(); } return; }
      const c = ev.target.closest('[data-comp]');
      if (c) { alternarComparar(+c.dataset.comp); return; }
      const m = ev.target.closest('[data-mapa]');
      if (m) { mapaSel = +m.dataset.mapa; desenharMapa(resultado()); return; }
      const v = ev.target.closest('[data-emp],[data-ver]');
      if (v) location.hash = 'emp-' + (v.dataset.ver || v.dataset.emp);
    };
    ['#grade-vitrine', '#grade-rec', '#mapa-lista'].forEach(s => $(s).addEventListener('click', clique));
    ['#grade-vitrine', '#grade-rec'].forEach(s => $(s).addEventListener('keydown', ev => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-emp]')) { ev.preventDefault(); location.hash = 'emp-' + ev.target.dataset.emp; }
    }));
  }

  async function iniciarVitrine() {
    const s = await lerSessao(); if (!s) return;
    if (!s.podeVerVitrine) { location.replace('entrar-cliente.html'); return; }
    if (s.logadoEquipe) {
      $('#faixa-equipe').classList.remove('oculto');
      $('#faixa-equipe-nome').textContent = s.equipe.nome;
      $('#faixa-equipe-voltar').href = s.equipe.papel === 'admin' ? 'admin.html' : 'painel.html';
    }
    if (s.logadoCliente) {
      clienteAtual = s.cliente;
      $('#topo-cliente').classList.remove('oculto');
      $('#topo-cliente-nome').textContent = s.cliente.nome;
      $('#btn-sair-cliente').addEventListener('click', async () => {
        try { await Portal.sair(); } catch (e) {}
        location.replace('portal.html');
      });
    }
    const opcoes = (sel, lista) => lista.forEach(nome => { const o = document.createElement('option'); o.value = nome; o.textContent = nome; sel.appendChild(o); });
    opcoes($('#filtro-localidade'), s.localidades || []);
    opcoes($('#f-localidade'), s.localidades || []);
    ligarFiltros(); ligarCartoes();
    revelar();
    $('#grade-vitrine').innerHTML = '<div class="vazio" style="grid-column:1/-1">Carregando…</div>';
    try {
      const r = await Portal.empreendimentos('');
      todos = (r.itens || []).map(enriquecer);
      if (clienteAtual) {
        // 1ª vez nesta conta: sobe os favoritos que estavam só no navegador; depois a conta é a fonte
        try {
          const jaSincronizou = localStorage.getItem('cl_fav_conta') === clienteAtual.id;
          const r2 = (!jaSincronizou && favoritos.length) ? await Portal.mesclarFavoritos(favoritos) : await Portal.favoritosDoServidor();
          favoritos = (r2.ids || []).map(Number);
          localStorage.setItem('cl_fav_conta', clienteAtual.id);
        } catch (e) { /* sem a conta, vale o que está no navegador */ }
      }
      favoritos = favoritos.filter(id => todos.some(e => e.id === id));
      salvarFavoritos();
      const unicos = fn => Array.from(new Set(todos.map(fn).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const sts = unicos(e => e.status);
      opcoes($('#filtro-status'), sts); opcoes($('#f-status'), sts);
      opcoes($('#f-bairro'), unicos(e => e._bairro));
      const tipos = unicos(e => fi(e).tipo);
      opcoes($('#f-tipo'), tipos);
      $('#campo-tipo').classList.toggle('oculto', !tipos.length);
      indicadores();
      rota();
    } catch (err) {
      $('#grade-vitrine').innerHTML = '<div class="vazio" style="grid-column:1/-1"><b>Não consegui carregar os empreendimentos</b>' + esc(err.message || '') + '</div>';
    }
  }

  const inicio = {
    portal: iniciarPortal,
    'cliente-login': iniciarLoginCliente,
    'cliente-cadastro': iniciarCadastroCliente,
    vitrine: iniciarVitrine
  }[pagina];
  if (inicio) inicio();
})();
