<?php
/**
 * api/dados.php — API sobre tabelas próprias (usuarios, leads, visitas, config).
 *
 * Do lado de fora (js/dados.js) continua parecendo uma API genérica de
 * coleções/documentos. Aqui dentro, cada coleção vira sua(s) tabela(s):
 *
 *   usuarios -> tabela usuarios (nunca devolve sal nem hash)
 *   leads    -> tabela leads (inclui a localidade: Zona Norte, Zona Sul...)
 *   visitas  -> tabela visitas (o corretor da visita é o responsável pelo lead)
 *   (a Distribuição de leads mora em api/distribuicao.php; aqui só liberamos o que já venceu)
 *   config   -> config_app + estagios + origens + empreendimentos + modelos_mensagem,
 *               sempre com o único documento de id "app"
 *
 * Rotas:
 *   POST   ?colecao=leads&acao=lote  body {ids:[...], responsavelId?, localidade?}
 *                                    -> muda o responsável e/ou a localidade de vários leads de uma vez
 *   GET    ?colecao=X                -> lista
 *   GET    ?colecao=X&id=abc          -> um documento
 *   POST   ?colecao=X      body=JSON  -> cria, devolve {id}
 *   PUT    ?colecao=X&id=abc&modo=set|update  body=JSON
 *   DELETE ?colecao=X&id=abc
 *
 * QUEM PODE O QUÊ (checado aqui, no servidor — esconder botão na tela não basta):
 *
 *                       administração          corretor
 *   leads   ler         todos                  só os atribuídos a ele
 *           criar       sim                    sim, mas sempre pra si mesmo
 *           editar      todos                  só os dele (não troca o responsável)
 *           excluir     sim                    não
 *           em lote     atribuir + localidade  só localidade, e só nos dele
 *   visitas ler         todas                  só as dos leads dele
 *           criar/editar  sim                      sim, só nos leads dele
 *           excluir     sim                    não (ele marca como cancelada)
 *   usuarios ler        todos                  só ele mesmo
 *           criar/remover         sim          não
 *           editar (próprio nome/e-mail/senha)  sim            sim
 *           editar (permissão/acesso/outros)     sim            não
 *   distribuição (api/distribuicao.php)   só administração
 *   config  ler         sim                    sim
 *           gravar      sim                    não
 */

require __DIR__ . '/comum.php';
iniciarSessao();

$colecao = $_GET['colecao'] ?? '';
if (!in_array($colecao, ['usuarios', 'leads', 'visitas', 'config'], true)) {
  erro(400, 'colecao_invalida', 'Coleção precisa ser usuarios, leads, visitas ou config.');
}
$id = $_GET['id'] ?? null;
$modo = $_GET['modo'] ?? 'set';
$metodo = $_SERVER['REQUEST_METHOD'];
if ($metodo !== 'GET') exigirAjax();

$pdo = conexao();
$eu = exigirLogin($pdo);
$souAdmin = $eu['papel'] === 'admin';

// Distribuição gradual de leads: libera o que já venceu (uma consulta e sai quando não há nada).
// Roda antes de qualquer leitura, para o corretor já ver os leads que acabaram de cair.
require __DIR__ . '/distribuicao_lib.php';
distribProcessar($pdo);

function seEnviado($dados, $chave) { return array_key_exists($chave, $dados); }
/** '' vira NULL para colunas de data — <input type=date> vazio manda ''. */
function ouNulo($v) { return ($v === '' || $v === null) ? null : $v; }


// =====================================================================
// USUÁRIOS
// =====================================================================

function usuarioParaJson($l) {
  return [
    'nome' => $l['nome'], 'email' => $l['email'], 'papel' => $l['papel'],
    'ativo' => (bool)$l['ativo'], 'criadoEm' => $l['criado_em']
  ];
}

function usuariosGet($pdo, $eu, $id) {
  if ($id !== null) {
    if ($eu['papel'] !== 'admin' && $id !== $eu['id']) { echo json_encode(['existe' => false]); return; }
    $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $st->execute([$id]);
    $l = $st->fetch();
    echo json_encode($l ? ['existe' => true, 'id' => $id, 'dados' => usuarioParaJson($l)] : ['existe' => false]);
    return;
  }
  if ($eu['papel'] === 'admin') {
    $st = $pdo->query('SELECT * FROM usuarios ORDER BY criado_em ASC');
  } else {
    $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
    $st->execute([$eu['id']]);
  }
  $itens = array_map(fn($l) => ['id' => $l['id'], 'dados' => usuarioParaJson($l)], $st->fetchAll());
  echo json_encode(['itens' => $itens], JSON_UNESCAPED_UNICODE);
}

function papelValido($p) { return in_array($p, ['admin', 'corretor'], true); }

function usuariosPost($pdo, $dados) {
  $nome = trim((string)($dados['nome'] ?? ''));
  $email = strtolower(trim((string)($dados['email'] ?? '')));
  $papel = $dados['papel'] ?? 'corretor';
  if ($nome === '') erro(400, 'nome_invalido', 'Informe o nome.');
  validarEmail($email);
  validarSenha($dados['senha'] ?? '');
  if (!papelValido($papel)) erro(400, 'papel_invalido', 'Permissão inválida.');
  $novoId = gerarId();
  try {
    $pdo->prepare('INSERT INTO usuarios (id, nome, email, papel, ativo, sal, hash, criado_em) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$novoId, $nome, $email, $papel,
                   array_key_exists('ativo', $dados) ? (!empty($dados['ativo']) ? 1 : 0) : 1,
                   '', novoHash($dados['senha']), gmdate('Y-m-d\TH:i:s.000\Z')]);
  } catch (PDOException $e) {
    if ($e->getCode() === '23000') erro(409, 'ja_existe', 'Já existe uma pessoa com esse e-mail.');
    throw $e;
  }
  echo json_encode(['id' => $novoId]);
}

