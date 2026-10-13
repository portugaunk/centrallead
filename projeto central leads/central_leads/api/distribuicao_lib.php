<?php
/**
 * api/distribuicao_lib.php — distribuição gradual de leads.
 *
 * A administração escolhe um grupo de leads e uma lista de corretores; o sistema
 * planeja quem recebe qual lead e em qual "rodada". Os leads NÃO mudam de dono na
 * hora: cada um fica agendado (tabela distribuicao_itens) e só passa para o corretor
 * quando chega o horário da rodada dele (ex.: 1 lead por corretor a cada 10 minutos).
 *
 * Não há cron: toda chamada de api/dados.php (as telas abertas consultam a cada 4 s)
 * confere se existe algo vencido e libera. Se ninguém abrir o sistema por um tempo, as
 * rodadas atrasadas saem todas juntas na próxima abertura — nada se perde.
 *
 * Só funções de apoio aqui; quem responde às telas é api/distribuicao.php.
 */

const DISTRIB_TRAVA = 'central_leads_distribuicao';

function distribAgoraIso($ts = null) {
  return gmdate('Y-m-d\TH:i:s.000\Z', $ts ?? time());
}

/**
 * Cria as tabelas na primeira vez. CREATE TABLE fecha qualquer transação aberta,
 * então isto roda ANTES de beginTransaction.
 */
