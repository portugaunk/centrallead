<?php
/**
 * api/distribuicao.php — tela de Distribuição (só administração).
 *
 *   GET  ?acao=resumo   grupos de leads disponíveis, distribuições recentes e andamento de cada uma
 *   GET  ?acao=previa&de=<__sem__|idUsuario>&localidade=&origem=&status=
 *                       quantos leads estão disponíveis com esses filtros
 *   POST ?acao=criar    body {de, localidade?, origem?, status?, corretores:[{id,quantidade}],
 *                             porRodada, intervaloMin, superintendencia?}
 *   POST ?acao=cancelar body {id}   -> o que ainda não foi entregue volta a ficar como estava
 *
 * A liberação de cada rodada acontece em distribuicao_lib.php (chamada por dados.php).
 */

require __DIR__ . '/comum.php';
require __DIR__ . '/distribuicao_lib.php';
iniciarSessao();

$acao = $_GET['acao'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];
if ($metodo !== 'GET') exigirAjax();

$pdo = conexao();
$eu = exigirLogin($pdo);
exigirAdmin($eu);
distribGarantirTabelas($pdo);
distribProcessar($pdo);

/** Leads que podem entrar numa distribuição: do grupo escolhido e sem entrega pendente. */
function distribFiltroLeads($dados, &$params) {
  $onde = ["NOT EXISTS (SELECT 1 FROM distribuicao_itens i WHERE i.lead_id = l.id AND i.situacao = 'pendente')"];
  $de = (string)($dados['de'] ?? '__sem__');
  if ($de === '__sem__' || $de === '') { $onde[] = 'l.responsavel_id IS NULL'; }
  else { $onde[] = 'l.responsavel_id = ?'; $params[] = $de; }
  foreach (['localidade' => 'l.localidade', 'origem' => 'l.origem', 'status' => 'l.status'] as $chave => $coluna) {
    $v = trim((string)($dados[$chave] ?? ''));
    if ($v !== '') { $onde[] = $coluna . ' = ?'; $params[] = $v; }
  }
  return implode(' AND ', $onde);
}

function distribInteiro($v, $padrao, $min, $max) {
  if ($v === null || $v === '') return $padrao;
  if (!is_numeric($v) || (int)$v != $v) erro(400, 'numero_invalido', 'Use números inteiros nos campos de rodada e intervalo.');
  return max($min, min($max, (int)$v));
}