function usuariosPut($pdo, $souAdmin, $id, $dados) {
  $st = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?');
  $st->execute([$id]);
  $atual = $st->fetch();
  if (!$atual) erro(400, 'nao_existe', 'Esse usuário não existe.');

  $nome  = seEnviado($dados, 'nome')  ? trim((string)$dados['nome']) : $atual['nome'];
  $email = seEnviado($dados, 'email') ? strtolower(trim((string)$dados['email'])) : $atual['email'];
  // Permissão e liberação de acesso só quem é administração pode mudar —
  // mesmo que o pedido tente mandar esses campos, ignoramos quando não é admin.
  $papel = ($souAdmin && seEnviado($dados, 'papel')) ? $dados['papel'] : $atual['papel'];
  $ativo = ($souAdmin && seEnviado($dados, 'ativo')) ? (!empty($dados['ativo']) ? 1 : 0) : (int)$atual['ativo'];
  if ($nome === '') erro(400, 'nome_invalido', 'Informe o nome.');
  validarEmail($email);
  if (!papelValido($papel)) erro(400, 'papel_invalido', 'Permissão inválida.');

  if ($id === $atual['id'] && $atual['papel'] === 'admin' && ($papel !== 'admin' || !$ativo)) {
    erro(400, 'auto_rebaixamento', 'Você não pode tirar o próprio acesso de administração.');
  }

  $hash = $atual['hash']; $sal = $atual['sal'];
  if (!empty($dados['senha'])) { validarSenha($dados['senha']); $hash = novoHash($dados['senha']); $sal = ''; }

  try {
    $pdo->prepare('UPDATE usuarios SET nome=?, email=?, papel=?, ativo=?, sal=?, hash=? WHERE id=?')
        ->execute([$nome, $email, $papel, $ativo, $sal, $hash, $id]);
  } catch (PDOException $e) {
    if ($e->getCode() === '23000') erro(409, 'ja_existe', 'Já existe uma pessoa com esse e-mail.');
    throw $e;
  }
  echo json_encode(['ok' => true]);
}

function usuariosDelete($pdo, $eu, $id) {
  if ($id === $eu['id']) erro(400, 'auto_remocao', 'Você não pode remover o próprio acesso.');
  $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
  echo json_encode(['ok' => true]);
}


// =====================================================================
// LEADS
// =====================================================================

function leadParaJson($l) {
  return [
    'nome' => $l['nome'], 'telefone' => $l['telefone'], 'telefoneOriginal' => $l['telefone_original'],
    'email' => $l['email'], 'origem' => $l['origem'], 'interesse' => $l['interesse'],
    'localidade' => $l['localidade'] ?? null,
    'valor' => (float)$l['valor'], 'status' => $l['status'], 'proximoContato' => $l['proximo_contato'],
    'obs' => $l['obs'], 'responsavelId' => $l['responsavel_id'],
    'historico' => $l['historico'] ? json_decode($l['historico'], true) : [],
    'criadoEm' => $l['criado_em'], 'atualizadoEm' => $l['atualizado_em'], 'ultimoContato' => $l['ultimo_contato']
  ];
}

/** Limpa o texto da localidade: vazio vira NULL e o tamanho respeita a coluna (80). */
function localidadeLimpa($v) {
  $v = is_scalar($v) ? trim((string)$v) : '';
  if ($v === '') return null;
  return function_exists('mb_substr') ? mb_substr($v, 0, 80) : substr($v, 0, 80);
}

/**
 * As colunas endereco e link de empreendimentos foram criadas depois da tabela em si.
 * Se ainda faltarem no banco, criamos aqui mesmo, para quem atualizou os arquivos mas
 * ainda não importou as migrações. O ALTER TABLE fecha qualquer transação aberta,
 * então isto roda ANTES de beginTransaction.
 */
function garantirEnderecoEmpreendimento($pdo) {
  static $pronto = false;
  if ($pronto) return;
  try {
    if (!$pdo->query("SHOW TABLES LIKE 'empreendimentos'")->fetch()) { $pronto = true; return; }   // tabela ainda não existe: o erro 42S02 de sempre cuida disso
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'endereco'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN endereco VARCHAR(255) NULL AFTER nome');
    }
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'link'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN link VARCHAR(500) NULL AFTER endereco');
    }
    // campos da vitrine do Portal do Cliente
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'localidade'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN localidade VARCHAR(80) NULL AFTER link');
      try { $pdo->exec('ALTER TABLE empreendimentos ADD KEY idx_empreendimentos_localidade (localidade)'); } catch (PDOException $e) { /* índice é só conforto */ }
    }
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'descricao'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN descricao TEXT NULL AFTER localidade');
    }
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'foto_capa'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN foto_capa VARCHAR(500) NULL AFTER descricao');
    }
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'status'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN status VARCHAR(60) NULL AFTER foto_capa');
    }
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'diferenciais'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN diferenciais TEXT NULL AFTER status');
    }
    if (!$pdo->query("SHOW COLUMNS FROM empreendimentos LIKE 'ficha'")->fetch()) {
      $pdo->exec('ALTER TABLE empreendimentos ADD COLUMN ficha TEXT NULL AFTER diferenciais');
    }
    $pronto = true;
  } catch (PDOException $e) {
    error_log('[central-de-leads] empreendimentos (vitrine): ' . $e->getMessage());
    erro(503, 'esquema_empreendimentos', 'Não consegui criar os campos do empreendimento no banco. Importe os arquivos migracao_empreendimentos_endereco.sql, migracao_empreendimentos_link.sql e migracao_empreendimentos_vitrine.sql no phpMyAdmin.');
  }
}

/** Link do empreendimento: só aceita http(s) (nada de javascript:), até 500 caracteres. */
function linkEmpreendimentoLimpo($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  if (!preg_match('#^https?://[^\s]+$#i', $v)) erro(400, 'link_invalido', 'O link do empreendimento precisa começar com http:// ou https://.');
  return function_exists('mb_substr') ? mb_substr($v, 0, 500) : substr($v, 0, 500);
}

