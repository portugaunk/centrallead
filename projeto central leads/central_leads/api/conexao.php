<?php
/**
 * Preencha com os dados do banco que você criar no cPanel/Hostinger
 * (seção "Bancos de dados MySQL"). O nome de usuário e do banco costumam
 * vir com um prefixo, tipo "usuario_leads".
 */
define('DB_HOST', 'localhost');
define('DB_NOME', 'bdapicorretagem');
define('DB_USUARIO', 'root');
define('DB_SENHA', '');

/**
 * Quem se cadastra pela página cadastro.html entra como "corretor".
 *   true  -> a conta nasce SEM acesso e só entra depois que a administração
 *            liberar em Equipe (recomendado: a página de cadastro é pública).
 *   false -> a conta já nasce liberada e entra direto.
 * A primeira conta do sistema é sempre a administração e sempre liberada.
 */
define('CADASTRO_EXIGE_APROVACAO', true);

function conexao() {
  try {
    $pdo = new PDO(
      'mysql:host=' . DB_HOST . ';dbname=' . DB_NOME . ';charset=utf8mb4',
      DB_USUARIO,
      DB_SENHA,
      [ PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC ]
    );
    return $pdo;
  } catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['erro' => 'sem_conexao', 'mensagem' => 'Não conectou ao banco. Confira as credenciais em api/conexao.php.']);
    exit;
  }
}
