<?php
/**
 * api/comum.php — o que auth.php e dados.php têm em comum:
 * sessão de login no servidor, respostas de erro, leitura do corpo JSON
 * e as checagens de "está logado?" e "é administração?".
 */
// Avisos do PHP na tela corromperiam a resposta JSON; eles vão para o log de erros da hospedagem.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

require __DIR__ . '/conexao.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const DIAS_DE_SESSAO = 30;
// Hash de mentira, só para o login gastar o mesmo tempo quando o e-mail não existe.
const HASH_FALSO = '$2y$10$U3243crvIaTqCtzHaDzZNO5Kp0bY/6EnNUWU6Yz/d/1ruvrN5efQu';

function erro($codigo, $chave, $mensagem) {
  http_response_code($codigo);
  echo json_encode(['erro' => $chave, 'mensagem' => $mensagem], JSON_UNESCAPED_UNICODE);
  exit;
}

function gerarId() { return bin2hex(random_bytes(10)); }

function corpoJson() {
  $dados = json_decode(file_get_contents('php://input'), true);
  if (!is_array($dados)) erro(400, 'corpo_invalido', 'O corpo da requisição precisa ser um objeto JSON.');
  return $dados;
}

/** Escritas só valem se vierem do nosso próprio front-end (barreira simples contra CSRF). */
function exigirAjax() {
  if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') {
    erro(400, 'requisicao_invalida', 'Requisição inválida.');
  }
}

function estaEmHttps() {
  return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function parametrosDoCookie($expira) {
  $base = str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/')));
  $base = ($base === '/' || $base === '.' || $base === '') ? '/' : rtrim($base, '/') . '/';
  return ['expires' => $expira, 'path' => $base, 'secure' => estaEmHttps(),
          'httponly' => true, 'samesite' => 'Lax'];
}

function iniciarSessao($nome = 'cl_sessao') {
  if (session_status() === PHP_SESSION_ACTIVE) {
    if (session_name() === $nome) return;
    session_write_close();   // troca de sessão no meio da mesma requisição (ex.: portal.php checando a sessão da equipe)
  }
  // Pasta própria: hospedagens compartilhadas limpam a pasta padrão em poucos minutos
  // e derrubariam o login. Se não der para criar, cai na pasta padrão do PHP.
  $dir = __DIR__ . '/_sessoes';
  if (!is_dir($dir)) {
    @mkdir($dir, 0700, true);
    @file_put_contents($dir . '/.htaccess', "Require all denied\n");
  }
  if (is_dir($dir) && is_writable($dir)) session_save_path($dir);
  $seg = 86400 * DIAS_DE_SESSAO;
  ini_set('session.gc_maxlifetime', (string)$seg);
  ini_set('session.gc_probability', '1');
  ini_set('session.gc_divisor', '100');
  ini_set('session.use_strict_mode', '1');
  ini_set('session.use_only_cookies', '1');
  $p = parametrosDoCookie(0);
  session_set_cookie_params(['lifetime' => $seg, 'path' => $p['path'], 'secure' => $p['secure'],
                             'httponly' => true, 'samesite' => 'Lax']);
  session_name($nome);
  session_start();
}

/** Devolve o usuário logado (linha do banco, sem hash) ou null. Renova o prazo do cookie. */
function usuarioAtual($pdo) {
  $id = $_SESSION['uid'] ?? null;
  if (!$id) return null;
  $st = $pdo->prepare('SELECT id, nome, email, papel, ativo FROM usuarios WHERE id = ?');
  $st->execute([$id]);
  $u = $st->fetch();
  if (!$u || !$u['ativo']) { unset($_SESSION['uid']); return null; }
  setcookie(session_name(), session_id(), parametrosDoCookie(time() + 86400 * DIAS_DE_SESSAO));
  return $u;
}

function exigirLogin($pdo) {
  $u = usuarioAtual($pdo);
  if (!$u) erro(401, 'nao_autenticado', 'Sua sessão expirou. Entre de novo.');
  return $u;
}

function exigirAdmin($eu) {
  if ($eu['papel'] !== 'admin') erro(403, 'sem_permissao', 'Só a administração pode fazer isso.');
}

function usuarioPublico($u) {
  return ['id' => $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'papel' => $u['papel']];
}

/* ---------------------------- senhas ---------------------------- */

function conferirSenha($usuario, $senha) {
  $h = $usuario['hash'];
  if ($h !== '' && $h[0] === '$') return password_verify($senha, $h);
  // Contas criadas na versão antiga: SHA-256 de "sal::senha". Aceita uma vez e converte.
  return $usuario['sal'] !== '' && hash_equals($h, hash('sha256', $usuario['sal'] . '::' . $senha));
}
function precisaNovoHash($usuario) {
  $h = $usuario['hash'];
  return $h === '' || $h[0] !== '$' || password_needs_rehash($h, PASSWORD_DEFAULT);
}
function novoHash($senha) { return password_hash($senha, PASSWORD_DEFAULT); }

function validarSenha($senha) {
  if (!is_string($senha) || strlen($senha) < 8) erro(400, 'senha_curta', 'A senha precisa ter pelo menos 8 caracteres.');
  if (strlen($senha) > 200) erro(400, 'senha_longa', 'Senha longa demais.');
}
/**
 * Telefone brasileiro só com dígitos e com país (55), ou '' se não der para discar.
 * Mesma regra de normalizarTelefone() em js/app.js: DDD + número (10 ou 11 dígitos) ganha o 55;
 * sem DDD (8 ou 9 dígitos) não vale; o 11º dígito, quando há, precisa ser 9 (celular).
 */
function normalizarTelefoneBr($bruto) {
  $d = preg_replace('/\D/', '', (string)$bruto);
  if ($d === '' || $d === null) return '';
  if (strpos($d, '00') === 0) $d = substr($d, 2);
  if (strlen($d) === 10 || strlen($d) === 11) $d = '55' . $d;
  if (strlen($d) !== 12 && strlen($d) !== 13) return '';
  if (substr($d, 0, 2) !== '55') return '';
  if ((int)substr($d, 2, 2) < 11) return '';                       // DDD válido começa em 11
  if (strlen($d) === 13 && $d[4] !== '9') return '';               // celular com 9 dígitos começa em 9
  return $d;
}

function validarEmail($email) {
  if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) erro(400, 'email_invalido', 'Esse e-mail não parece válido.');
}