/** Foto de capa do empreendimento: mesma regra do link (só http/https), até 500 caracteres. */
function fotoCapaLimpa($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  if (!preg_match('#^https?://[^\s]+$#i', $v)) erro(400, 'foto_invalida', 'A foto de capa precisa ser um link que começa com http:// ou https://.');
  return function_exists('mb_substr') ? mb_substr($v, 0, 500) : substr($v, 0, 500);
}

/** Descrição do empreendimento (texto livre da vitrine), até 2000 caracteres. */
function descricaoEmpreendimentoLimpa($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  return function_exists('mb_substr') ? mb_substr($v, 0, 2000) : substr($v, 0, 2000);
}

/** Status do empreendimento na vitrine (ex.: Lançamento, Em obras, Pronto para morar), até 60 caracteres. */
function statusEmpreendimentoLimpo($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  return function_exists('mb_substr') ? mb_substr($v, 0, 60) : substr($v, 0, 60);
}

/**
 * Ficha do empreendimento (vitrine): metragem, dormitórios, vagas, entrega, preço, plantas
 * (tipologias), lazer e galeria de fotos. Guardada como JSON em uma única coluna.
 */
function fichaEmpreendimentoLimpa($v) {
  if (!is_array($v)) return null;
  $cortar = fn($t, $n) => function_exists('mb_substr') ? mb_substr($t, 0, $n) : substr($t, 0, $n);
  $f = [];
  foreach (['metragem', 'dormitorios', 'vagas', 'entrega', 'preco', 'precoAte', 'tipo'] as $k) {
    $t = trim(preg_replace('/\s+/', ' ', (string)($v[$k] ?? '')));
    if ($t !== '') $f[$k] = $cortar($t, 60);
  }
  // precoAte: último dia de validade do preço (AAAA-MM-DD); sem preço ou em outro formato, não vale
  if (isset($f['precoAte']) && (!isset($f['preco']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $f['precoAte']))) unset($f['precoAte']);
  foreach (['tipologias' => [10, 120], 'lazer' => [24, 60], 'galeria' => [10, 500], 'documentos' => [10, 560]] as $k => [$max, $tam]) {
    $itens = is_array($v[$k] ?? null) ? $v[$k] : explode("\n", (string)($v[$k] ?? ''));
    $ok = [];
    foreach ($itens as $i) {
      $i = trim(preg_replace('/\s+/', ' ', (string)$i));
      if ($i === '') continue;
      if ($k === 'galeria' && !preg_match('#^https?://[^\s]+$#i', $i)) erro(400, 'galeria_invalida', 'Cada foto da galeria precisa ser um link que começa com http:// ou https://.');
      // documentos: "Nome do documento | https://link"
      if ($k === 'documentos' && !preg_match('#^[^|]+\|\s*https?://[^\s]+$#i', $i)) erro(400, 'documento_invalido', 'Cada documento deve estar no formato: Nome | https://link');
      $ok[] = $cortar($i, $tam);
      if (count($ok) >= $max) break;
    }
    if ($ok) $f[$k] = $ok;
  }
  return $f ? json_encode($f, JSON_UNESCAPED_UNICODE) : null;
}

/**
 * Diferenciais do empreendimento (ex.: "Perto de metrô", "Perto de parque"), mostrados como
 * tags na vitrine. Aceita tanto uma lista (array, um item por posição) quanto um texto com
 * um item por linha; guarda sempre como texto com um item por linha. No máximo 12 itens de
 * até 60 caracteres cada.
 */
function diferenciaisEmpreendimentoLimpos($v) {
  $itens = is_array($v) ? $v : explode("\n", (string)$v);
  $limpos = [];
  foreach ($itens as $item) {
    $item = trim(preg_replace('/\s+/', ' ', (string)$item));
    if ($item === '') continue;
    $limpos[] = function_exists('mb_substr') ? mb_substr($item, 0, 60) : substr($item, 0, 60);
    if (count($limpos) >= 12) break;
  }
  return $limpos ? implode("\n", $limpos) : null;
}

/**
 * A coluna leads.localidade e a tabela localidades foram criadas depois das demais.
 * Se ainda faltarem no banco, criamos aqui mesmo (uma consulta barata por requisição),
 * para quem atualizou os arquivos mas ainda não importou migracao_localidade.sql.
 * O ALTER TABLE fecha qualquer transação aberta, então isto roda ANTES de beginTransaction.
 */
