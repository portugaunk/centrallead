<?php
/**
 * api/capa.php — acha a foto de capa de um empreendimento a partir do link do site dele.
 *
 *   POST  body {link: "https://cury.net/imovel/..."}   (só administração)
 *   -> {url: "https://.../foto.jpg"}  ou  {url: null}  se a página não tem imagem de destaque
 *
 * Quem busca é o servidor da central (as páginas das construtoras costumam bloquear robôs,
 * mas aceitam um navegador comum). Só abre sites da lista abaixo, para esta rota não virar
 * um "abridor de qualquer endereço" (SSRF).
 */
require __DIR__ . '/comum.php';
@set_time_limit(120);   // cada busca baixa a página e confere até 5 imagens
iniciarSessao();
$pdo = conexao();
$eu = exigirLogin($pdo);
session_write_close();
exigirAdmin($eu);
exigirAjax();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') erro(405, 'metodo_nao_permitido', 'Método não suportado.');

const SITES_PERMITIDOS = ['cury.net', 'guerato.com.br'];

function hostPermitido($host) {
  $host = strtolower($host);
  foreach (SITES_PERMITIDOS as $s) {
    if ($host === $s || substr($host, -strlen('.' . $s)) === '.' . $s) return true;
  }
  return false;
}

/** Transforma um endereço relativo ("/img/a.jpg", "//cdn/a.jpg") em absoluto, com base na página. */
function urlAbsoluta($u, $base) {
  $u = trim(html_entity_decode($u, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
  if ($u === '') return '';
  if (preg_match('#^https?://#i', $u)) return $u;
  $p = parse_url($base);
  if (!$p || empty($p['host'])) return '';
  if (strpos($u, '//') === 0) return ($p['scheme'] ?? 'https') . ':' . $u;
  $origem = ($p['scheme'] ?? 'https') . '://' . $p['host'];
  if ($u[0] === '/') return $origem . $u;
  return $origem . rtrim(dirname($p['path'] ?? '/'), '/') . '/' . $u;
}

function baixarPagina($url) {
  if (!function_exists('curl_init')) erro(500, 'curl_indisponivel', 'O PHP desta hospedagem está sem a extensão cURL.');
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,   // redirecionamento só para https
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_TIMEOUT => 12,
    CURLOPT_ENCODING => '',
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml', 'Accept-Language: pt-BR,pt;q=0.9'],
  ]);
  $html = curl_exec($ch);
  $codigo = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $final = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
  curl_close($ch);
  if ($html === false || $codigo >= 400) return [null, $codigo, $final];
  return [substr($html, 0, 600000), $codigo, $final];
}

/** og:image / twitter:image / image_src de uma página. */
function imagemDeCompartilhamento($html, $base) {
  $padroes = [
    '#<meta[^>]+(?:property|name)=["\']og:image(?::secure_url)?["\'][^>]*content=["\']([^"\']+)["\']#i',
    '#<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']og:image(?::secure_url)?["\']#i',
    '#<meta[^>]+(?:property|name)=["\']twitter:image(?::src)?["\'][^>]*content=["\']([^"\']+)["\']#i',
    '#<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']twitter:image(?::src)?["\']#i',
    '#<link[^>]+rel=["\']image_src["\'][^>]*href=["\']([^"\']+)["\']#i',
  ];
  foreach ($padroes as $re) {
    if (preg_match($re, $html, $m)) { $u = urlAbsoluta($m[1], $base); if ($u !== '') return $u; }
  }
  return '';
}

/** Chave para comparar endereços de imagem sem se importar com ?parâmetros. */
function chaveImagem($u) { return strtolower(preg_replace('#[?\#].*$#', '', $u)); }

/** Todas as imagens citadas na página (img, srcset, fundo CSS, JSON embutido), na ordem em que aparecem. */
function imagensDaPagina($html, $base) {
  $html = str_replace(['\\u002F', '\\/', '&amp;'], ['/', '/', '&'], $html);
  $achadas = [];
  // endereço completo ou relativo que termine em extensão de imagem
  preg_match_all('#(?:https?:)?//[^\s"\'<>()\\\\,]+?\.(?:jpe?g|webp|png)(?:\?[^\s"\'<>()\\\\,]*)?|["\'(]((?:/|\.\./)[^\s"\'<>()\\\\,]+?\.(?:jpe?g|webp|png)(?:\?[^\s"\'<>()\\\\,]*)?)#i', $html, $m, PREG_SET_ORDER);
  foreach ($m as $x) {
    $u = urlAbsoluta(isset($x[1]) && $x[1] !== '' ? $x[1] : $x[0], $base);
    if ($u !== '' && preg_match('#^https?://[^\s]+$#i', $u) && strlen($u) <= 500) $achadas[chaveImagem($u)] = $achadas[chaveImagem($u)] ?? $u;
  }
  return array_values($achadas);
}

/** Foto de verdade (jpg/webp) e não PNG, que quase sempre é logo. */
function ehFoto($u) { return (bool)preg_match('#\.(jpe?g|webp)$#i', chaveImagem($u)); }

