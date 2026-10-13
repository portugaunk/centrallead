/* =====================================================================
   acesso.js — entrada.html (porta de entrada), login.html e cadastro.html
   O que cada página faz é escolhido por <body data-pagina="...">.
   ===================================================================== */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pagina = document.body.dataset.pagina;

  function motivoDaFalha(err) {
    const c = err && err.code;
    if (c === 'sem_conexao') return 'O banco não aceitou a conexão — confira usuário, senha e nome do banco em api/conexao.php.';
    if (c === 'erro_banco') return 'O banco respondeu com erro. Confira se o database.sql foi importado.';
    if (c === 'timeout') return 'O servidor demorou mais de 15 segundos para responder. Se o host do banco estiver errado em api/conexao.php, é isso que acontece.';
    if (c === 'resposta_invalida' && err.entregouPhp) return 'O servidor entregou o CÓDIGO do PHP em vez de executá-lo. Este sistema precisa de um servidor com PHP (a hospedagem, ou "php -S localhost:8080" na pasta). Abrir os arquivos direto, ou por Live Server / servidor só de arquivos, não funciona.';
    if (c === 'resposta_invalida') return 'A API respondeu algo que não é JSON' + (err.trecho ? ': "' + err.trecho + '"' : '') + '. Isso costuma ser um erro ou aviso de PHP, ou um arquivo da pasta api com problema.';
    return 'Não consegui falar com a API. Confira se a pasta api foi enviada e se o PHP está ativo.';
  }

  function revelar() {
    $('#tela-carregando').classList.add('oculto');
    $('#tela-conteudo').classList.remove('oculto');
  }

  function erroDeConexao(err) {
    $('#tela-carregando').innerHTML =
      '<div style="max-width:440px;text-align:center"><h2>Não consegui abrir a central</h2>' +
      '<p class="sub">' + esc(motivoDaFalha(err)) + '</p>' +
      '<button class="btn btn-primario" id="btn-de-novo" style="margin-top:14px">Tentar de novo</button></div>';
    $('#btn-de-novo').addEventListener('click', () => location.reload());
  }

  // Senha viaja no cadastro e no login: sem HTTPS ela pode ser interceptada na rede.
  function avisoHttps() {
    const alvo = $('#aviso-https');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (alvo && location.protocol === 'http:' && !local) {
      alvo.innerHTML = '<div class="erro">Esta página está sem HTTPS, então a senha pode ser lida por quem estiver na mesma rede. Ative o SSL grátis da hospedagem e acesse por https://.</div>';
    }
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
    try { return await Auth.sessao(); }
    catch (err) { erroDeConexao(err); return null; }
  }

  /* ------------------------- entrada.html ------------------------- */
  async function iniciarEntrada() {
    const s = await lerSessao(); if (!s) return;
    if (s.logado) { location.replace(Auth.destino(s.usuario)); return; }
    if (!s.temUsuarios) { location.replace('cadastro.html'); return; }
    $('#entrada-empresa').textContent = s.empresa || '';
    revelar();
  }

  /* ------------------------- login.html ------------------------- */
  async function iniciarLogin() {
    const s = await lerSessao(); if (!s) return;
    if (s.logado) { location.replace(Auth.destino(s.usuario)); return; }
    if (!s.temUsuarios) { location.replace('cadastro.html'); return; }
    $('#login-empresa').textContent = s.empresa || '';
    avisoHttps(); ligarMostrarSenha(); revelar();

    $('#form-login').addEventListener('submit', async ev => {
      ev.preventDefault();
      const caixa = $('#erro-login'); caixa.innerHTML = '';
      const btn = $('#btn-entrar'); btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        const r = await Auth.login($('#l-email').value.trim().toLowerCase(), $('#l-senha').value);
        location.replace(Auth.destino(r.usuario));
      } catch (err) {
        const texto = err.code === 'unavailable' ? 'Não consegui falar com o servidor. Tente de novo.' : err.message;
        const classe = err.code === 'aguardando_liberacao' ? 'ok' : 'erro';
        caixa.innerHTML = '<div class="' + classe + '">' + esc(texto) + '</div>';
        $('#l-senha').value = '';
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  /* ------------------------- cadastro.html ------------------------- */
  async function iniciarCadastro() {
    const s = await lerSessao(); if (!s) return;
    if (s.logado) { location.replace(Auth.destino(s.usuario)); return; }

    const primeiro = !s.temUsuarios;
    if (primeiro) {
      $('#faixa-primeiro').classList.remove('oculto');
      $('#campo-empresa').classList.remove('oculto');
      $('#c-empresa').required = true;
      $('#cad-explica').textContent = 'Crie a conta de administração. Ela cadastra a equipe, importa planilhas, adiciona leads e vê tudo que acontece na central.';
      $('#btn-cadastrar').textContent = 'Criar administração';
      $('#cad-rodape').classList.add('oculto');   // ainda não existe conta para entrar
    } else {
      $('#cad-empresa').textContent = s.empresa || '';
      $('#cad-explica').textContent = s.exigeAprovacao
        ? 'Depois de cadastrar, a administração precisa liberar o seu acesso. Com ele, você vê os leads atribuídos a você e as suas métricas.'
        : 'Com a conta, você vê os leads atribuídos a você e as suas métricas.';
    }
    avisoHttps(); ligarMostrarSenha(); revelar();

    $('#form-cadastro').addEventListener('submit', async ev => {
      ev.preventDefault();
      const caixa = $('#erro-cadastro'); caixa.innerHTML = '';
      const senha = $('#c-senha').value;
      if (senha !== $('#c-senha2').value) {
        caixa.innerHTML = '<div class="erro">As duas senhas não são iguais.</div>'; return;
      }
      const rotulo = $('#btn-cadastrar').textContent;
      const btn = $('#btn-cadastrar'); btn.disabled = true; btn.textContent = 'Criando…';
      try {
        const r = await Auth.cadastrar({
          nome: $('#c-nome').value.trim(),
          email: $('#c-email').value.trim().toLowerCase(),
          senha: senha,
          empresa: primeiro ? $('#c-empresa').value.trim() : ''
        });
        if (r.pendente) {
          $('#form-cadastro').classList.add('oculto');
          $('#cad-pendente').classList.remove('oculto');
          return;
        }
        location.replace(Auth.destino(r.usuario));
      } catch (err) {
        let texto = err.code === 'unavailable' ? 'Não consegui falar com o servidor. Tente de novo.' : err.message;
        let extra = err.code === 'ja_existe' ? ' <a href="login.html">Ir para o login</a>.' : '';
        caixa.innerHTML = '<div class="erro">' + esc(texto) + extra + '</div>';
        btn.disabled = false; btn.textContent = rotulo;
      }
    });
  }

  const inicio = { entrada: iniciarEntrada, login: iniciarLogin, cadastro: iniciarCadastro }[pagina];
  if (inicio) inicio();
})();