function garantirLocalidade($pdo) {
  static $pronto = false;
  if ($pronto) return;
  try {
    if (!$pdo->query("SHOW COLUMNS FROM leads LIKE 'localidade'")->fetch()) {
      $pdo->exec('ALTER TABLE leads ADD COLUMN localidade VARCHAR(80) NULL AFTER interesse');
      try { $pdo->exec('ALTER TABLE leads ADD KEY idx_leads_localidade (localidade)'); } catch (PDOException $e) { /* índice é só conforto */ }
    }
    if (!$pdo->query("SHOW TABLES LIKE 'localidades'")->fetch()) {
      $pdo->exec('CREATE TABLE localidades (
                    id     INT AUTO_INCREMENT PRIMARY KEY,
                    ordem  INT NOT NULL,
                    nome   VARCHAR(80) NOT NULL
                  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    }
    $pronto = true;
  } catch (PDOException $e) {
    error_log('[central-de-leads] localidade: ' . $e->getMessage());
    erro(503, 'esquema_localidade', 'Não consegui criar o campo de localidade no banco. Importe o arquivo migracao_localidade.sql no phpMyAdmin.');
  }
}

function leadsGet($pdo, $eu, $id) {
  $admin = $eu['papel'] === 'admin';
  if ($id !== null) {
    $st = $pdo->prepare('SELECT * FROM leads WHERE id = ?');
    $st->execute([$id]);
    $l = $st->fetch();
    if ($l && !$admin && $l['responsavel_id'] !== $eu['id']) $l = false;
    echo json_encode($l ? ['existe' => true, 'id' => $id, 'dados' => leadParaJson($l)] : ['existe' => false], JSON_UNESCAPED_UNICODE);
    return;
  }
  if ($admin) {
    $st = $pdo->query('SELECT * FROM leads ORDER BY criado_em DESC LIMIT 1000');
  } else {
    $st = $pdo->prepare('SELECT * FROM leads WHERE responsavel_id = ? ORDER BY criado_em DESC LIMIT 1000');
    $st->execute([$eu['id']]);
  }
  $itens = array_map(fn($l) => ['id' => $l['id'], 'dados' => leadParaJson($l)], $st->fetchAll());
  echo json_encode(['itens' => $itens], JSON_UNESCAPED_UNICODE);
}

function leadsPost($pdo, $eu, $dados) {
  if (trim((string)($dados['nome'] ?? '')) === '' || trim((string)($dados['telefone'] ?? '')) === '') {
    erro(400, 'lead_invalido', 'Todo lead precisa de nome e telefone.');
  }
  // Corretor só cadastra lead pra si mesmo — nunca escolhe outro responsável.
  if ($eu['papel'] !== 'admin') $dados['responsavelId'] = $eu['id'];
  garantirLocalidade($pdo);
  $novoId = gerarId();
  $agora = gmdate('Y-m-d\TH:i:s.000\Z');
  try {
    $pdo->prepare('INSERT INTO leads (id, nome, telefone, telefone_original, email, origem, interesse,
                      localidade, valor, status, proximo_contato, obs, responsavel_id, historico,
                      criado_em, atualizado_em, ultimo_contato)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([
          $novoId, $dados['nome'], $dados['telefone'], $dados['telefoneOriginal'] ?? null,
          $dados['email'] ?? null, $dados['origem'] ?? null, $dados['interesse'] ?? null,
          localidadeLimpa($dados['localidade'] ?? null), $dados['valor'] ?? 0, $dados['status'] ?? '', ouNulo($dados['proximoContato'] ?? null),
          $dados['obs'] ?? null, ouNulo($dados['responsavelId'] ?? null),
          json_encode($dados['historico'] ?? [], JSON_UNESCAPED_UNICODE),
          $dados['criadoEm'] ?? $agora, $dados['atualizadoEm'] ?? $agora, $dados['ultimoContato'] ?? null
        ]);
  } catch (PDOException $e) {
    if ($e->getCode() === '23000') erro(400, 'responsavel_invalido', 'Responsável informado não existe.');
    throw $e;
  }
  echo json_encode(['id' => $novoId]);
}

function leadsPut($pdo, $eu, $id, $dados, $modo) {
  $st = $pdo->prepare('SELECT * FROM leads WHERE id = ?');
  $st->execute([$id]);
  $atual = $st->fetch();
  $admin = $eu['papel'] === 'admin';

  if (!$admin) {
    // Corretor só mexe em lead que já existe e que é dele — e nunca troca o responsável.
    if (!$atual || $atual['responsavel_id'] !== $eu['id']) {
      erro(403, 'sem_permissao', 'Você só pode alterar os leads atribuídos a você.');
    }
    $dados['responsavelId'] = $atual['responsavel_id'];
  }
  if ($modo === 'update' && !$atual) erro(400, 'nao_existe', 'Esse lead não existe.');
  garantirLocalidade($pdo);

  $v = fn($chave, $coluna) => seEnviado($dados, $chave) ? $dados[$chave] : ($atual[$coluna] ?? null);

  $nome = $v('nome','nome'); $telefone = $v('telefone','telefone');
  $telOriginal = $v('telefoneOriginal','telefone_original'); $email = $v('email','email');
  $origem = $v('origem','origem'); $interesse = $v('interesse','interesse');
  $localidade = localidadeLimpa($v('localidade','localidade'));
  $valor = $v('valor','valor') ?: 0; $status = $v('status','status');
  $proximo = ouNulo($v('proximoContato','proximo_contato')); $obs = $v('obs','obs');
  $responsavel = ouNulo($v('responsavelId','responsavel_id'));
  $historico = seEnviado($dados,'historico') ? $dados['historico']
                : (($atual && $atual['historico']) ? json_decode($atual['historico'], true) : []);
  $agora = gmdate('Y-m-d\TH:i:s.000\Z');
  $criadoEm = $atual['criado_em'] ?? ($dados['criadoEm'] ?? $agora);
  $atualizadoEm = seEnviado($dados,'atualizadoEm') ? $dados['atualizadoEm'] : $agora;
  $ultimoContato = seEnviado($dados,'ultimoContato') ? $dados['ultimoContato'] : ($atual['ultimo_contato'] ?? null);

  try {
    $pdo->prepare('INSERT INTO leads (id, nome, telefone, telefone_original, email, origem, interesse,
                        localidade, valor, status, proximo_contato, obs, responsavel_id, historico,
                        criado_em, atualizado_em, ultimo_contato)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                      ON DUPLICATE KEY UPDATE nome=VALUES(nome), telefone=VALUES(telefone),
                        telefone_original=VALUES(telefone_original), email=VALUES(email),
                        origem=VALUES(origem), interesse=VALUES(interesse), localidade=VALUES(localidade),
                        valor=VALUES(valor),
                        status=VALUES(status), proximo_contato=VALUES(proximo_contato), obs=VALUES(obs),
                        responsavel_id=VALUES(responsavel_id), historico=VALUES(historico),
                        atualizado_em=VALUES(atualizado_em), ultimo_contato=VALUES(ultimo_contato)')
        ->execute([
          $id, $nome, $telefone, $telOriginal, $email, $origem, $interesse, $localidade, $valor, $status,
          $proximo, $obs, $responsavel, json_encode($historico, JSON_UNESCAPED_UNICODE),
          $criadoEm, $atualizadoEm, $ultimoContato
        ]);
  } catch (PDOException $e) {
    if ($e->getCode() === '23000') erro(400, 'responsavel_invalido', 'Responsável informado não existe.');
    throw $e;
  }
  echo json_encode(['ok' => true]);
}

function leadsDelete($pdo, $id) {
  $pdo->prepare('DELETE FROM leads WHERE id = ?')->execute([$id]);
  echo json_encode(['ok' => true]);
}

/**
 * Muda o responsável e/ou a localidade de vários leads numa chamada só, dentro de uma
 * transação: ou vai tudo, ou não vai nada (e o erro chega na tela, em vez de sumir).
 *   body: { ids: [...], responsavelId?: "id" | "", localidade?: "Zona Norte" | "" }
 * Só a administração atribui. Corretor só mexe na localidade, e só dos leads dele.
 * A resposta diz quantos foram alterados e quantos ids foram ignorados (não existem ou não são dele).
 */
function leadsLote($pdo, $eu, $dados) {
  $admin = $eu['papel'] === 'admin';
  $ids = [];
  foreach ((array)($dados['ids'] ?? []) as $x) {
    if (is_string($x) && $x !== '') $ids[] = $x;
  }
  $ids = array_values(array_unique($ids));   // (não usar o id como chave de array: id só de dígitos viraria número)
  if (!$ids) erro(400, 'lote_vazio', 'Nenhum lead selecionado.');
  if (count($ids) > 1000) erro(400, 'lote_grande', 'Selecione no máximo 1000 leads por vez.');

  $mudaResp = seEnviado($dados, 'responsavelId');
  $mudaLoc  = seEnviado($dados, 'localidade');
  if (!$mudaResp && !$mudaLoc) erro(400, 'lote_sem_mudanca', 'Não há nada para alterar.');
  if ($mudaResp && !$admin) erro(403, 'sem_permissao', 'Só a administração pode atribuir leads.');

  $novoResp = null; $nomeResp = 'sem responsável';
  if ($mudaResp) {
    $novoResp = ouNulo($dados['responsavelId']);
    if ($novoResp !== null) {
      $st = $pdo->prepare('SELECT id, nome, ativo FROM usuarios WHERE id = ?');
      $st->execute([(string)$novoResp]);
      $alvo = $st->fetch();
      if (!$alvo || !$alvo['ativo']) erro(400, 'responsavel_invalido', 'Essa pessoa não existe ou está sem acesso liberado.');
      $nomeResp = $alvo['nome'];
    }
  }
  $novaLoc = $mudaLoc ? localidadeLimpa($dados['localidade']) : null;
  garantirLocalidade($pdo);   // o SELECT/UPDATE abaixo usa a coluna; e o ALTER TABLE, se preciso, tem de vir antes da transação

  $marcas = implode(',', array_fill(0, count($ids), '?'));
  $sql = 'SELECT id, responsavel_id, localidade, historico FROM leads WHERE id IN (' . $marcas . ')';
  $params = $ids;
  if (!$admin) { $sql .= ' AND responsavel_id = ?'; $params[] = $eu['id']; }

  $agora = gmdate('Y-m-d\TH:i:s.000\Z');
  $alterados = 0; $encontrados = 0;
  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $linhas = $st->fetchAll();
    $encontrados = count($linhas);
    $up = $pdo->prepare('UPDATE leads SET responsavel_id = ?, localidade = ?, historico = ?, atualizado_em = ? WHERE id = ?');
    foreach ($linhas as $l) {
      $hist = $l['historico'] ? json_decode($l['historico'], true) : [];
      if (!is_array($hist)) $hist = [];
      $resp = $l['responsavel_id']; $loc = $l['localidade'] ?? null;
      $mudou = false;
      if ($mudaResp && $l['responsavel_id'] !== $novoResp) {
        $resp = $novoResp; $mudou = true;
        $hist[] = ['em' => $agora, 'por' => $eu['nome'], 'tipo' => 'atribuicao', 'texto' => 'Responsável: ' . $nomeResp];
      }
      if ($mudaLoc && ($l['localidade'] ?? null) !== $novaLoc) {
        $loc = $novaLoc; $mudou = true;
        $hist[] = ['em' => $agora, 'por' => $eu['nome'], 'tipo' => 'localidade', 'texto' => 'Localidade: ' . ($novaLoc ?? 'nenhuma')];
      }
      if (!$mudou) continue;   // já estava assim
      $hist = array_slice($hist, -60);
      $up->execute([$resp, $loc, json_encode($hist, JSON_UNESCAPED_UNICODE), $agora, $l['id']]);
      $alterados++;
    }
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  echo json_encode([
    'ok' => true,
    'alterados' => $alterados,                       // efetivamente mudaram
    'jaEstavam' => $encontrados - $alterados,        // já estavam com esse valor
    'ignorados' => count($ids) - $encontrados        // ids que não existem (ou, para corretor, não são dele)
  ]);
}


// =====================================================================
// VISITAS — o corretor da visita é o responsável pelo lead
// =====================================================================

const STATUS_VISITA = ['agendada', 'realizada', 'cancelada', 'faltou'];

function visitaParaJson($v) {
  return [
    'leadId' => $v['lead_id'], 'empreendimento' => $v['empreendimento'],
    'dataHora' => substr(str_replace(' ', 'T', $v['data_hora']), 0, 16),   // "2026-09-25T14:30", hora local sem fuso
    'status' => $v['status'], 'obs' => $v['obs'],
    'criadoEm' => $v['criado_em'], 'atualizadoEm' => $v['atualizado_em']
  ];
}

/** Confere que o lead existe e que a pessoa pode mexer nele (administração: qualquer; corretor: só os dele). */
function exigirLeadDaVisita($pdo, $eu, $leadId) {
  $st = $pdo->prepare('SELECT id, responsavel_id FROM leads WHERE id = ?');
  $st->execute([$leadId]);
  $l = $st->fetch();
  if (!$l) erro(400, 'visita_lead_invalido', 'O lead dessa visita não existe.');
  if ($eu['papel'] !== 'admin' && $l['responsavel_id'] !== $eu['id']) {
    erro(403, 'sem_permissao', 'Você só pode mexer nas visitas dos leads atribuídos a você.');
  }
}

function visitaEmpreendimento($v) {
  $v = trim((string)$v);
  if ($v === '') erro(400, 'visita_sem_empreendimento', 'Informe o empreendimento da visita.');
  return function_exists('mb_substr') ? mb_substr($v, 0, 160) : substr($v, 0, 160);
}

/** Aceita "2026-09-25T14:30" (ou com espaço) e devolve no formato do DATETIME. */
function visitaDataHora($v) {
  $v = trim((string)$v);
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/', $v, $m)
      || !checkdate((int)$m[2], (int)$m[3], (int)$m[1]) || (int)$m[4] > 23 || (int)$m[5] > 59) {
    erro(400, 'visita_data_invalida', 'Informe um dia e um horário válidos para a visita.');
  }
  return $m[1] . '-' . $m[2] . '-' . $m[3] . ' ' . $m[4] . ':' . $m[5] . ':00';
}