/** Dá nota à imagem: foto de fachada/destaque do empreendimento sobe; logo, ícone e miniatura saem. */
function notaDaImagem($u, $slug) {
  $c = strtolower(urldecode(chaveImagem($u)));
  if (preg_match('#(logo|favicon|icon|sprite|avatar|whatsapp|badge|placeholder|loading|pixel|facebook|instagram|youtube|google|arrow|assinatura|footer|rodape)#', $c)) return -100;
  $n = 0;
  $sl = str_replace('-', '', $slug);
  if ($slug !== '' && (strpos($c, $slug) !== false || strpos(str_replace(['-', '_', ' '], '', $c), $sl) !== false)) $n += 6;
  if (preg_match('#(fachada|facade|perspectiva|destaque|capa|hero|principal|banner|cover|home)#', $c)) $n += 4;
  if (preg_match('#(empreendimento|imovel|imoveis|property|uploads|galeria|gallery)#', $c)) $n += 2;
  if (preg_match('#\.(jpe?g|webp)(\?|$)#', $c)) $n += 2; else $n -= 2;   // PNG: costuma ser logo/ícone/render sem fundo
  if (preg_match('#(thumb|mini|small|-150x|-300x|_s\.|/s/|avatar|\b50x50\b)#', $c)) $n -= 4;
  if (preg_match('#(planta|implantacao|lazer|torre|sala|quarto|cozinha|banheiro|varanda|decorado)#', $c)) $n -= 1;
  return $n;
}


/** O endereço da imagem é https e o servidor dele é público? (a página não pode apontar para a rede interna) */
function hostPublico($url) {
  $p = parse_url($url);
  if (!$p || strtolower($p['scheme'] ?? '') !== 'https' || empty($p['host'])) return false;
  $ip = filter_var($p['host'], FILTER_VALIDATE_IP) ? $p['host'] : gethostbyname($p['host']);
  return (bool)filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}

/** Baixa uma imagem (até $limite bytes) para conferir as medidas. Sem seguir redirecionamento. null = não deu. */
function baixarImagem($url, $ref, $limite = 4000000) {
  if (!function_exists('curl_init') || !hostPublico($url)) return null;
  $dados = '';
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 7,
    CURLOPT_ENCODING => '',
    CURLOPT_REFERER => $ref,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    CURLOPT_HTTPHEADER => ['Accept: image/avif,image/webp,image/*,*/*;q=0.8'],
    CURLOPT_WRITEFUNCTION => function ($ch, $parte) use (&$dados, $limite) {
      $dados .= $parte;
      return strlen($dados) > $limite ? -1 : strlen($parte);   // passou do limite: para de baixar
    },
  ]);
  curl_exec($ch);
  $codigo = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  if ($codigo >= 400 || $dados === '') return null;
  return $dados;
}

/** Olha a imagem de verdade: tamanho, PNG com transparência, quanto dela é fundo branco/transparente e quantas cores tem. */
function analisarImagem($url, $ref) {
  $d = baixarImagem($url, $ref);
  if ($d === null) return null;
  $t = @getimagesizefromstring($d);
  if (!$t) return null;
  $r = ['w' => (int)$t[0], 'h' => (int)$t[1], 'alfa' => false, 'branco' => null, 'cores' => null];
  if (($t[2] ?? 0) === IMAGETYPE_PNG && strlen($d) > 25) { $tipo = ord($d[25]); $r['alfa'] = ($tipo === 4 || $tipo === 6); }
  if (function_exists('imagecreatefromstring') && function_exists('imagescale') && strlen($d) < 4000000) {
    $im = @imagecreatefromstring($d);
    if ($im) {
      if (!imageistruecolor($im)) @imagepalettetotruecolor($im);
      $mini = @imagescale($im, 32, 32);
      if ($mini) {
        $brancos = 0; $bins = [];
        for ($y = 0; $y < 32; $y++) for ($x = 0; $x < 32; $x++) {
          $c = imagecolorat($mini, $x, $y);
          $a = ($c >> 24) & 127; $rr = ($c >> 16) & 255; $g = ($c >> 8) & 255; $b = $c & 255;
          if ($a > 60 || ($rr >= 235 && $g >= 235 && $b >= 235)) $brancos++;
          $bins[(($rr >> 4) << 8) | (($g >> 4) << 4) | ($b >> 4)] = true;
        }
        $r['branco'] = $brancos / 1024;
        $r['cores'] = count($bins);
        imagedestroy($mini);
      }
      imagedestroy($im);
    }
  }
  return $r;
}

/** Motivo de a imagem ser logo/ícone/faixa e não foto de fachada ('' = parece foto). */
function motivoDeLogo($a) {
  if ($a === null) return '';
  if ($a['w'] < 600 || $a['h'] < 300) return 'pequena (' . $a['w'] . 'x' . $a['h'] . ')';
  $prop = $a['w'] / max(1, $a['h']);
  if ($prop > 3.0 || $prop < 0.6) return 'proporção de faixa/ícone';
  if ($a['alfa']) return 'PNG com transparência';
  if ($a['branco'] !== null && $a['branco'] > 0.6) return 'quase toda branca';
  if ($a['cores'] !== null && $a['cores'] < 40) return 'poucas cores (arte gráfica)';
  return '';
}

