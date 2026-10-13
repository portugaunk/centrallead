<?php
/**
 * api/portal.php — Portal do Cliente (vitrine dos empreendimentos).
 *
 * Cliente é uma conta separada de "usuarios" (tabela própria "clientes"):
 * não é da equipe, não passa por aprovação e não aparece em Equipe.
 * A sessão do cliente usa um cookie próprio ("cl_sessao_cliente"), diferente
 * do cookie da equipe ("cl_sessao" — ver api/auth.php), então dá para estar
 * logado nos dois ao mesmo tempo no mesmo navegador sem um atrapalhar o outro.
 *
 * Quem pode ver a vitrine: cliente logado OU alguém da equipe (admin/corretor)
 * já logado na central — a equipe não precisa de conta de cliente para olhar.
 *
 *   GET  ?acao=sessao          quem está logado (cliente e/ou equipe) + localidades
 *   POST ?acao=cadastro        {nome, email, senha, telefone?}
 *   POST ?acao=login           {email, senha}
 *   POST ?acao=sair
 *   GET  ?acao=empreendimentos[&localidade=Zona Norte]   lista da vitrine
 */
require __DIR__ . '/comum.php';
$pdo = conexao();
$acao = $_GET['acao'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];
$ip = $_SERVER['REMOTE_ADDR'] ?? '?';

const NOME_SESSAO_CLIENTE = 'cl_sessao_cliente';

function clientePublico($c) {
  return ['id' => $c['id'], 'nome' => $c['nome'], 'email' => $c['email'], 'telefone' => $c['telefone']];
}

function abrirSessaoCliente($c) {
  session_regenerate_id(true);
  $_SESSION['cid'] = $c['id'];
}

/** Cliente da sessão atual (linha do banco, sem hash) ou null. Renova o prazo do cookie. */
function clienteAtual($pdo) {
  $id = $_SESSION['cid'] ?? null;
  if (!$id) return null;
  $st = $pdo->prepare('SELECT id, nome, email, telefone, ativo FROM clientes WHERE id = ?');
  $st->execute([$id]);
  $c = $st->fetch();
  if (!$c || !$c['ativo']) { unset($_SESSION['cid']); return null; }
  setcookie(session_name(), session_id(), parametrosDoCookie(time() + 86400 * DIAS_DE_SESSAO));
  return $c;
}

/**
 * As colunas da vitrine em empreendimentos foram criadas depois da tabela em si
 * (mesma lógica de api/dados.php). Cuida sozinho de criar o que faltar.
 */
function garantirVitrinePortal($pdo) {
  static $pronto = false;
  if ($pronto) return;
  try {
    if (!$pdo->query("SHOW TABLES LIKE 'empreendimentos'")->fetch()) { $pronto = true; return; }
    foreach ([
      'localidade' => "ALTER TABLE empreendimentos ADD COLUMN localidade VARCHAR(80) NULL",
      'descricao'  => "ALTER TABLE empreendimentos ADD COLUMN descricao TEXT NULL",
      'foto_capa'  => "ALTER TABLE empreendimentos ADD COLUMN foto_capa VARCHAR(500) NULL",
      'status'     => "ALTER TABLE empreendimentos ADD COLUMN status VARCHAR(60) NULL",
      'diferenciais' => "ALTER TABLE empreendimentos ADD COLUMN diferenciais TEXT NULL",
      'ficha'      => "ALTER TABLE empreendimentos ADD COLUMN ficha TEXT NULL",
    ] as $coluna => $sql) {
      if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE '$coluna'")->fetch()) $pdo->exec($sql);
    }
    $pronto = true;
  } catch (PDOException $e) {
    error_log('[central-de-leads] portal (vitrine): ' . $e->getMessage());
    erro(503, 'esquema_vitrine', 'Não consegui preparar os campos da vitrine no banco. Importe migracao_empreendimentos_vitrine.sql no phpMyAdmin.');
  }
}

