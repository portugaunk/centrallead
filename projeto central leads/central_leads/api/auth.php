<?php
/**
 * api/auth.php — login, cadastro e sessão.
 *
 *   GET  ?acao=sessao    quem está logado + o que as telas de acesso precisam saber
 *   POST ?acao=login     {email, senha}
 *   POST ?acao=cadastro  {nome, email, senha, empresa?}
 *   POST ?acao=sair
 *
 * A senha é conferida aqui, no servidor (password_hash / password_verify).
 * O navegador só guarda um cookie de sessão, que o JavaScript não consegue ler.
 */
require __DIR__ . '/comum.php';
iniciarSessao();
$pdo = conexao();
$acao = $_GET['acao'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];
$ip = $_SERVER['REMOTE_ADDR'] ?? '?';

function abrirSessao($u) {
  session_regenerate_id(true);
  $_SESSION['uid'] = $u['id'];
}

try {

  if ($acao === 'sessao' && $metodo === 'GET') {
    $u = usuarioAtual($pdo);
    $tem = (int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0;
    $empresa = $pdo->query('SELECT empresa FROM config_app WHERE id = 1')->fetchColumn();
    echo json_encode([
      'logado' => (bool)$u,
      'usuario' => $u ? usuarioPublico($u) : null,
      'temUsuarios' => $tem,
      'empresa' => $empresa ?: '',
      'exigeAprovacao' => CADASTRO_EXIGE_APROVACAO,
      'comoOutro' => isset($_SESSION['uid_admin'])
    ], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'login' && $metodo === 'POST') {
    exigirAjax();
    $d = corpoJson();
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $senha = (string)($d['senha'] ?? '');

    $chaveConta = $ip . '|' . $email;
    $chaveIp = $ip . '|*';
    if (count(falhasRecentes($chaveConta)) >= 6 || count(falhasRecentes($chaveIp)) >= 30) {
      erro(429, 'muitas_tentativas', 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.');
    }

    $st = $pdo->prepare('SELECT * FROM usuarios WHERE email = ?');
    $st->execute([$email]);
    $u = $st->fetch();

    if (!$u) {
      password_verify($senha, HASH_FALSO); // gasta o mesmo tempo de um e-mail que existe
      registrarFalha($chaveConta); registrarFalha($chaveIp);
      erro(401, 'credenciais', 'E-mail ou senha não conferem.');
    }
    if (!conferirSenha($u, $senha)) {
      registrarFalha($chaveConta); registrarFalha($chaveIp);
      erro(401, 'credenciais', 'E-mail ou senha não conferem.');
    }
    // A senha está certa, então dizer o motivo aqui não revela nada para um estranho.
    if (!$u['ativo']) {
      erro(403, 'aguardando_liberacao', 'Seu acesso ainda não foi liberado pela administração.');
    }
    if (precisaNovoHash($u)) {
      $pdo->prepare('UPDATE usuarios SET hash = ?, sal = ? WHERE id = ?')->execute([novoHash($senha), '', $u['id']]);
    }
    limparFalhas($chaveConta);
    abrirSessao($u);
    echo json_encode(['usuario' => usuarioPublico($u)], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'cadastro' && $metodo === 'POST') {
    exigirAjax();
    $d = corpoJson();
    $nome = trim((string)($d['nome'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $senha = (string)($d['senha'] ?? '');
    $empresa = trim((string)($d['empresa'] ?? ''));
    if ($nome === '' || strlen($nome) > 120) erro(400, 'nome_invalido', 'Informe seu nome.');
    validarEmail($email);
    validarSenha($senha);

    // Dois "primeiros acessos" ao mesmo tempo não podem virar duas administrações.
    $pdo->query("SELECT GET_LOCK('cl_cadastro', 10)");
    try {
      $primeiro = (int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() === 0;
      if ($primeiro && $empresa === '') erro(400, 'empresa_obrigatoria', 'Informe o nome da empresa.');

      $papel = $primeiro ? 'admin' : 'corretor';
      $ativo = ($primeiro || !CADASTRO_EXIGE_APROVACAO) ? 1 : 0;
      $novo = [
        'id' => gerarId(), 'nome' => $nome, 'email' => $email, 'papel' => $papel,
        'ativo' => $ativo, 'sal' => '', 'hash' => novoHash($senha)
      ];
      try {
        $pdo->beginTransaction();
        $pdo->prepare('INSERT INTO usuarios (id, nome, email, papel, ativo, sal, hash, criado_em) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$novo['id'], $nome, $email, $papel, $ativo, '', $novo['hash'], gmdate('Y-m-d\TH:i:s.000\Z')]);
        if ($primeiro) configInicial($pdo, $empresa);
        $pdo->commit();
      } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e->getCode() === '23000') erro(409, 'ja_existe', 'Já existe uma conta com esse e-mail. Tente entrar.');
        throw $e;
      }
    } finally {
      $pdo->query("SELECT RELEASE_LOCK('cl_cadastro')");
    }

    if ($ativo) abrirSessao($novo);
    echo json_encode([
      'usuario' => usuarioPublico($novo),
      'primeiroAcesso' => $primeiro,
      'pendente' => !$ativo
    ], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'entrar_como' && $metodo === 'POST') {
    exigirAjax();
    $eu = exigirLogin($pdo);
    // só quem está logado como administração pode entrar na conta de outra pessoa,
    // e só a partir da própria conta (sem "empilhar" uma troca dentro da outra)
    if (isset($_SESSION['uid_admin'])) erro(403, 'ja_trocado', 'Volte para a administração antes de trocar de novo.');
    exigirAdmin($eu);
    $d = corpoJson();
    $alvoId = (string)($d['usuarioId'] ?? '');
    if ($alvoId === $eu['id']) erro(400, 'alvo_invalido', 'Você já está na sua própria conta.');
    $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $st->execute([$alvoId]);
    $alvo = $st->fetch();
    if (!$alvo || !$alvo['ativo']) erro(404, 'nao_encontrado', 'Essa conta não existe ou está desativada.');
    $_SESSION['uid_admin'] = $eu['id'];
    session_regenerate_id(true);
    $_SESSION['uid'] = $alvo['id'];
    echo json_encode(['usuario' => usuarioPublico($alvo)], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'voltar_admin' && $metodo === 'POST') {
    exigirAjax();
    $adminId = $_SESSION['uid_admin'] ?? null;
    if (!$adminId) erro(400, 'sem_troca', 'Você não está em uma conta trocada.');
    $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $st->execute([$adminId]);
    $admin = $st->fetch();
    unset($_SESSION['uid_admin']);
    if (!$admin || !$admin['ativo']) erro(404, 'nao_encontrado', 'A conta de administração original não está mais disponível.');
    session_regenerate_id(true);
    $_SESSION['uid'] = $admin['id'];
    echo json_encode(['usuario' => usuarioPublico($admin)], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'sair' && $metodo === 'POST') {
    exigirAjax();
    $_SESSION = [];
    setcookie(session_name(), '', parametrosDoCookie(time() - 3600));
    session_destroy();
    echo json_encode(['ok' => true]);
  }

  else {
    erro(400, 'acao_invalida', 'Ação inválida.');
  }

} catch (PDOException $e) {
  error_log('[central-de-leads] ' . $e->getMessage());
  erro(500, 'erro_banco', 'Erro ao falar com o banco. Confira se o database.sql foi importado.');
}