/** A imagem de compartilhamento da página inicial muda pouco: guarda 6 h para não baixar a home a cada empreendimento. */
function imagemGenericaDoSite($host, $origem) {
  $arq = sys_get_temp_dir() . '/central_capa_generica_' . md5($host) . '.txt';
  if (is_file($arq) && filemtime($arq) > time() - 21600) return (string)@file_get_contents($arq);
  [$htmlHome] = baixarPagina($origem . '/');
  $g = $htmlHome ? imagemDeCompartilhamento($htmlHome, $origem . '/') : '';
  if ($htmlHome) @file_put_contents($arq, $g);
  return $g;
}

$dados = corpoJson();
$link = trim((string)($dados['link'] ?? ''));
$p = parse_url($link);
if (!$p || strtolower($p['scheme'] ?? '') !== 'https' || empty($p['host']) || !hostPermitido($p['host'])) {
  erro(400, 'site_nao_permitido', 'Só consigo buscar a capa em links https de ' . implode(' e ', SITES_PERMITIDOS) . '.');
}

[$html, $codigo, $final] = baixarPagina($link);
$fp = $final ? parse_url($final) : null;
if ($final && (!$fp || empty($fp['host']) || !hostPermitido($fp['host']))) {
  erro(502, 'redirecionou', 'A página mandou para outro site, então não usei.');
}
if ($html === null) {
  erro(502, 'pagina_indisponivel', 'Não consegui abrir a página do empreendimento' . ($codigo ? ' (resposta ' . $codigo . ')' : '') . '. Cole o link da foto à mão.');
}
$base = $final ?: $link;

// A imagem de compartilhamento da página inicial do site é a "genérica" (quase sempre o logo):
// se o empreendimento só repete essa, não serve de capa.
$genericas = [];
$g = imagemGenericaDoSite(strtolower($p['host']), ($p['scheme'] ?? 'https') . '://' . $p['host']);
if ($g !== '') $genericas[chaveImagem($g)] = true;

$slug = strtolower(basename(rtrim((string)($p['path'] ?? ''), '/')));
$candidatas = [];
$og = imagemDeCompartilhamento($html, $base);
if ($og !== '' && !isset($genericas[chaveImagem($og)]) && notaDaImagem($og, $slug) > -100) {
  // a imagem de compartilhamento só leva a vaga de "melhor" se for foto (jpg/webp); PNG quase sempre é logo do projeto
  $candidatas[chaveImagem($og)] = [$og, ehFoto($og) ? 100 : notaDaImagem($og, $slug) - 5];
}
foreach (imagensDaPagina($html, $base) as $i => $u) {
  $k = chaveImagem($u);
  if (isset($genericas[$k]) || isset($candidatas[$k])) continue;
  $nota = notaDaImagem($u, $slug);
  if ($nota <= -100) continue;
  $candidatas[$k] = [$u, $nota - $i * 0.01];   // empate: vale a que aparece primeiro
}
uasort($candidatas, function ($a, $b) { return $b[1] <=> $a[1]; });
$urls = array_values(array_map(function ($x) { return $x[0]; }, $candidatas));

// Confere as melhores candidatas olhando a imagem de verdade (até 5, e para de conferir passados ~35 s para não estourar o tempo
// da hospedagem): a primeira que parece foto vira a capa.
// Logo, ícone, faixa estreita, PNG transparente e imagem quase toda branca ficam de fora.
$escolhida = null; $analise = []; $conferidas = 0; $recusadas = []; $semResposta = [];
$inicio = microtime(true);
foreach (array_slice($urls, 0, 5) as $u) {
  if ($conferidas > 0 && microtime(true) - $inicio > 35) break;
  $a = analisarImagem($u, $base);
  $conferidas++;
  if ($a === null) { $semResposta[] = $u; $analise[] = ['url' => $u, 'ok' => null, 'motivo' => 'não consegui baixar']; continue; }
  $m = motivoDeLogo($a);
  $analise[] = ['url' => $u, 'ok' => $m === '', 'motivo' => $m !== '' ? $m : 'parece foto', 'w' => $a['w'], 'h' => $a['h']];
  if ($m === '') { $escolhida = $u; break; }
  $recusadas[] = $u;
}
// Se nenhuma deu para baixar/conferir (servidor sem GD, imagens bloqueadas), volta à regra antiga: primeira jpg/webp.
if ($escolhida === null && count($semResposta) === $conferidas) {
  $fotos = array_values(array_filter($urls, 'ehFoto'));
  $escolhida = $fotos[0] ?? null;
}
$resto = array_values(array_filter($urls, function ($u) use ($escolhida, $recusadas) { return $u !== $escolhida && !in_array($u, $recusadas, true); }));
$candidatas = $escolhida !== null ? array_merge([$escolhida], $resto) : $resto;
echo json_encode(['url' => $escolhida, 'candidatas' => array_slice($candidatas, 0, 8), 'analise' => $analise], JSON_UNESCAPED_UNICODE);