function distribGarantirTabelas($pdo) {
  static $pronto = false;
  if ($pronto) return;
  try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS distribuicoes (
      id               CHAR(20)     NOT NULL PRIMARY KEY,
      criado_em        VARCHAR(32)  NOT NULL,
      criado_por_id    CHAR(20)     NULL,
      criado_por_nome  VARCHAR(120) NOT NULL,
      superintendencia VARCHAR(120) NULL,
      intervalo_min    INT          NOT NULL,
      por_rodada       INT          NOT NULL,
      total            INT          NOT NULL,
      situacao         ENUM('ativa','concluida','cancelada') NOT NULL DEFAULT 'ativa',
      encerrada_em     VARCHAR(32)  NULL,
      encerrada_por    VARCHAR(120) NULL,
      KEY idx_distribuicoes_criado (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS distribuicao_itens (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      distribuicao_id CHAR(20)     NOT NULL,
      lead_id         CHAR(20)     NOT NULL,
      de_id           CHAR(20)     NULL,
      corretor_id     CHAR(20)     NOT NULL,
      corretor_nome   VARCHAR(120) NOT NULL,
      rodada          INT          NOT NULL,
      liberar_em      VARCHAR(32)  NOT NULL,
      situacao        ENUM('pendente','liberado','ignorado','cancelado') NOT NULL DEFAULT 'pendente',
      liberado_em     VARCHAR(32)  NULL,
      KEY idx_dist_itens_fila (situacao, liberar_em),
      KEY idx_dist_itens_dist (distribuicao_id),
      KEY idx_dist_itens_lead (lead_id),
      CONSTRAINT fk_dist_itens_dist FOREIGN KEY (distribuicao_id) REFERENCES distribuicoes(id) ON DELETE CASCADE,
      CONSTRAINT fk_dist_itens_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pronto = true;
  } catch (PDOException $e) {
    error_log('[central-de-leads] distribuicao (tabelas): ' . $e->getMessage());
    erro(503, 'esquema_distribuicao', 'Não consegui criar as tabelas da distribuição no banco. Importe o arquivo migracao_distribuicao.sql no phpMyAdmin.');
  }
}

/**
 * Função pura (sem banco): reparte os leads entre os corretores, "dando as cartas" em
 * rodízio, e diz em qual rodada e a que horas cada um cai.
 *   $leads      lista de ids de lead, na ordem em que devem ser entregues
 *   $corretores lista de ['id' => ..., 'quantidade' => N], na ordem do rodízio
 *   $porRodada  quantos leads cada corretor recebe por rodada
 *   $intervaloMin minutos entre uma rodada e a seguinte
 *   $inicio     timestamp da primeira rodada
 * Devolve uma lista de ['lead' => id, 'corretor' => id, 'rodada' => n, 'ts' => timestamp].
 */
function distribPlanejar(array $leads, array $corretores, $porRodada, $intervaloMin, $inicio) {
  $porRodada = max(1, (int)$porRodada);
  $intervaloMin = max(1, (int)$intervaloMin);
  $ids = []; $restante = []; $entregues = [];
  foreach ($corretores as $c) {
    $ids[] = $c['id'];
    $restante[$c['id']] = (int)$c['quantidade'];
    $entregues[$c['id']] = 0;
  }
  $n = count($ids);
  $plano = [];
  if ($n === 0) return $plano;
  $ponteiro = 0;
  foreach ($leads as $lead) {
    $achou = null;
    for ($t = 0; $t < $n; $t++) {
      $cand = $ids[($ponteiro + $t) % $n];
      if ($restante[$cand] > 0) { $achou = $cand; $ponteiro = ($ponteiro + $t + 1) % $n; break; }
    }
    if ($achou === null) break;   // todas as cotas cumpridas
    $rodada = intdiv($entregues[$achou], $porRodada);
    $entregues[$achou]++;
    $restante[$achou]--;
    $plano[] = ['lead' => $lead, 'corretor' => $achou, 'rodada' => $rodada, 'ts' => $inicio + $rodada * $intervaloMin * 60];
  }
  return $plano;
}

/** Libera o que já venceu. Barato quando não há nada: uma consulta e sai. */
function distribProcessar($pdo, $forcar = false) {
  static $rodou = false;
  if ($rodou && !$forcar) return;
  $rodou = true;
  try {
    $agora = distribAgoraIso();
    $q = $pdo->prepare("SELECT 1 FROM distribuicao_itens WHERE situacao = 'pendente' AND liberar_em <= ? LIMIT 1");
    $q->execute([$agora]);
    if (!$q->fetch()) return;
    // uma tela por vez: sem isto, dois pedidos simultâneos poderiam entregar o mesmo lead duas vezes
    $trava = (int)$pdo->query("SELECT GET_LOCK('" . DISTRIB_TRAVA . "', 0)")->fetchColumn();
    if ($trava !== 1) return;
    try {
      distribLiberarVencidos($pdo, $agora);
    } finally {
      $pdo->query("SELECT RELEASE_LOCK('" . DISTRIB_TRAVA . "')")->fetchAll();
    }
  } catch (PDOException $e) {
    if ($e->getCode() !== '42S02') error_log('[central-de-leads] distribuicao: ' . $e->getMessage());   // 42S02: tabelas ainda não criadas, normal
  } catch (Throwable $e) {
    error_log('[central-de-leads] distribuicao: ' . $e->getMessage());
  }
}

function distribLiberarVencidos($pdo, $agora) {
  $usuarios = [];
  foreach ($pdo->query('SELECT id, nome, ativo FROM usuarios')->fetchAll() as $u) $usuarios[$u['id']] = $u;

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("SELECT i.id, i.distribuicao_id, i.lead_id, i.de_id, i.corretor_id,
                                d.criado_por_nome, d.superintendencia
                           FROM distribuicao_itens i
                           JOIN distribuicoes d ON d.id = i.distribuicao_id
                          WHERE i.situacao = 'pendente' AND i.liberar_em <= ?
                          ORDER BY i.liberar_em ASC, i.id ASC
                          LIMIT 1000");
    $st->execute([$agora]);
    $itens = $st->fetchAll();

    $buscaLead = $pdo->prepare('SELECT responsavel_id, historico FROM leads WHERE id = ? FOR UPDATE');
    $mudaLead  = $pdo->prepare('UPDATE leads SET responsavel_id = ?, historico = ?, atualizado_em = ? WHERE id = ?');
    $fechaItem = $pdo->prepare('UPDATE distribuicao_itens SET situacao = ?, liberado_em = ? WHERE id = ?');

    foreach ($itens as $it) {
      $corretor = $usuarios[$it['corretor_id']] ?? null;
      if (!$corretor || !$corretor['ativo']) { $fechaItem->execute(['cancelado', null, $it['id']]); continue; }   // pessoa removida ou sem acesso: o lead fica onde estava

      $buscaLead->execute([$it['lead_id']]);
      $lead = $buscaLead->fetch();
      if (!$lead) { $fechaItem->execute(['ignorado', null, $it['id']]); continue; }
      // alguém mexeu no responsável nesse meio tempo (atribuição manual): respeita e não sobrescreve
      if ((string)($lead['responsavel_id'] ?? '') !== (string)($it['de_id'] ?? '')) { $fechaItem->execute(['ignorado', null, $it['id']]); continue; }

      $hist = $lead['historico'] ? json_decode($lead['historico'], true) : [];
      if (!is_array($hist)) $hist = [];
      $texto = 'Responsável: ' . $corretor['nome'] . ' (distribuído por ' . $it['criado_por_nome']
             . (($it['superintendencia'] ?? '') !== '' ? ', superintendência ' . $it['superintendencia'] : '') . ')';
      $hist[] = ['em' => $agora, 'por' => $it['criado_por_nome'], 'tipo' => 'atribuicao', 'texto' => $texto];
      $hist = array_slice($hist, -60);
      $mudaLead->execute([$it['corretor_id'], json_encode($hist, JSON_UNESCAPED_UNICODE), $agora, $it['lead_id']]);
      $fechaItem->execute(['liberado', $agora, $it['id']]);
    }

    // distribuições sem nada pendente viram "concluída"
    $resta = $pdo->prepare("SELECT COUNT(*) FROM distribuicao_itens WHERE distribuicao_id = ? AND situacao = 'pendente'");
    $conclui = $pdo->prepare("UPDATE distribuicoes SET situacao = 'concluida', encerrada_em = ? WHERE id = ? AND situacao = 'ativa'");
    foreach (array_values(array_unique(array_column($itens, 'distribuicao_id'))) as $did) {   // (id só de dígitos viraria número se fosse chave de array)
      $resta->execute([$did]);
      if ((int)$resta->fetchColumn() === 0) $conclui->execute([$agora, $did]);
    }
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}
