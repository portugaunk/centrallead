/* =====================================================================
   dados.js — camada de comunicação da Central de Leads
   ---------------------------------------------------------------------
   Fala com api/auth.php (login/cadastro/sessão) e api/dados.php (leads,
   usuários, config) pela interface de coleções/documentos que o app.js
   espera. Não há mais token para configurar: quem é você e o que você
   pode fazer é decidido no servidor, pela sessão de login.
   ===================================================================== */

const CAMINHO_API = 'api/dados.php';
const CAMINHO_AUTH = 'api/auth.php';

/** Uma requisição JSON. Erros viram Error com .code (o "erro" que o PHP devolveu). */
async function requisicao(url, metodo, corpo) {
  // sem limite de tempo, um servidor pendurado deixaria a tela em "Abrindo a central…" para sempre
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 15000);
  let resp;
  try {
    resp = await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controle.signal
    });
  } catch (e) {
    clearTimeout(relogio);
    const demorou = e && e.name === 'AbortError';
    const erro = new Error(demorou ? 'O servidor demorou demais para responder.' : 'Sem conexão com o servidor.');
    erro.code = demorou ? 'timeout' : 'unavailable';
    throw erro;
  }
  let texto = '', json = null;
  try { texto = await resp.text(); } catch (e) { texto = ''; }
  clearTimeout(relogio);
  // um BOM invisível no começo de um .php (comum ao editar no Bloco de Notas) não deve derrubar o app
  try { json = JSON.parse(texto.replace(/^\uFEFF/, '')); } catch (e) { json = null; }
  if (resp.ok && json === null) {
    // 200 mas não é JSON: o PHP não está rodando, ou imprimiu um aviso/erro antes da resposta
    const erro = new Error('A API respondeu algo que não é JSON.');
    erro.code = 'resposta_invalida';
    erro.trecho = texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    erro.entregouPhp = /^\s*<\?php/i.test(texto);
    throw erro;
  }
  if (!resp.ok) {
    const erro = new Error((json && json.mensagem) || ('erro HTTP ' + resp.status));
    erro.code = (json && json.erro) || 'unavailable';
    erro.status = resp.status;
    // sessão caiu (expirou, ou a administração desativou a conta): volta para o login
    if (erro.code === 'nao_autenticado' && !document.body.dataset.pagina) {
      window.location.replace('login.html');
    }
    throw erro;
  }
  return json;
}

const Auth = {
  sessao: function () { return requisicao(CAMINHO_AUTH + '?acao=sessao', 'GET'); },
  login: function (email, senha) { return requisicao(CAMINHO_AUTH + '?acao=login', 'POST', { email: email, senha: senha }); },
  cadastrar: function (dados) { return requisicao(CAMINHO_AUTH + '?acao=cadastro', 'POST', dados); },
  sair: function () { return requisicao(CAMINHO_AUTH + '?acao=sair', 'POST', {}); },
  entrarComo: function (usuarioId) { return requisicao(CAMINHO_AUTH + '?acao=entrar_como', 'POST', { usuarioId: usuarioId }); },
  voltarAdmin: function () { return requisicao(CAMINHO_AUTH + '?acao=voltar_admin', 'POST', {}); },
  /** Para onde cada perfil vai depois de entrar. */
  destino: function (usuario) { return usuario && usuario.papel === 'admin' ? 'admin.html' : 'painel.html'; }
};