/* ------------------- limite de tentativas de login ------------------- */

function arquivoLimite($chave) {
  $dir = __DIR__ . '/_sessoes';
  if (!is_dir($dir) || !is_writable($dir)) $dir = sys_get_temp_dir();
  return $dir . '/lim_' . sha1($chave);
}
function falhasRecentes($chave, $janela = 600) {
  $arq = arquivoLimite($chave);
  $lista = is_file($arq) ? (json_decode((string)@file_get_contents($arq), true) ?: []) : [];
  return array_values(array_filter($lista, fn($t) => $t > time() - $janela));
}
function registrarFalha($chave) {
  $lista = falhasRecentes($chave); $lista[] = time();
  @file_put_contents(arquivoLimite($chave), json_encode($lista), LOCK_EX);
}
function limparFalhas($chave) { @unlink(arquivoLimite($chave)); }

/* ------------------- configuração inicial da empresa ------------------- */

function configInicial($pdo, $empresa) {
  $estagios = ['Novo','Em contato','Qualificado','Visita','Proposta','Fechado','Perdido'];
  $origens  = ['Site','Instagram','Facebook','Google','Indicação','Portal','Telefone','Outro'];
  $modelos  = [
    ['m1','Primeiro contato','Olá {{primeiro_nome}}, tudo bem? Aqui é {{corretor}}, da {{empresa}}. Vi que você demonstrou interesse em {{interesse}}. Posso te mandar algumas opções por aqui?'],
    ['m2','Retomada','Oi {{primeiro_nome}}! Passando para saber se você ainda tem interesse em {{interesse}}. Consigo separar novidades que chegaram essa semana.'],
    ['m3','Confirmar visita','Oi {{primeiro_nome}}, confirmando nossa visita ao {{empreendimento}} no dia {{data_visita}}, às {{hora_visita}}. Qualquer imprevisto é só me chamar por aqui. Abraço, {{corretor}}.']
  ];
  $pdo->prepare('INSERT INTO config_app (id, empresa) VALUES (1, ?) ON DUPLICATE KEY UPDATE empresa = VALUES(empresa)')->execute([$empresa]);
  $pdo->exec('DELETE FROM estagios'); $pdo->exec('DELETE FROM origens'); $pdo->exec('DELETE FROM modelos_mensagem');
  $st = $pdo->prepare('INSERT INTO estagios (ordem, nome) VALUES (?,?)');
  foreach ($estagios as $i => $n) $st->execute([$i, $n]);
  $st = $pdo->prepare('INSERT INTO origens (ordem, nome) VALUES (?,?)');
  foreach ($origens as $i => $n) $st->execute([$i, $n]);
  $st = $pdo->prepare('INSERT INTO modelos_mensagem (id, ordem, nome, texto) VALUES (?,?,?,?)');
  foreach ($modelos as $i => $m) $st->execute([$m[0], $i, $m[1], $m[2]]);
}