/** Favoritos ficam na conta do cliente (e não só no navegador). Tabela criada na primeira vez. */
function garantirFavoritos($pdo) {
  static $pronto = false;
  if ($pronto) return;
  $pdo->exec('CREATE TABLE IF NOT EXISTS clientes_favoritos (
                cliente_id      CHAR(20)    NOT NULL,
                empreendimento_id INT       NOT NULL,
                criado_em       VARCHAR(32) NOT NULL,
                PRIMARY KEY (cliente_id, empreendimento_id)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pronto = true;
}
function favoritosDoCliente($pdo, $clienteId) {
  garantirFavoritos($pdo);
  $st = $pdo->prepare('SELECT f.empreendimento_id FROM clientes_favoritos f
                         JOIN empreendimentos e ON e.id = f.empreendimento_id
                        WHERE f.cliente_id = ? ORDER BY f.criado_em ASC');
  $st->execute([$clienteId]);
  return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
}

/** Quando a visita pedida pelo cliente: "2026-10-20" + "14:30", de amanhã a 90 dias, das 8h às 19h. */
function dataHoraDaVisitaPedida($v) {
  if (!is_array($v)) return null;
  $dia = (string)($v['data'] ?? ''); $hora = (string)($v['hora'] ?? '');
  if ($dia === '' && $hora === '') return null;
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dia, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])
      || !preg_match('/^(\d{2}):(\d{2})$/', $hora, $h) || (int)$h[1] < 8 || (int)$h[1] > 19 || (int)$h[2] > 59) {
    erro(400, 'visita_data_invalida', 'Escolha um dia e um horário (entre 8h e 19h) para a visita.');
  }
  $fuso = new DateTimeZone('America/Sao_Paulo');
  $hoje = new DateTimeImmutable('today', $fuso);
  $quando = new DateTimeImmutable($dia . ' ' . $hora . ':00', $fuso);
  if ($quando < $hoje->modify('+1 day') || $quando > $hoje->modify('+90 days')) {
    erro(400, 'visita_fora_do_prazo', 'A visita precisa ser de amanhã em diante, em até 90 dias.');
  }
  return $quando->format('Y-m-d H:i:s');
}