function visitaStatus($s) {
  if (!in_array($s, STATUS_VISITA, true)) erro(400, 'visita_status_invalido', 'Situação da visita inválida.');
  return $s;
}

function visitasGet($pdo, $eu, $id) {
  $admin = $eu['papel'] === 'admin';
  // o JOIN com leads é o que aplica a regra "corretor só vê as visitas dos leads dele"
  $base = 'SELECT v.* FROM visitas v JOIN leads l ON l.id = v.lead_id';
  if ($id !== null) {
    $st = $pdo->prepare($base . ' WHERE v.id = ?' . ($admin ? '' : ' AND l.responsavel_id = ?'));
    $st->execute($admin ? [$id] : [$id, $eu['id']]);
    $v = $st->fetch();
    echo json_encode($v ? ['existe' => true, 'id' => $id, 'dados' => visitaParaJson($v)] : ['existe' => false], JSON_UNESCAPED_UNICODE);
    return;
  }
  if ($admin) {
    $st = $pdo->query($base . ' ORDER BY v.data_hora DESC LIMIT 2000');
  } else {
    $st = $pdo->prepare($base . ' WHERE l.responsavel_id = ? ORDER BY v.data_hora DESC LIMIT 2000');
    $st->execute([$eu['id']]);
  }
  $itens = array_map(fn($v) => ['id' => $v['id'], 'dados' => visitaParaJson($v)], $st->fetchAll());
  echo json_encode(['itens' => $itens], JSON_UNESCAPED_UNICODE);
}