const Banco = (function () {
  const ouvintesPorChave = new Map(); // 'colecao' ou 'colecao/id' -> Set de callbacks
  const relogios = new Map();         // mesma chave -> intervalId
  const buscadores = new Map();       // mesma chave -> função que busca o dado atual
  const cutucaTimers = new Map();     // coleção -> timer de atualização imediata
  const INTERVALO_MS = 4000;

  function chamar(metodo, colecao, id, corpo, modo) {
    let url = CAMINHO_API + '?colecao=' + encodeURIComponent(colecao);
    if (id) url += '&id=' + encodeURIComponent(id);
    if (modo) url += '&modo=' + modo;
    return requisicao(url, metodo, corpo);
  }

  function novoId() {
    return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function partir(caminho) {
    const p = String(caminho).split('/').filter(Boolean);
    const id = p.pop();
    return [p.join('/'), id];
  }

  function comecarRelogio(chave, buscar) {
    buscadores.set(chave, buscar);
    if (relogios.has(chave)) return;
    const id = setInterval(async () => {
      const grupo = ouvintesPorChave.get(chave);
      if (!grupo || grupo.size === 0) { clearInterval(id); relogios.delete(chave); return; }
      try {
        const dado = await buscar();
        grupo.forEach(cb => { try { cb(dado); } catch (e) {} });
      } catch (e) { /* falha passageira de rede — tenta de novo no próximo ciclo */ }
    }, INTERVALO_MS);
    relogios.set(chave, id);
  }

  /** Depois de gravar, busca de novo na hora em vez de esperar o próximo ciclo de 4 s. */
  async function atualizarAgora(colecao) {
    for (const [chave, buscar] of buscadores) {
      if (chave !== colecao && !chave.startsWith(colecao + '/')) continue;
      const grupo = ouvintesPorChave.get(chave);
      if (!grupo || grupo.size === 0) continue;
      try {
        const dado = await buscar();
        grupo.forEach(cb => { try { cb(dado); } catch (e) {} });
      } catch (e) { /* o próximo ciclo tenta de novo */ }
    }
  }
  function cutucar(colecao) {
    clearTimeout(cutucaTimers.get(colecao));
    cutucaTimers.set(colecao, setTimeout(() => atualizarAgora(colecao), 300));
  }

  function inscrever(chave, cb, buscarInicial) {
    if (!ouvintesPorChave.has(chave)) ouvintesPorChave.set(chave, new Set());
    ouvintesPorChave.get(chave).add(cb);
    buscarInicial().then(dado => cb(dado)).catch(()=>{});
    comecarRelogio(chave, buscarInicial);
    return function () {
      const grupo = ouvintesPorChave.get(chave);
      if (grupo) grupo.delete(cb);
    };
  }

  function instantaneoDoc(colecao, id, resposta) {
    return {
      id: id,
      exists: !!(resposta && resposta.existe),
      data: function () { return resposta && resposta.existe ? resposta.dados : undefined; },
      metadata: { fromCache: false, hasPendingWrites: false }
    };
  }
  function instantaneoColecao(resposta) {
    const docs = (resposta && resposta.itens ? resposta.itens : []).map(function (it) {
      return {
        id: it.id, exists: true,
        data: function () { return it.dados; },
        metadata: { fromCache: false, hasPendingWrites: false }
      };
    });
    return { docs: docs, size: docs.length, empty: docs.length === 0,
             metadata: { fromCache: false, hasPendingWrites: false } };
  }

  function doc(caminho) {
    const partes = partir(caminho);
    const colecao = partes[0], id = partes[1];

    return {
      id: id,
      path: caminho,
      get: async function () {
        const r = await chamar('GET', colecao, id);
        return instantaneoDoc(colecao, id, r);
      },
      set: async function (dados) {
        await chamar('PUT', colecao, id, dados, 'set');
        cutucar(colecao);
      },
      update: async function (dados) {
        await chamar('PUT', colecao, id, dados, 'update');
        cutucar(colecao);
      },
      delete: async function () {
        await chamar('DELETE', colecao, id);
        cutucar(colecao);
      },
      onSnapshot: function (cb) {
        return inscrever(colecao + '/' + id, function (r) { cb(instantaneoDoc(colecao, id, r)); },
          async function () { return chamar('GET', colecao, id); });
      },
      collection: function (sub) { return collection(caminho + '/' + sub); }
    };
  }

  function collection(nome) {
    const consulta = {
      path: nome,
      limit: function () { return consulta; },
      orderBy: function () { return consulta; },
      where: function () { return consulta; },
      get: async function () {
        const r = await chamar('GET', nome, null);
        return instantaneoColecao(r);
      },
      onSnapshot: function (cb) {
        return inscrever(nome, function (r) { cb(instantaneoColecao(r)); },
          async function () { return chamar('GET', nome, null); });
      },
      doc: function (id) { return doc(nome + '/' + (id || novoId())); },
      add: async function (dados) {
        const r = await chamar('POST', nome, null, dados);
        cutucar(nome);
        return doc(nome + '/' + r.id);
      }
    };
    return consulta;
  }

  /**
   * Muda vários leads numa chamada só (responsável e/ou localidade). Diferente de doc().set() em loop,
   * é uma transação no servidor e devolve {alterados, jaEstavam, ignorados}; se algo falhar, lança o erro.
   */
  async function lote(colecao, corpo) {
    const r = await requisicao(CAMINHO_API + '?colecao=' + encodeURIComponent(colecao) + '&acao=lote', 'POST', corpo);
    cutucar(colecao);
    return r;
  }

  return { collection: collection, doc: doc, lote: lote };
})();