function distribResumo($pdo) {
  $pools = [];
  $st = $pdo->query("SELECT COALESCE(l.responsavel_id, '__sem__') AS de, COUNT(*) AS n
                       FROM leads l
                      WHERE NOT EXISTS (SELECT 1 FROM distribuicao_itens i WHERE i.lead_id = l.id AND i.situacao = 'pendente')
                      GROUP BY COALESCE(l.responsavel_id, '__sem__')");
  foreach ($st->fetchAll() as $r) $pools[] = ['de' => (string)$r['de'], 'n' => (int)$r['n']];

  $lista = $pdo->query('SELECT * FROM distribuicoes ORDER BY criado_em DESC LIMIT 30')->fetchAll();
  $out = [];
  if ($lista) {
    $ids = array_column($lista, 'id');
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT distribuicao_id, corretor_id, corretor_nome, situacao, COUNT(*) AS n,
                                MIN(CASE WHEN situacao = 'pendente' THEN liberar_em END) AS proxima,
                                MAX(liberar_em) AS ultima
                           FROM distribuicao_itens WHERE distribuicao_id IN ($marcas)
                          GROUP BY distribuicao_id, corretor_id, corretor_nome, situacao");
    $st->execute($ids);
    $por = [];
    foreach ($st->fetchAll() as $r) {
      $d = &$por[$r['distribuicao_id']];
      if (!isset($d)) $d = ['sit' => ['pendente' => 0, 'liberado' => 0, 'ignorado' => 0, 'cancelado' => 0], 'proxima' => null, 'ultima' => null, 'corretores' => []];
      $d['sit'][$r['situacao']] += (int)$r['n'];
      if ($r['proxima'] !== null && ($d['proxima'] === null || $r['proxima'] < $d['proxima'])) $d['proxima'] = $r['proxima'];
      if ($d['ultima'] === null || $r['ultima'] > $d['ultima']) $d['ultima'] = $r['ultima'];
      $k = $r['corretor_id'];
      if (!isset($d['corretores'][$k])) $d['corretores'][$k] = ['id' => $k, 'nome' => $r['corretor_nome'], 'total' => 0, 'liberados' => 0, 'pendentes' => 0];
      $d['corretores'][$k]['total'] += (int)$r['n'];
      if ($r['situacao'] === 'liberado') $d['corretores'][$k]['liberados'] += (int)$r['n'];
      if ($r['situacao'] === 'pendente') $d['corretores'][$k]['pendentes'] += (int)$r['n'];
      unset($d);
    }
    foreach ($lista as $d) {
      $x = $por[$d['id']] ?? ['sit' => ['pendente' => 0, 'liberado' => 0, 'ignorado' => 0, 'cancelado' => 0], 'proxima' => null, 'ultima' => null, 'corretores' => []];
      $out[] = [
        'id' => $d['id'], 'criadoEm' => $d['criado_em'], 'criadoPor' => $d['criado_por_nome'],
        'superintendencia' => $d['superintendencia'], 'intervaloMin' => (int)$d['intervalo_min'],
        'porRodada' => (int)$d['por_rodada'], 'total' => (int)$d['total'], 'situacao' => $d['situacao'],
        'encerradaEm' => $d['encerrada_em'], 'encerradaPor' => $d['encerrada_por'],
        'liberados' => $x['sit']['liberado'], 'pendentes' => $x['sit']['pendente'],
        'ignorados' => $x['sit']['ignorado'], 'cancelados' => $x['sit']['cancelado'],
        'proxima' => $x['proxima'], 'ultima' => $x['ultima'],
        'corretores' => array_values($x['corretores'])
      ];
    }
  }
  $sup = $pdo->query("SELECT DISTINCT superintendencia FROM distribuicoes WHERE superintendencia IS NOT NULL AND superintendencia <> '' ORDER BY superintendencia ASC LIMIT 50")->fetchAll(PDO::FETCH_COLUMN);
  return ['agora' => distribAgoraIso(), 'pools' => $pools, 'distribuicoes' => $out, 'superintendencias' => $sup];
}

function distribCriar($pdo, $eu, $dados) {
  $porRodada = distribInteiro($dados['porRodada'] ?? null, 1, 1, 100);
  $intervalo = distribInteiro($dados['intervaloMin'] ?? null, 10, 1, 1440);
  $sup = trim((string)($dados['superintendencia'] ?? ''));
  if ($sup !== '') $sup = function_exists('mb_substr') ? mb_substr($sup, 0, 120) : substr($sup, 0, 120);

  // corretores escolhidos, sem repetir, cada um com a sua quantidade
  $corretores = []; $visto = [];
  foreach ((array)($dados['corretores'] ?? []) as $c) {
    $cid = is_array($c) ? (string)($c['id'] ?? '') : '';
    if ($cid === '' || isset($visto[$cid])) continue;
    $q = is_array($c) ? ($c['quantidade'] ?? 0) : 0;
    if (!is_numeric($q) || (int)$q != $q || (int)$q < 1) erro(400, 'quantidade_invalida', 'Cada corretor precisa receber pelo menos 1 lead.');
    $visto[$cid] = true;
    $corretores[] = ['id' => $cid, 'quantidade' => (int)$q];
  }
  if (!$corretores) erro(400, 'sem_corretores', 'Escolha pelo menos uma pessoa para receber os leads.');
  $pedidos = array_sum(array_column($corretores, 'quantidade'));
  if ($pedidos > 5000) erro(400, 'lote_grande', 'No máximo 5000 leads por distribuição.');

  $marcas = implode(',', array_fill(0, count($corretores), '?'));
  $st = $pdo->prepare("SELECT id, nome, ativo FROM usuarios WHERE id IN ($marcas)");
  $st->execute(array_column($corretores, 'id'));
  $nomes = [];
  foreach ($st->fetchAll() as $u) {
    if (!$u['ativo']) erro(400, 'responsavel_invalido', $u['nome'] . ' está sem acesso liberado.');
    $nomes[$u['id']] = $u['nome'];
  }
  foreach ($corretores as $c) {
    if (!isset($nomes[$c['id']])) erro(400, 'responsavel_invalido', 'Uma das pessoas escolhidas não existe mais. Atualize a página.');
  }

  // uma operação por vez: não deixa liberar e agendar ao mesmo tempo sobre os mesmos leads
  $trava = (int)$pdo->query("SELECT GET_LOCK('" . DISTRIB_TRAVA . "', 8)")->fetchColumn();
  if ($trava !== 1) erro(503, 'ocupado', 'O sistema está ocupado com outra distribuição. Tente de novo em instantes.');
  try {
    $params = [];
    $onde = distribFiltroLeads($dados, $params);
    $st = $pdo->prepare("SELECT l.id, l.responsavel_id FROM leads l WHERE $onde ORDER BY l.criado_em ASC, l.id ASC LIMIT " . (int)$pedidos);
    $st->execute($params);
    $leads = $st->fetchAll();
    if (count($leads) < $pedidos) {
      erro(400, 'poucos_leads', 'Só há ' . count($leads) . ' lead' . (count($leads) === 1 ? '' : 's') . ' disponível' . (count($leads) === 1 ? '' : 'is') . ' com esses filtros, e você pediu ' . $pedidos . '.');
    }
    $donos = [];
    foreach ($leads as $l) $donos[$l['id']] = $l['responsavel_id'];

    $inicio = time();
    $plano = distribPlanejar(array_column($leads, 'id'), $corretores, $porRodada, $intervalo, $inicio);
    $did = gerarId();
    $agora = distribAgoraIso($inicio);

    $pdo->beginTransaction();
    try {
      $pdo->prepare('INSERT INTO distribuicoes (id, criado_em, criado_por_id, criado_por_nome, superintendencia, intervalo_min, por_rodada, total, situacao)
                     VALUES (?,?,?,?,?,?,?,?,?)')
          ->execute([$did, $agora, $eu['id'], $eu['nome'], $sup !== '' ? $sup : null, $intervalo, $porRodada, count($plano), 'ativa']);
      $ins = $pdo->prepare('INSERT INTO distribuicao_itens (distribuicao_id, lead_id, de_id, corretor_id, corretor_nome, rodada, liberar_em, situacao)
                            VALUES (?,?,?,?,?,?,?,?)');
      foreach ($plano as $p) {
        $ins->execute([$did, $p['lead'], $donos[$p['lead']], $p['corretor'], $nomes[$p['corretor']], $p['rodada'], distribAgoraIso($p['ts']), 'pendente']);
      }
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }
  } finally {
    $pdo->query("SELECT RELEASE_LOCK('" . DISTRIB_TRAVA . "')")->fetchAll();
  }

  distribProcessar($pdo, true);   // a primeira rodada cai agora
  $rodadas = 0; $ultimo = $inicio;
  foreach ($plano as $p) { $rodadas = max($rodadas, $p['rodada'] + 1); $ultimo = max($ultimo, $p['ts']); }
  echo json_encode(['id' => $did, 'total' => count($plano), 'rodadas' => $rodadas, 'ultimaEm' => distribAgoraIso($ultimo)]);
}

function distribCancelar($pdo, $eu, $dados) {
  $id = (string)($dados['id'] ?? '');
  if ($id === '') erro(400, 'id_obrigatorio', 'Falta o id.');
  $trava = (int)$pdo->query("SELECT GET_LOCK('" . DISTRIB_TRAVA . "', 8)")->fetchColumn();
  if ($trava !== 1) erro(503, 'ocupado', 'O sistema está ocupado. Tente de novo em instantes.');
  try {
    $st = $pdo->prepare('SELECT situacao FROM distribuicoes WHERE id = ?');
    $st->execute([$id]);
    $d = $st->fetch();
    if (!$d) erro(400, 'nao_existe', 'Essa distribuição não existe mais.');
    if ($d['situacao'] !== 'ativa') erro(400, 'ja_encerrada', 'Essa distribuição já terminou.');
    $agora = distribAgoraIso();
    $pdo->beginTransaction();
    try {
      $q = $pdo->prepare("UPDATE distribuicao_itens SET situacao = 'cancelado' WHERE distribuicao_id = ? AND situacao = 'pendente'");
      $q->execute([$id]);
      $cancelados = $q->rowCount();
      $pdo->prepare("UPDATE distribuicoes SET situacao = 'cancelada', encerrada_em = ?, encerrada_por = ? WHERE id = ?")
          ->execute([$agora, $eu['nome'], $id]);
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }
  } finally {
    $pdo->query("SELECT RELEASE_LOCK('" . DISTRIB_TRAVA . "')")->fetchAll();
  }
  echo json_encode(['ok' => true, 'cancelados' => $cancelados]);
}

try {
  if ($acao === 'resumo' && $metodo === 'GET') {
    echo json_encode(distribResumo($pdo), JSON_UNESCAPED_UNICODE);
  } elseif ($acao === 'previa' && $metodo === 'GET') {
    $params = [];
    $onde = distribFiltroLeads($_GET, $params);
    $st = $pdo->prepare("SELECT COUNT(*) FROM leads l WHERE $onde");
    $st->execute($params);
    echo json_encode(['disponiveis' => (int)$st->fetchColumn()]);
  } elseif ($acao === 'criar' && $metodo === 'POST') {
    distribCriar($pdo, $eu, corpoJson());
  } elseif ($acao === 'cancelar' && $metodo === 'POST') {
    distribCancelar($pdo, $eu, corpoJson());
  } else {
    erro(400, 'acao_invalida', 'Ação desconhecida.');
  }
} catch (PDOException $e) {
  error_log('[central-de-leads] distribuicao: ' . $e->getMessage());
  erro(500, 'erro_banco', 'Erro ao falar com o banco de dados.');
}