function visitasPost($pdo, $eu, $dados) {
  $leadId = (string)($dados['leadId'] ?? '');
  exigirLeadDaVisita($pdo, $eu, $leadId);
  $emp = visitaEmpreendimento($dados['empreendimento'] ?? '');
  $quando = visitaDataHora($dados['dataHora'] ?? '');
  $status = visitaStatus($dados['status'] ?? 'agendada');
  $novoId = gerarId();
  $agora = gmdate('Y-m-d\TH:i:s.000\Z');
  $pdo->prepare('INSERT INTO visitas (id, lead_id, empreendimento, data_hora, status, obs, criado_em, atualizado_em)
                 VALUES (?,?,?,?,?,?,?,?)')
      ->execute([$novoId, $leadId, $emp, $quando, $status, ouNulo($dados['obs'] ?? null), $agora, $agora]);
  echo json_encode(['id' => $novoId]);
}

function visitasPut($pdo, $eu, $id, $dados) {
  $st = $pdo->prepare('SELECT * FROM visitas WHERE id = ?');
  $st->execute([$id]);
  $atual = $st->fetch();
  if (!$atual) erro(400, 'nao_existe', 'Essa visita não existe mais.');
  exigirLeadDaVisita($pdo, $eu, $atual['lead_id']);   // o lead da visita nunca muda; só o resto
  $emp    = seEnviado($dados, 'empreendimento') ? visitaEmpreendimento($dados['empreendimento']) : $atual['empreendimento'];
  $quando = seEnviado($dados, 'dataHora') ? visitaDataHora($dados['dataHora']) : $atual['data_hora'];
  $status = seEnviado($dados, 'status') ? visitaStatus($dados['status']) : $atual['status'];
  $obs    = seEnviado($dados, 'obs') ? ouNulo($dados['obs']) : $atual['obs'];
  $pdo->prepare('UPDATE visitas SET empreendimento=?, data_hora=?, status=?, obs=?, atualizado_em=? WHERE id=?')
      ->execute([$emp, $quando, $status, $obs, gmdate('Y-m-d\TH:i:s.000\Z'), $id]);
  echo json_encode(['ok' => true]);
}

function visitasDelete($pdo, $id) {
  $pdo->prepare('DELETE FROM visitas WHERE id = ?')->execute([$id]);
  echo json_encode(['ok' => true]);
}


// =====================================================================
// CONFIG — sempre o documento único "app"
// =====================================================================

function configMontar($pdo) {
  $empresa = $pdo->query('SELECT empresa FROM config_app WHERE id = 1')->fetchColumn();
  if ($empresa === false) return null;
  $estagios = $pdo->query('SELECT nome FROM estagios ORDER BY ordem ASC')->fetchAll(PDO::FETCH_COLUMN);
  $origens  = $pdo->query('SELECT nome FROM origens ORDER BY ordem ASC')->fetchAll(PDO::FETCH_COLUMN);
  try {
    // com os campos da vitrine do Portal do Cliente (localidade, descrição, foto, status, diferenciais)
    $empreendimentos = array_map(
      fn($e) => ['nome' => $e['nome'], 'endereco' => $e['endereco'], 'link' => $e['link'],
                 'localidade' => $e['localidade'], 'descricao' => $e['descricao'],
                 'fotoCapa' => $e['foto_capa'], 'status' => $e['status'],
                 'diferenciais' => $e['diferenciais'] ? explode("\n", $e['diferenciais']) : [],
                 'ficha' => !empty($e['ficha']) ? (json_decode($e['ficha'], true) ?: new stdClass) : new stdClass],
      $pdo->query('SELECT nome, endereco, link, localidade, descricao, foto_capa, status, diferenciais, ficha FROM empreendimentos ORDER BY ordem ASC')->fetchAll()
    );
  } catch (PDOException $e00) {
    try {
      // coluna diferenciais ainda não existe (upgrade sem a migração rodada ainda)
      $empreendimentos = array_map(
        fn($e) => ['nome' => $e['nome'], 'endereco' => $e['endereco'], 'link' => $e['link'],
                   'localidade' => $e['localidade'], 'descricao' => $e['descricao'],
                   'fotoCapa' => $e['foto_capa'], 'status' => $e['status'], 'diferenciais' => []],
        $pdo->query('SELECT nome, endereco, link, localidade, descricao, foto_capa, status FROM empreendimentos ORDER BY ordem ASC')->fetchAll()
      );
    } catch (PDOException $e0) {
      try {
        $empreendimentos = array_map(
          fn($e) => ['nome' => $e['nome'], 'endereco' => $e['endereco'], 'link' => $e['link'],
                     'localidade' => null, 'descricao' => null, 'fotoCapa' => null, 'status' => null, 'diferenciais' => []],
          $pdo->query('SELECT nome, endereco, link FROM empreendimentos ORDER BY ordem ASC')->fetchAll()
        );
      } catch (PDOException $e) {
        try {
          // coluna link ainda não existe (upgrade sem a migração rodada ainda): nome e endereço
          $empreendimentos = array_map(
            fn($e) => ['nome' => $e['nome'], 'endereco' => $e['endereco'], 'link' => null,
                       'localidade' => null, 'descricao' => null, 'fotoCapa' => null, 'status' => null, 'diferenciais' => []],
            $pdo->query('SELECT nome, endereco FROM empreendimentos ORDER BY ordem ASC')->fetchAll()
          );
        } catch (PDOException $e2) {
          try {
            // nem endereço existe ainda: lista só com o nome
            $empreendimentos = array_map(
              fn($n) => ['nome' => $n, 'endereco' => null, 'link' => null,
                         'localidade' => null, 'descricao' => null, 'fotoCapa' => null, 'status' => null, 'diferenciais' => []],
              $pdo->query('SELECT nome FROM empreendimentos ORDER BY ordem ASC')->fetchAll(PDO::FETCH_COLUMN)
            );
          } catch (PDOException $e3) {
            $empreendimentos = [];   // migracao_visitas.sql ainda não importada: o resto do app segue funcionando
          }
        }
      }
    }
  }
  try {
    $localidades = $pdo->query('SELECT nome FROM localidades ORDER BY ordem ASC')->fetchAll(PDO::FETCH_COLUMN);
  } catch (PDOException $e) {
    $localidades = [];   // tabela ainda não criada: o app usa a lista padrão até a primeira vez que a administração salvar
  }
  $modelos  = array_map(
    fn($m) => ['id' => $m['id'], 'nome' => $m['nome'], 'texto' => $m['texto']],
    $pdo->query('SELECT id, nome, texto FROM modelos_mensagem ORDER BY ordem ASC')->fetchAll()
  );
  return ['empresa' => $empresa, 'estagios' => $estagios, 'origens' => $origens, 'empreendimentos' => $empreendimentos, 'localidades' => $localidades, 'modelos' => $modelos];
}

function configGet($pdo) {
  $c = configMontar($pdo);
  echo json_encode($c === null ? ['existe' => false] : ['existe' => true, 'id' => 'app', 'dados' => $c], JSON_UNESCAPED_UNICODE);
}

function configPut($pdo, $dados) {
  if (seEnviado($dados, 'localidades')) garantirLocalidade($pdo);   // antes da transação: o ALTER TABLE a encerraria
  if (seEnviado($dados, 'empreendimentos')) garantirEnderecoEmpreendimento($pdo);
  $pdo->beginTransaction();
  try {
    if (seEnviado($dados, 'empresa')) {
      $pdo->prepare('INSERT INTO config_app (id, empresa) VALUES (1, ?) ON DUPLICATE KEY UPDATE empresa = VALUES(empresa)')
          ->execute([$dados['empresa']]);
    } else {
      $pdo->exec("INSERT IGNORE INTO config_app (id, empresa) VALUES (1, '')");
    }
    if (seEnviado($dados, 'estagios')) {
      $pdo->exec('DELETE FROM estagios');
      $st = $pdo->prepare('INSERT INTO estagios (ordem, nome) VALUES (?,?)');
      foreach (array_values($dados['estagios']) as $i => $nome) $st->execute([$i, $nome]);
    }
    if (seEnviado($dados, 'origens')) {
      $pdo->exec('DELETE FROM origens');
      $st = $pdo->prepare('INSERT INTO origens (ordem, nome) VALUES (?,?)');
      foreach (array_values($dados['origens']) as $i => $nome) $st->execute([$i, $nome]);
    }
    if (seEnviado($dados, 'empreendimentos')) {
      $lista = array_values((array)$dados['empreendimentos']);
      try {
        $pdo->exec('DELETE FROM empreendimentos');
        $st = $pdo->prepare('INSERT INTO empreendimentos (ordem, nome, endereco, link, localidade, descricao, foto_capa, status, diferenciais, ficha) VALUES (?,?,?,?,?,?,?,?,?,?)');
        $i = 0;
        foreach ($lista as $item) {
          $nome = trim((string)(is_array($item) ? ($item['nome'] ?? '') : $item));
          if ($nome === '') continue;
          $nome = function_exists('mb_substr') ? mb_substr($nome, 0, 160) : substr($nome, 0, 160);
          $endereco = is_array($item) ? trim((string)($item['endereco'] ?? '')) : '';
          if ($endereco !== '') $endereco = function_exists('mb_substr') ? mb_substr($endereco, 0, 255) : substr($endereco, 0, 255);
          $link = is_array($item) ? linkEmpreendimentoLimpo($item['link'] ?? '') : null;
          $localidade = is_array($item) ? localidadeLimpa($item['localidade'] ?? '') : null;
          $descricao = is_array($item) ? descricaoEmpreendimentoLimpa($item['descricao'] ?? '') : null;
          $fotoCapa = is_array($item) ? fotoCapaLimpa($item['fotoCapa'] ?? '') : null;
          $status = is_array($item) ? statusEmpreendimentoLimpo($item['status'] ?? '') : null;
          $diferenciais = is_array($item) ? diferenciaisEmpreendimentoLimpos($item['diferenciais'] ?? '') : null;
          $ficha = is_array($item) ? fichaEmpreendimentoLimpa($item['ficha'] ?? null) : null;
          $st->execute([$i, $nome, $endereco !== '' ? $endereco : null, $link, $localidade, $descricao, $fotoCapa, $status, $diferenciais, $ficha]);
          $i++;
        }
      } catch (PDOException $e) {
        // sem a tabela (migração não importada) e sem nada a gravar: segue; com itens a gravar, avisa
        if (!($e->getCode() === '42S02' && count($lista) === 0)) throw $e;
      }
    }
    if (seEnviado($dados, 'localidades')) {
      $pdo->exec('DELETE FROM localidades');
      $st = $pdo->prepare('INSERT INTO localidades (ordem, nome) VALUES (?,?)');
      foreach (array_values((array)$dados['localidades']) as $i => $nome) {
        $nome = localidadeLimpa($nome);
        if ($nome !== null) $st->execute([$i, $nome]);
      }
    }
    if (seEnviado($dados, 'modelos')) {
      $pdo->exec('DELETE FROM modelos_mensagem');
      $st = $pdo->prepare('INSERT INTO modelos_mensagem (id, ordem, nome, texto) VALUES (?,?,?,?)');
      foreach (array_values($dados['modelos']) as $i => $m) $st->execute([$m['id'] ?? gerarId(), $i, $m['nome'] ?? '', $m['texto'] ?? '']);
    }
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  echo json_encode(['ok' => true]);
}


// =====================================================================
// despacho
// =====================================================================

try {
  if ($colecao === 'usuarios') {
    if ($metodo === 'GET') { usuariosGet($pdo, $eu, $id); }
    elseif ($metodo === 'PUT') {
      if (!$id) erro(400, 'id_obrigatorio', 'Falta o id.');
      // Qualquer pessoa edita os próprios nome/e-mail/senha; mudar permissão
      // ou acesso de outra pessoa continua exigindo administração.
      if ($id !== $eu['id']) exigirAdmin($eu);
      usuariosPut($pdo, $souAdmin, $id, corpoJson());
    }
    else {
      exigirAdmin($eu);
      if ($metodo === 'POST') { usuariosPost($pdo, corpoJson()); }
      elseif ($metodo === 'DELETE') { if (!$id) erro(400, 'id_obrigatorio', 'Falta o id.'); usuariosDelete($pdo, $eu, $id); }
      else erro(405, 'metodo_nao_permitido', 'Método não suportado.');
    }
  }
  elseif ($colecao === 'leads') {
    if ($metodo === 'GET') { leadsGet($pdo, $eu, $id); }
    elseif ($metodo === 'POST') {
      if (($_GET['acao'] ?? '') === 'lote') leadsLote($pdo, $eu, corpoJson());
      else leadsPost($pdo, $eu, corpoJson());
    }
    elseif ($metodo === 'PUT') { if (!$id) erro(400, 'id_obrigatorio', 'Falta o id.'); leadsPut($pdo, $eu, $id, corpoJson(), $modo); }
    elseif ($metodo === 'DELETE') { exigirAdmin($eu); if (!$id) erro(400, 'id_obrigatorio', 'Falta o id.'); leadsDelete($pdo, $id); }
    else erro(405, 'metodo_nao_permitido', 'Método não suportado.');
  }
  elseif ($colecao === 'visitas') {
    if ($metodo === 'GET') { visitasGet($pdo, $eu, $id); }
    elseif ($metodo === 'POST') { visitasPost($pdo, $eu, corpoJson()); }
    elseif ($metodo === 'PUT') { if (!$id) erro(400, 'id_obrigatorio', 'Falta o id.'); visitasPut($pdo, $eu, $id, corpoJson()); }
    elseif ($metodo === 'DELETE') { exigirAdmin($eu); if (!$id) erro(400, 'id_obrigatorio', 'Falta o id.'); visitasDelete($pdo, $id); }
    else erro(405, 'metodo_nao_permitido', 'Método não suportado.');
  }
  elseif ($colecao === 'config') {
    if ($metodo === 'GET') { configGet($pdo); }
    elseif ($metodo === 'PUT') { exigirAdmin($eu); configPut($pdo, corpoJson()); }
    else erro(405, 'metodo_nao_permitido', 'Método não suportado para config.');
  }
} catch (PDOException $e) {
  // 42S02 = tabela inexistente: só pode ser visitas/empreendimentos, criadas por migracao_visitas.sql
  if ($e->getCode() === '42S02') erro(503, 'tabela_ausente', 'Falta importar o arquivo migracao_visitas.sql no banco (phpMyAdmin).');
  error_log('[central-de-leads] ' . $e->getMessage());
  erro(500, 'erro_banco', 'Erro ao falar com o banco de dados.');
}