try {

  if ($acao === 'sessao' && $metodo === 'GET') {
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $cliente = clienteAtual($pdo);
    session_write_close();

    iniciarSessao();   // sessão da equipe (cl_sessao), só para checar se alguém já está logado nela
    $equipe = usuarioAtual($pdo);
    session_write_close();

    try { $localidades = $pdo->query('SELECT nome FROM localidades ORDER BY ordem ASC')->fetchAll(PDO::FETCH_COLUMN); }
    catch (PDOException $e) { $localidades = []; }

    echo json_encode([
      'logadoCliente' => (bool)$cliente,
      'cliente' => $cliente ? clientePublico($cliente) : null,
      'logadoEquipe' => (bool)$equipe,
      'equipe' => $equipe ? ['nome' => $equipe['nome'], 'papel' => $equipe['papel']] : null,
      'podeVerVitrine' => (bool)$cliente || (bool)$equipe,
      'localidades' => $localidades
    ], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'resumo' && $metodo === 'GET') {
    // só contagens, sem nomes nem dados: aparece na página pública de entrada
    garantirVitrinePortal($pdo);
    $total = (int)$pdo->query('SELECT COUNT(*) FROM empreendimentos')->fetchColumn();
    $regioes = $pdo->query("SELECT localidade AS nome, COUNT(*) AS total FROM empreendimentos WHERE localidade IS NOT NULL AND localidade <> '' GROUP BY localidade ORDER BY total DESC")->fetchAll();
    echo json_encode(['total' => $total, 'regioes' => $regioes], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'cadastro' && $metodo === 'POST') {
    exigirAjax();
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $d = corpoJson();
    $nome = trim((string)($d['nome'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $telefone = trim((string)($d['telefone'] ?? ''));
    $senha = (string)($d['senha'] ?? '');
    if ($nome === '' || strlen($nome) > 120) erro(400, 'nome_invalido', 'Informe seu nome.');
    validarEmail($email);
    if ($telefone !== '') {
      $telefone = normalizarTelefoneBr($telefone);
      if ($telefone === '') erro(400, 'telefone_invalido', 'Telefone precisa do DDD. Ex.: (11) 98888-7777');
    }
    validarSenha($senha);

    $novo = [
      'id' => gerarId(), 'nome' => $nome, 'email' => $email,
      'telefone' => $telefone !== '' ? $telefone : null,
      'senha_hash' => novoHash($senha), 'ativo' => 1
    ];
    try {
      $pdo->prepare('INSERT INTO clientes (id, nome, email, telefone, senha_hash, ativo, criado_em) VALUES (?,?,?,?,?,1,?)')
          ->execute([$novo['id'], $nome, $email, $novo['telefone'], $novo['senha_hash'], gmdate('Y-m-d\TH:i:s.000\Z')]);
    } catch (PDOException $e) {
      if ($e->getCode() === '23000') erro(409, 'ja_existe', 'Já existe uma conta com esse e-mail. Tente entrar.');
      throw $e;
    }
    abrirSessaoCliente($novo);
    echo json_encode(['cliente' => clientePublico($novo)], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'login' && $metodo === 'POST') {
    exigirAjax();
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $d = corpoJson();
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $senha = (string)($d['senha'] ?? '');

    $chaveConta = 'cliente|' . $ip . '|' . $email;
    $chaveIp = 'cliente|' . $ip . '|*';
    if (count(falhasRecentes($chaveConta)) >= 6 || count(falhasRecentes($chaveIp)) >= 30) {
      erro(429, 'muitas_tentativas', 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.');
    }

    $st = $pdo->prepare('SELECT * FROM clientes WHERE email = ?');
    $st->execute([$email]);
    $c = $st->fetch();

    if (!$c || !password_verify($senha, $c['senha_hash'])) {
      if (!$c) password_verify($senha, HASH_FALSO);   // gasta o mesmo tempo de um e-mail que existe
      registrarFalha($chaveConta); registrarFalha($chaveIp);
      erro(401, 'credenciais', 'E-mail ou senha não conferem.');
    }
    if (!$c['ativo']) erro(403, 'inativo', 'Esta conta não está mais ativa.');
    limparFalhas($chaveConta);
    abrirSessaoCliente($c);
    echo json_encode(['cliente' => clientePublico($c)], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'sair' && $metodo === 'POST') {
    exigirAjax();
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $_SESSION = [];
    setcookie(session_name(), '', parametrosDoCookie(time() - 3600));
    session_destroy();
    echo json_encode(['ok' => true]);
  }

  elseif ($acao === 'favoritos' && $metodo === 'GET') {
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $cliente = clienteAtual($pdo);
    session_write_close();
    if (!$cliente) erro(401, 'nao_autenticado', 'Entre na sua conta.');
    echo json_encode(['ids' => favoritosDoCliente($pdo, $cliente['id'])]);
  }

  elseif ($acao === 'favoritar' && $metodo === 'POST') {
    // {empreendimentoId, ligado: true|false}  ou  {mesclar: [ids]} (traz os favoritos que estavam só no navegador)
    exigirAjax();
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $cliente = clienteAtual($pdo);
    session_write_close();
    if (!$cliente) erro(401, 'nao_autenticado', 'Entre na sua conta.');
    garantirFavoritos($pdo);
    $d = corpoJson();
    $agora = gmdate('Y-m-d\TH:i:s.000\Z');
    $ins = $pdo->prepare('INSERT IGNORE INTO clientes_favoritos (cliente_id, empreendimento_id, criado_em)
                          SELECT ?, id, ? FROM empreendimentos WHERE id = ?');
    if (isset($d['mesclar']) && is_array($d['mesclar'])) {
      foreach (array_slice($d['mesclar'], 0, 100) as $id) $ins->execute([$cliente['id'], $agora, (int)$id]);
    } else {
      $id = (int)($d['empreendimentoId'] ?? 0);
      if ($id <= 0) erro(400, 'empreendimento_invalido', 'Empreendimento inválido.');
      if (!empty($d['ligado'])) $ins->execute([$cliente['id'], $agora, $id]);
      else $pdo->prepare('DELETE FROM clientes_favoritos WHERE cliente_id = ? AND empreendimento_id = ?')->execute([$cliente['id'], $id]);
    }
    echo json_encode(['ids' => favoritosDoCliente($pdo, $cliente['id'])]);
  }

  elseif ($acao === 'interesse' && $metodo === 'POST') {
    // O cliente clicou em "Tenho interesse": vira lead na central (origem Portal), já ligado ao
    // empreendimento; opcionalmente já pede uma visita. Se o telefone já é de um lead, só soma ao histórico.
    exigirAjax();
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $cliente = clienteAtual($pdo);
    session_write_close();
    if (!$cliente) erro(401, 'nao_autenticado', 'Entre na sua conta para enviar seu interesse.');
    $d = corpoJson();

    $chaveLimite = 'interesse|' . $cliente['id'];
    if (count(falhasRecentes($chaveLimite)) >= 12) erro(429, 'muitos_pedidos', 'Você enviou vários pedidos seguidos. Aguarde alguns minutos ou fale direto com o consultor.');

    $st = $pdo->prepare('SELECT id, nome, localidade FROM empreendimentos WHERE id = ?');
    $st->execute([(int)($d['empreendimentoId'] ?? 0)]);
    $emp = $st->fetch();
    if (!$emp) erro(404, 'empreendimento_inexistente', 'Esse empreendimento não está mais na vitrine.');

    $digitado = trim((string)($d['telefone'] ?? ''));
    $tel = normalizarTelefoneBr($digitado !== '' ? $digitado : ($cliente['telefone'] ?? ''));   // digitou algo errado: não esconde o erro usando o do cadastro
    if ($tel === '') erro(400, 'telefone_invalido', 'Informe um telefone com DDD para o consultor falar com você. Ex.: (11) 98888-7777');
    if ($tel !== $cliente['telefone']) $pdo->prepare('UPDATE clientes SET telefone = ? WHERE id = ?')->execute([$tel, $cliente['id']]);

    $mensagem = trim((string)($d['mensagem'] ?? ''));
    $mensagem = function_exists('mb_substr') ? mb_substr($mensagem, 0, 500) : substr($mensagem, 0, 500);
    $quandoVisita = dataHoraDaVisitaPedida($d['visita'] ?? null);

    // link do corretor: ?c=ID na vitrine. Só vale se for gente ativa da equipe.
    $corretorId = null;
    $cid = trim((string)($d['corretor'] ?? ''));
    if ($cid !== '' && preg_match('/^[a-f0-9]{20}$/', $cid)) {
      $st = $pdo->prepare('SELECT id FROM usuarios WHERE id = ? AND ativo = 1');
      $st->execute([$cid]);
      if ($st->fetch()) $corretorId = $cid;
    }

    $favoritos = [];
    try {
      garantirFavoritos($pdo);
      $st = $pdo->prepare('SELECT e.nome FROM clientes_favoritos f JOIN empreendimentos e ON e.id = f.empreendimento_id
                            WHERE f.cliente_id = ? AND e.id <> ? ORDER BY f.criado_em ASC LIMIT 10');
      $st->execute([$cliente['id'], $emp['id']]);
      $favoritos = $st->fetchAll(PDO::FETCH_COLUMN);
    } catch (PDOException $e) { /* favoritos são só um complemento */ }

    $agora = gmdate('Y-m-d\TH:i:s.000\Z');
    $texto = 'Pediu contato sobre ' . $emp['nome'] . ' pelo Portal do Cliente.'
           . ($mensagem !== '' ? ' Mensagem: ' . $mensagem : '')
           . ($favoritos ? ' Também favoritou: ' . implode(', ', $favoritos) . '.' : '');
    $entrada = ['em' => $agora, 'por' => 'Portal do Cliente', 'tipo' => 'portal', 'texto' => $texto];

    $pdo->beginTransaction();
    try {
      $st = $pdo->prepare('SELECT id, historico, responsavel_id FROM leads WHERE telefone = ? ORDER BY criado_em DESC LIMIT 1');
      $st->execute([$tel]);
      $lead = $st->fetch();
      $leadNovo = false;

      if ($lead) {
        $hist = $lead['historico'] ? (json_decode($lead['historico'], true) ?: []) : [];
        // o mesmo pedido repetido em menos de 1 hora não duplica
        $repetido = false;
        foreach (array_slice($hist, -5) as $h) {
          if (($h['tipo'] ?? '') === 'portal' && ($h['texto'] ?? '') === $texto && strtotime($h['em'] ?? '') > time() - 3600) $repetido = true;
        }
        if (!$repetido) {
          $hist[] = $entrada;
          $resp = $lead['responsavel_id'] ?: $corretorId;
          $pdo->prepare('UPDATE leads SET historico = ?, atualizado_em = ?, responsavel_id = ? WHERE id = ?')
              ->execute([json_encode(array_slice($hist, -60), JSON_UNESCAPED_UNICODE), $agora, $resp, $lead['id']]);
        }
        $leadId = $lead['id'];
      } else {
        $leadNovo = true;
        $leadId = gerarId();
        $primeiro = $pdo->query('SELECT nome FROM estagios ORDER BY ordem ASC LIMIT 1')->fetchColumn() ?: 'Novo';
        $temLocal = (bool)$pdo->query("SHOW COLUMNS FROM leads LIKE 'localidade'")->fetch();
        $cols = ['id','nome','telefone','telefone_original','email','origem','interesse','valor','status','obs','responsavel_id','historico','criado_em','atualizado_em'];
        $vals = [$leadId, $cliente['nome'], $tel, $cliente['telefone'] ?: $tel, $cliente['email'], 'Portal', $emp['nome'], 0, $primeiro,
                 $mensagem !== '' ? $mensagem : null, $corretorId, json_encode([$entrada], JSON_UNESCAPED_UNICODE), $agora, $agora];
        if ($temLocal && $emp['localidade']) { $cols[] = 'localidade'; $vals[] = $emp['localidade']; }
        $pdo->prepare('INSERT INTO leads (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute($vals);
      }

      $visitaPedida = false;
      if ($quandoVisita) {
        $st = $pdo->prepare('SELECT id FROM visitas WHERE lead_id = ? AND empreendimento = ? AND data_hora = ?');
        $st->execute([$leadId, $emp['nome'], $quandoVisita]);
        if (!$st->fetch()) {
          $pdo->prepare('INSERT INTO visitas (id, lead_id, empreendimento, data_hora, status, obs, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)')
              ->execute([gerarId(), $leadId, $emp['nome'], $quandoVisita, 'agendada', 'Pedido feito pelo cliente no Portal. Confirmar dia e horário com ele.', $agora, $agora]);
        }
        $visitaPedida = true;
      }
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }
    registrarFalha($chaveLimite);   // aqui "falha" só quer dizer "um pedido": conta para o limite de 12 a cada 10 minutos
    echo json_encode(['ok' => true, 'leadNovo' => $leadNovo, 'visita' => $visitaPedida], JSON_UNESCAPED_UNICODE);
  }

  elseif ($acao === 'empreendimentos' && $metodo === 'GET') {
    iniciarSessao(NOME_SESSAO_CLIENTE);
    $cliente = clienteAtual($pdo);
    session_write_close();
    $equipe = null;
    if (!$cliente) {
      iniciarSessao();
      $equipe = usuarioAtual($pdo);
      session_write_close();
    }
    if (!$cliente && !$equipe) erro(401, 'nao_autenticado', 'Entre para ver os empreendimentos.');

    garantirVitrinePortal($pdo);
    $localidade = trim((string)($_GET['localidade'] ?? ''));
    if ($localidade !== '') {
      $st = $pdo->prepare('SELECT id, nome, endereco, link, localidade, descricao, foto_capa, status, diferenciais, ficha
                            FROM empreendimentos WHERE localidade = ? ORDER BY ordem ASC');
      $st->execute([$localidade]);
    } else {
      $st = $pdo->query('SELECT id, nome, endereco, link, localidade, descricao, foto_capa, status, diferenciais, ficha
                          FROM empreendimentos ORDER BY ordem ASC');
    }
    $itens = array_map(function ($e) {
      return [
        'id' => (int)$e['id'], 'nome' => $e['nome'], 'endereco' => $e['endereco'],
        'link' => $e['link'], 'localidade' => $e['localidade'], 'descricao' => $e['descricao'],
        'fotoCapa' => $e['foto_capa'], 'status' => $e['status'],
        'diferenciais' => !empty($e['diferenciais']) ? explode("\n", $e['diferenciais']) : [],
        'ficha' => !empty($e['ficha']) ? (json_decode($e['ficha'], true) ?: new stdClass) : new stdClass
      ];
    }, $st->fetchAll());
    echo json_encode(['itens' => $itens], JSON_UNESCAPED_UNICODE);
  }

  else {
    erro(400, 'acao_invalida', 'Ação inválida.');
  }

} catch (PDOException $e) {
  if ($e->getCode() === '42S02') {
    erro(503, 'tabela_indisponivel', 'O portal do cliente ainda não foi preparado no banco. Importe migracao_clientes.sql e migracao_empreendimentos_vitrine.sql no phpMyAdmin.');
  }
  error_log('[central-de-leads] portal: ' . $e->getMessage());
  erro(500, 'erro_banco', 'Erro ao falar com o banco.');
}
