-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Tempo de geração: 13/10/2026 às 15:30
-- Versão do servidor: 10.4.32-MariaDB
-- Versão do PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `bdapicorretagem`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `clientes`
--

CREATE TABLE `clientes` (
  `id` char(20) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `senha_hash` varchar(128) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` varchar(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `clientes`
--

INSERT INTO `clientes` (`id`, `nome`, `email`, `telefone`, `senha_hash`, `ativo`, `criado_em`) VALUES
('6b2f8beb534614d0d3a8', 'Pedro', '321312@gmail.com', 'pedrohvleao24@gmail.', '$2y$10$RVXj4GfNLqLhOj9cE2eem.0Ir.agb6B3eWyZ5E99dczVSOCPOmfgG', 1, '2026-09-26T20:46:43.000Z');

-- --------------------------------------------------------

--
-- Estrutura para tabela `clientes_favoritos`
--

CREATE TABLE `clientes_favoritos` (
  `cliente_id` char(20) NOT NULL,
  `empreendimento_id` int(11) NOT NULL,
  `criado_em` varchar(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `config_app`
--

CREATE TABLE `config_app` (
  `id` tinyint(1) NOT NULL DEFAULT 1,
  `empresa` varchar(160) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `config_app`
--

INSERT INTO `config_app` (`id`, `empresa`) VALUES
(1, 'Raiden Consultor');

-- --------------------------------------------------------

--
-- Estrutura para tabela `distribuicao_itens`
--

CREATE TABLE `distribuicao_itens` (
  `id` int(11) NOT NULL,
  `distribuicao_id` char(20) NOT NULL,
  `lead_id` char(20) NOT NULL,
  `de_id` char(20) DEFAULT NULL,
  `corretor_id` char(20) NOT NULL,
  `corretor_nome` varchar(120) NOT NULL,
  `rodada` int(11) NOT NULL,
  `liberar_em` varchar(32) NOT NULL,
  `situacao` enum('pendente','liberado','ignorado','cancelado') NOT NULL DEFAULT 'pendente',
  `liberado_em` varchar(32) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `distribuicoes`
--

CREATE TABLE `distribuicoes` (
  `id` char(20) NOT NULL,
  `criado_em` varchar(32) NOT NULL,
  `criado_por_id` char(20) DEFAULT NULL,
  `criado_por_nome` varchar(120) NOT NULL,
  `superintendencia` varchar(120) DEFAULT NULL,
  `intervalo_min` int(11) NOT NULL,
  `por_rodada` int(11) NOT NULL,
  `total` int(11) NOT NULL,
  `situacao` enum('ativa','concluida','cancelada') NOT NULL DEFAULT 'ativa',
  `encerrada_em` varchar(32) DEFAULT NULL,
  `encerrada_por` varchar(120) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `empreendimentos`
--

CREATE TABLE `empreendimentos` (
  `id` int(11) NOT NULL,
  `ordem` int(11) NOT NULL,
  `nome` varchar(160) NOT NULL,
  `endereco` varchar(255) DEFAULT NULL,
  `link` varchar(500) DEFAULT NULL,
  `localidade` varchar(80) DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  `foto_capa` varchar(500) DEFAULT NULL,
  `status` varchar(60) DEFAULT NULL,
  `diferenciais` text DEFAULT NULL,
  `ficha` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `empreendimentos`
--

INSERT INTO `empreendimentos` (`id`, `ordem`, `nome`, `endereco`, `link`, `localidade`, `descricao`, `foto_capa`, `status`, `diferenciais`, `ficha`) VALUES
(256, 0, 'WL Boa Vista', 'R. Dr. Ferreira Lopes, 97 - Vila Campo Grande, São Paulo - SP', 'https://cury.net/imovel/SP/zona-sul/wl-boa-vista', 'Zona Sul', 'Jurubatuba · Zona Sul. Entrega prevista: Mar/2030. Stand de vendas: Av. Washington Luís, 354 - Santo Amaro.', 'https://cury.net/storage/images/products/gallery/6a838a0a59e16.jpeg', 'Lançamento', 'Piso laminado nos dormitórios\nDuplo acionamento nos vasos sanitários\nArejadores nas torneiras\nPersianas de enrolar e infra de ar-condicionado (46 m²)\nBancada de granito na cozinha e banheiro (46 m²)', '{\"metragem\":\"32 a 46 m²\",\"dormitorios\":\"2\",\"entrega\":\"Mar\\/2030\",\"preco\":\"R$ 247.450\",\"precoAte\":\"2026-11-01\",\"tipologias\":[\"2 dorms · 32 m²\",\"2 dorms com terraço · 36, 37 e 42 m²\",\"2 dorms com terraço e suíte · 46 m²\"]}'),
(257, 1, 'Mérito Ipiranga', 'R. Hipólito Soares, 176 - Ipiranga, São Paulo - SP', 'https://cury.net/imovel/SP/zona-sul/merito-ipiranga', 'Centro', 'Ipiranga · Centro. Entrega prevista: Abr/2030. Stand de vendas: R. Clímaco Barbosa, 750 - Cambuci.', 'https://cury.net/storage/images/products/gallery/6a70d01217a3d.jpeg', 'Lançamento', 'Piso laminado nos dormitórios\nDuplo acionamento nos vasos sanitários\nArejadores nas torneiras\nPersianas de enrolar e infra de ar-condicionado (46 m²)\nBancada de granito na cozinha e banheiro (46 m²)', '{\"metragem\":\"26 a 46 m²\",\"dormitorios\":\"1 e 2\",\"entrega\":\"Abr\\/2030\",\"tipologias\":[\"1 dorm · 26 m²\",\"2 dorms com terraço · 37, 41 e 42 m²\",\"2 dorms com terraço e suíte · 46 m²\"]}'),
(258, 2, 'Urban Vila Guilherme', 'R. Amadeu, 207 - Vila Guilherme, São Paulo - SP', 'https://cury.net/imovel/SP/zona-norte/urban-vila-guilherme', 'Zona Norte', 'Vila Guilherme · Zona Norte. Entrega prevista: Abr/2030. Stand de vendas: Rua José Bernardo Pinto, 1400 - Vila Guilherme.', 'https://cury.net/storage/images/products/gallery/6a6cc1e1c257a.jpeg', 'Lançamento', 'Piso laminado nos dormitórios\nDuplo acionamento nos vasos sanitários\nArejadores nas torneiras\nPersianas de enrolar e infra de ar-condicionado (46 m²)\nBancada de granito na cozinha e banheiro (46 m²)', '{\"metragem\":\"32 a 53 m²\",\"dormitorios\":\"2\",\"entrega\":\"Abr\\/2030\",\"preco\":\"R$ 282.800\",\"precoAte\":\"2026-11-02\",\"tipologias\":[\"2 dorms · 32 m²\",\"2 dorms com terraço · 37, 38, 42, 50 e 53 m²\",\"2 dorms com terraço, suíte e vaga · 45 m²\"]}'),
(259, 3, 'Cidade Parque Guarapiranga - Condomínio Atlântica', 'Rua Olivia Guedes Penteado - Socorro, São Paulo - SP', 'https://cury.net/imovel/SP/zona-sul/cidade-parque-guarapiranga-condominio-atlantica', 'Zona Sul', 'Rio Bonito · Zona Sul. Entrega prevista: Mar/2030.', 'https://cury.net/storage/images/products/gallery/6a3a9e0144d20.jpeg', 'Lançamento', 'Ampla área de lazer\nCondomínio fechado', '{\"metragem\":\"27 a 42 m²\",\"dormitorios\":\"2\",\"entrega\":\"Mar\\/2030\",\"tipologias\":[\"Plantas de 27, 37 e 42 m² com varanda\"]}'),
(260, 4, 'Alto Granja Julieta', 'Rua Professor Manoelito de Ornellas, 116 - Chácara Santo Antônio, São Paulo - SP', 'https://cury.net/imovel/SP/zona-sul/alto-granja-julieta', 'Zona Sul', 'Chácara Santo Antônio · Zona Sul. Entrega prevista: Jan/2030.', 'https://cury.net/storage/images/products/gallery/6a3ac3fd0e072.jpeg', 'Lançamento', 'Ampla área de lazer\nPróximo à Av. Cecília Lottemberg', '{\"metragem\":\"33 a 53 m²\",\"dormitorios\":\"2\",\"entrega\":\"Jan\\/2030\",\"tipologias\":[\"2 dorms sem terraço · 33 m²\",\"2 dorms com terraço · 37, 43 e 44 m²\",\"2 dorms com suíte · 53 m²\"]}'),
(261, 5, 'Bosque da Barra', 'R. Cônego Vicente Miguel Marino, 134 - Barra Funda, São Paulo - SP', 'https://cury.net/imovel/SP/zona-oeste/bosque-da-barra', 'Zona Oeste', 'Barra Funda · Zona Oeste. Entrega prevista: Set/2029. Stand de vendas: Av. Ermano Marchetti, 1009 - Água Branca.', 'https://cury.net/storage/images/products/gallery/6a0c5975e8478.jpeg', 'Lançamento', 'Piso laminado nos dormitórios\nDuplo acionamento nos vasos sanitários\nArejadores nas torneiras\nPersianas de enrolar e infra de ar-condicionado (46 m²)\nBancada de granito na cozinha e banheiro (46 m²)', '{\"metragem\":\"32 a 46 m²\",\"dormitorios\":\"2\",\"entrega\":\"Set\\/2029\",\"preco\":\"R$ 299.599\",\"precoAte\":\"2026-11-01\",\"tipologias\":[\"2 dorms · 32 e 34 m²\",\"2 dorms com terraço · 37, 41 e 42 m²\",\"2 dorms com terraço e suíte · 46 m²\"]}'),
(262, 6, 'Caminhos da Liberdade', 'R. do Lavapés - Liberdade, São Paulo - SP', 'https://cury.net/imovel/SP/zona-sul/caminhos-da-liberdade', 'Centro', 'Cambuci · Centro. Entrega prevista: Set/2029.', 'https://cury.net/storage/images/products/gallery/6a076fc2668ac.jpeg', 'Lançamento', 'Perto de parque\nAmpla área de lazer', '{\"metragem\":\"32 a 53 m²\",\"dormitorios\":\"2\",\"entrega\":\"Set\\/2029\"}'),
(263, 7, 'Cidade Lapa - Perdizes', 'Av. José Maria de Faria - Água Branca, São Paulo - SP', 'https://cury.net/imovel/SP/zona-oeste/cidade-lapa-perdizes', 'Zona Oeste', 'Lapa de Baixo · Zona Oeste. Entrega prevista: Set/2029.', 'https://cury.net/storage/images/products/gallery/6a19f5c6c2636.jpeg', 'Lançamento', 'Mais de 30 opções de lazer\nFácil acesso a vias importantes', '{\"metragem\":\"34 a 46 m²\",\"dormitorios\":\"2\",\"entrega\":\"Set\\/2029\",\"tipologias\":[\"Plantas de 34, 37, 42 e 46 m²\"]}'),
(264, 8, 'Nova Leopoldina - Condomínio Art', 'Rua Othão, 135 - Vila Leopoldina, São Paulo - SP', 'https://cury.net/imovel/SP/zona-oeste/nova-leopoldina-condominio-art', 'Zona Oeste', 'Vila Leopoldina · Zona Oeste. Entrega prevista: Mai/2029.', 'https://cury.net/storage/images/products/gallery/69f0c4f386ab1.jpeg', 'Em obras', 'Perto do CEAGESP e do Parque Villa-Lobos\nPróximo ao Sesc Leopoldina\nFácil acesso à Marginal Tietê e Marginal Pinheiros', '{\"metragem\":\"37 a 42 m²\",\"dormitorios\":\"2\",\"vagas\":\"Sem vaga\",\"entrega\":\"Mai\\/2029\"}'),
(265, 9, 'Parque das Nações - Condomínio Granja Julieta', 'Rua Luiz Seráphico Júnior, 326 - Jardim Caravelas, São Paulo - SP', 'https://cury.net/imovel/SP/zona-sul/parque-das-nacoes-condominio-granja-julieta', 'Zona Sul', 'Rio Bonito · Zona Sul. Entrega prevista: Nov/2029.', 'https://cury.net/storage/images/products/gallery/69eb902467863.jpeg', 'Em obras', 'Perto das estações Granja Julieta e Alto da Boa Vista\nPróximo à Universidade São Judas\nFácil acesso ao Morumbi Shopping', '{\"metragem\":\"32 a 53 m²\",\"dormitorios\":\"1 e 2\",\"entrega\":\"Nov\\/2029\"}'),
(266, 10, 'Alto São Domingos', 'Zona Norte - Pirituba, São Paulo - SP', 'https://www.guerato.com.br/zona-norte/alto-sao-domingos', 'Zona Norte', 'Pirituba · Zona Norte. Entrega prevista: Nov/2027.', 'https://static.wixstatic.com/media/1d445c_3a827935a63a443388613a68dc5e5aff~mv2.jpeg', 'Em obras', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Nov\\/2027\"}'),
(267, 11, 'Dez Limão', 'Zona Norte - Limão, São Paulo - SP', 'https://www.guerato.com.br/zona-norte/dez-limao', 'Zona Norte', 'Limão · Zona Norte. Entrega prevista: Jun/2026.', 'https://static.wixstatic.com/media/1d445c_11d4d6bf8457456a8477220c62935b21~mv2.jpg', 'Pronto para morar', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Jun\\/2026\"}'),
(268, 12, 'Marco Freguesia', 'Zona Norte - Freguesia do Ó, São Paulo - SP', 'https://www.guerato.com.br/zona-norte/marco-freguesia', 'Zona Norte', 'Freguesia do Ó · Zona Norte. Entrega prevista: Mar/2029.', 'https://static.wixstatic.com/media/1d445c_099a408716d8485ba42551d8cb5be1dd~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Mar\\/2029\"}'),
(269, 13, 'Urban Vila Maria II', 'Zona Norte - Vila Maria, São Paulo - SP', 'https://www.guerato.com.br/zona-norte/urban-vila-maria-2', 'Zona Norte', 'Vila Maria · Zona Norte. Entrega prevista: Abr/2027.', 'https://static.wixstatic.com/media/1d445c_66a7870590a341dab674ab26cc0e134e~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"Studio e 2 (opção de suíte)\",\"entrega\":\"Abr\\/2027\"}'),
(270, 14, '360º Park View', 'Zona Norte - City América, São Paulo - SP', 'https://www.guerato.com.br/zona-norte/360-park-view', 'Zona Norte', 'City América · Zona Norte. Entrega prevista: Jan/2028.', 'https://static.wixstatic.com/media/1d445c_26387a8bdb8541e68708d7dd9ed2fe03~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Jan\\/2028\"}'),
(271, 15, 'Urban Vila Maria', 'Zona Norte - Vila Maria, São Paulo - SP', 'https://www.guerato.com.br/zona-norte/urban-vila-maria', 'Zona Norte', 'Vila Maria · Zona Norte. Entrega prevista: Jun/2026.', 'https://static.wixstatic.com/media/1d445c_3e1c1ff6f14c4dfd93c03cbd049ab1d2~mv2.jpg', 'Pronto para morar', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Jun\\/2026\"}'),
(272, 16, 'Praça Santo Antônio', 'Zona Sul - Santo Amaro, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/chacara-santo-antonio', 'Zona Sul', 'Santo Amaro · Zona Sul. Entrega prevista: Mai/2029.', 'https://static.wixstatic.com/media/1d445c_92454269d668484b88d5ff91118f739b~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Mai\\/2029\"}'),
(273, 17, 'Lyke Campo Limpo', 'Zona Sul - Campo Limpo, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/like-campo-limpo', 'Zona Sul', 'Campo Limpo · Zona Sul. Entrega prevista: Abr/2028.', 'https://static.wixstatic.com/media/1d445c_8ffe8985871e4a7cb89a85fe1503a76f~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Abr\\/2028\"}'),
(274, 18, 'Cidade Parque Guarapiranga - Rio Bonito', 'Zona Sul - Rio Bonito, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/cidade-parque-guarapiranga', 'Zona Sul', 'Rio Bonito · Zona Sul. Entrega prevista: Set/2029.', 'https://static.wixstatic.com/media/1d445c_b0964084952647cd9279122ce3ba3a4a~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"1 e 2\",\"entrega\":\"Set\\/2029\"}'),
(275, 19, 'Alto Chácara Santo Antônio', 'Zona Sul - Chácara Santo Antônio, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/alto-chacara-santo-antonio', 'Zona Sul', 'Chácara Santo Antônio · Zona Sul. Entrega prevista: Dez/2028.', 'https://static.wixstatic.com/media/1d445c_bcb936750bc948ee92be5db3e55573c0~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Dez\\/2028\"}'),
(276, 20, 'The One Granja Julieta', 'Zona Sul - Chácara Santo Antônio, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/the-one-granja-julieta', 'Zona Sul', 'Chácara Santo Antônio · Zona Sul. Entrega prevista: Abr/2028.', 'https://static.wixstatic.com/media/1d445c_a999f3a0627f4972a734366da8de02ad~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Abr\\/2028\"}'),
(277, 21, 'Parque das Nações - Cond. Laguna', 'Zona Sul - Chácara Santo Antônio, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/parque-das-nacoes-cond-laguna', 'Zona Sul', 'Chácara Santo Antônio · Zona Sul. Entrega prevista: Fev/2029.', 'https://static.wixstatic.com/media/1d445c_92c5233aacc24685a312779e0fface15~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"1 e 2\",\"entrega\":\"Fev\\/2029\"}'),
(278, 22, 'Neo Sacomã', 'Zona Sul - Sacomã, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/neo-sacoma', 'Zona Sul', 'Sacomã · Zona Sul. Entrega prevista: Ago/2028.', 'https://static.wixstatic.com/media/1d445c_c690e4621eca4c4eada1a0e3338a7569~mv2.jpg/v1/fill/w_265,h_265,al_c,q_80/Maestro.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Ago\\/2028\"}'),
(279, 23, 'The One Chácara Santo Antônio', 'Zona Sul - Chácara Santo Antônio, São Paulo - SP', 'https://www.guerato.com.br/zona-sul/the-one-chacara-santo-antonio', 'Zona Sul', 'Chácara Santo Antônio · Zona Sul. Entrega prevista: Mar/2028.', 'https://static.wixstatic.com/media/1d445c_138ceaa2109f4ac2a6c2c61d7dd548af~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Mar\\/2028\"}'),
(280, 24, 'Novo Mundo Carrão II', 'Zona Leste - Vila Carrão, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/novo-mundo-carrao-2', 'Zona Leste', 'Vila Carrão · Zona Leste. Entrega prevista: Out/2029.', 'https://static.wixstatic.com/media/1d445c_a02c26cf0d1c46379ab9317d77eb6bed~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"1 e 2\",\"entrega\":\"Out\\/2029\"}'),
(281, 25, 'Supreme Anália Franco', 'Zona Leste - Anália Franco, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/supreme-analia-franco', 'Zona Leste', 'Anália Franco · Zona Leste. Entrega prevista: Fev/2028.', 'https://static.wixstatic.com/media/1d445c_d834098d12f94db1845a294785b5bfc3~mv2.jpg/v1/fill/w_265,h_265,al_c,q_80/Supreme.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Fev\\/2028\"}'),
(282, 26, 'Novo Mundo Carrão', 'Zona Leste - Vila Carrão, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/novo-mundo-carrao', 'Zona Leste', 'Vila Carrão · Zona Leste. Entrega prevista: Jul/2029.', 'https://static.wixstatic.com/media/1d445c_974d841a215c4a91a2477d96d564a8a5~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"1 e 2\",\"entrega\":\"Jul\\/2029\"}'),
(283, 27, 'Cidade Mooca - Venezia', 'Zona Leste - Mooca, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/cidade-mooca-venezia', 'Zona Leste', 'Mooca · Zona Leste. Entrega prevista: Jan/2028.', 'https://static.wixstatic.com/media/1d445c_87f3ce78fc0944c5be8565b9021fc17b~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Jan\\/2028\"}'),
(284, 28, 'Cidade Mooca - Navona', 'Zona Leste - Mooca, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/cidade-mooca-navona', 'Zona Leste', 'Mooca · Zona Leste. Entrega prevista: Jun/2027.', 'https://static.wixstatic.com/media/1d445c_a888f3b3b81f408daaefeda97195a3f7~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Jun\\/2027\"}'),
(285, 29, 'Modern Mooca', 'Zona Leste - Mooca, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/modern-mooca', 'Zona Leste', 'Mooca · Zona Leste. Entrega prevista: Jun/2028.', 'https://static.wixstatic.com/media/1d445c_58e39942ad79436ea787d3b6849639f0~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Jun\\/2028\"}'),
(286, 30, 'Mérito Belenzinho', 'Zona Leste - Belenzinho, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/merito-belenzinho', 'Zona Leste', 'Belenzinho · Zona Leste. Entrega prevista: Set/2027.', 'https://static.wixstatic.com/media/1d445c_c2ac17406d4c422a80cc84b0f69ed251~mv2.jpg/v1/fill/w_265,h_265,al_c,q_80/M%C3%A9rito%20Belenzinho.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Set\\/2027\"}'),
(287, 31, 'Cidade Mooca - Duomo', 'Zona Leste - Mooca, São Paulo - SP', 'https://www.guerato.com.br/zona-leste/cidade-mooca-duomo', 'Zona Leste', 'Mooca · Zona Leste. Entrega prevista: Fev/2027.', 'https://static.wixstatic.com/media/1d445c_f76bbc624c7c4a5eb17be9cbdcdebd57~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2 (opção de suíte)\",\"entrega\":\"Fev\\/2027\"}'),
(288, 32, 'Parque das Perdizes', 'Av. Thomas Edison - Barra Funda, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/parque-das-perdizes', 'Zona Oeste', 'Barra Funda · Zona Oeste. Entrega prevista: Breve lançamento. Stand de vendas: R. Padre Luís Alves de Siqueira, 953 - Barra Funda.', 'https://static.wixstatic.com/media/1d445c_78e01d54071f412f802a89f6366736ef~mv2.jpg', 'Lançamento', 'Piso laminado nos dormitórios\nDuplo acionamento nos vasos sanitários\nArejadores nas torneiras\nPersianas de enrolar e infra de ar-condicionado (52 m²)\nBancada de granito na cozinha e banheiro (52 m²)', '{\"metragem\":\"25 a 52 m²\",\"dormitorios\":\"1 e 2\",\"entrega\":\"Breve lançamento\",\"preco\":\"R$ 239.000\",\"precoAte\":\"2026-11-01\",\"tipologias\":[\"1 dorm com terraço · 25 m²\",\"2 dorms com terraço · 37 e 38 m²\",\"2 dorms com terraço e suíte · 52 m²\"]}'),
(289, 33, 'Cidade Villa Lobos - Tenor', 'Zona Oeste - Jaguaré, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/cidade-villa-lobos-condominio-tenor', 'Zona Oeste', 'Jaguaré · Zona Oeste. Entrega prevista: Abr/2029.', 'https://static.wixstatic.com/media/1d445c_456f74a60ac440c1b71001925b9ba8a6~mv2.jpg/v1/fill/w_265,h_265,al_c,q_80/VIlla%20Lobos.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Abr\\/2029\"}'),
(290, 34, 'Barra Funda 900', 'Zona Oeste - Barra Funda, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/barra-funda-900', 'Zona Oeste', 'Barra Funda · Zona Oeste. Entrega prevista: Mar/2029.', 'https://static.wixstatic.com/media/1d445c_38fba7ffbfd742cca0b75fc9d9c3d14a~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Mar\\/2029\"}'),
(291, 35, 'Mérito Lapa', 'Zona Oeste - Lapa, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/merito-lapa', 'Zona Oeste', 'Lapa · Zona Oeste. Entrega prevista: Jan/2029.', 'https://static.wixstatic.com/media/1d445c_074ae3c1df5c4f3db61f75c5c521a243~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Jan\\/2029\"}'),
(292, 36, 'Barra Funda 930', 'Zona Oeste - Barra Funda, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/barra-funda-930', 'Zona Oeste', 'Barra Funda · Zona Oeste. Entrega prevista: Out/2028.', 'https://static.wixstatic.com/media/1d445c_35e1a1eca2b646738559396fd750a564~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Out\\/2028\"}'),
(293, 37, 'Lyne Água Branca', 'Zona Oeste - Água Branca, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/lyne-agua-branca', 'Zona Oeste', 'Água Branca · Zona Oeste. Entrega prevista: Dez/2029.', 'https://static.wixstatic.com/media/1d445c_21cd334739044575ae5a6a0747e91266~mv2.jpg/v1/fill/w_265,h_265,al_c,q_80/Lyne%20Agua%20Branca.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Dez\\/2029\"}'),
(294, 38, 'Supreme Vila Romana', 'Zona Oeste - Vila Romana, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/supreme-vila-romana', 'Zona Oeste', 'Vila Romana · Zona Oeste. Entrega prevista: Jan/2029.', 'https://static.wixstatic.com/media/1d445c_e53f9aac41eb49d98de3ea6161cc1c36~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"1 e 2\",\"entrega\":\"Jan\\/2029\"}'),
(295, 39, 'Atmosfera', 'Zona Oeste - Jaguaré, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/atmosfera', 'Zona Oeste', 'Jaguaré · Zona Oeste. Entrega prevista: Nov/2028.', 'https://static.wixstatic.com/media/1d445c_42b6d350a33348b1aea12be5d1588bc6~mv2.jpeg', 'Em obras', NULL, '{\"dormitorios\":\"1 e 2\",\"entrega\":\"Nov\\/2028\"}'),
(296, 40, 'Astro Santa Marina', 'Zona Oeste - Santa Marina, São Paulo - SP', 'https://www.guerato.com.br/zona-oeste/astro-santa-marina', 'Zona Oeste', 'Santa Marina · Zona Oeste. Entrega prevista: Set/2028.', 'https://static.wixstatic.com/media/1d445c_7b7837705f4b46ef80834da7ceb0bd3d~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"1 e 2\",\"entrega\":\"Set\\/2028\"}'),
(297, 41, 'Next Guarulhos', 'Guarulhos - SP', 'https://www.guerato.com.br/guarulhos/next-guarulhos', 'Guarulhos', 'Guarulhos. Entrega prevista: Abr/2029.', 'https://static.wixstatic.com/media/1d445c_7127abf2f9d34070a18e88f61f449801~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Abr\\/2029\"}'),
(298, 42, 'Mérito Guarulhos', 'Guarulhos - SP', 'https://www.guerato.com.br/guarulhos/merito-guarulhos', 'Guarulhos', 'Guarulhos. Entrega prevista: Ago/2028.', 'https://static.wixstatic.com/media/1d445c_58aa832ab43b41d3a722bb429d5f610a~mv2.jpg', 'Em obras', NULL, '{\"dormitorios\":\"2\",\"entrega\":\"Ago\\/2028\"}');

-- --------------------------------------------------------

--
-- Estrutura para tabela `estagios`
--

CREATE TABLE `estagios` (
  `id` int(11) NOT NULL,
  `ordem` int(11) NOT NULL,
  `nome` varchar(60) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `estagios`
--

INSERT INTO `estagios` (`id`, `ordem`, `nome`) VALUES
(1, 0, 'Novo'),
(2, 1, 'Em contato'),
(3, 2, 'Qualificado'),
(4, 3, 'Visita'),
(5, 4, 'Proposta'),
(6, 5, 'Fechado'),
(7, 6, 'Perdido');

-- --------------------------------------------------------

--
-- Estrutura para tabela `leads`
--

CREATE TABLE `leads` (
  `id` char(20) NOT NULL,
  `nome` varchar(160) NOT NULL,
  `telefone` varchar(20) NOT NULL,
  `telefone_original` varchar(40) DEFAULT NULL,
  `email` varchar(160) DEFAULT NULL,
  `origem` varchar(80) DEFAULT NULL,
  `interesse` varchar(255) DEFAULT NULL,
  `localidade` varchar(80) DEFAULT NULL,
  `valor` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(60) NOT NULL,
  `proximo_contato` date DEFAULT NULL,
  `obs` text DEFAULT NULL,
  `responsavel_id` char(20) DEFAULT NULL,
  `historico` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`historico`)),
  `criado_em` varchar(32) NOT NULL,
  `atualizado_em` varchar(32) NOT NULL,
  `ultimo_contato` varchar(32) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `localidades`
--

CREATE TABLE `localidades` (
  `id` int(11) NOT NULL,
  `ordem` int(11) NOT NULL,
  `nome` varchar(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `localidades`
--

INSERT INTO `localidades` (`id`, `ordem`, `nome`) VALUES
(1, 0, 'Zona Norte'),
(2, 1, 'Zona Sul'),
(3, 2, 'Zona Leste'),
(4, 3, 'Zona Oeste'),
(5, 4, 'Centro'),
(6, 5, 'Guarulhos');

-- --------------------------------------------------------

--
-- Estrutura para tabela `modelos_mensagem`
--

CREATE TABLE `modelos_mensagem` (
  `id` char(20) NOT NULL,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `nome` varchar(120) NOT NULL,
  `texto` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `modelos_mensagem`
--

INSERT INTO `modelos_mensagem` (`id`, `ordem`, `nome`, `texto`) VALUES
('m1', 0, 'Primeiro contato', 'Olá {{primeiro_nome}}, tudo bem? Aqui é {{corretor}}, da {{empresa}}. Vi que você demonstrou interesse em {{interesse}}. Posso te mandar algumas opções por aqui?'),
('m2', 1, 'Retomada', 'Oi {{primeiro_nome}}! Passando para saber se você ainda tem interesse em {{interesse}}. Consigo separar novidades que chegaram essa semana.'),
('m3', 2, 'Confirmar visita', 'Oi {{primeiro_nome}}, confirmando nossa visita ao {{empreendimento}} no dia {{data_visita}}, às {{hora_visita}}. Qualquer imprevisto é só me chamar por aqui. Abraço, {{corretor}}.');

-- --------------------------------------------------------

--
-- Estrutura para tabela `origens`
--

CREATE TABLE `origens` (
  `id` int(11) NOT NULL,
  `ordem` int(11) NOT NULL,
  `nome` varchar(60) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `origens`
--

INSERT INTO `origens` (`id`, `ordem`, `nome`) VALUES
(1, 0, 'Site'),
(2, 1, 'Instagram'),
(3, 2, 'Facebook'),
(4, 3, 'Google'),
(5, 4, 'Indicação'),
(6, 5, 'Portal'),
(7, 6, 'Telefone'),
(8, 7, 'Outro');

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id` char(20) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `papel` enum('admin','corretor') NOT NULL DEFAULT 'corretor',
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `sal` varchar(64) NOT NULL,
  `hash` varchar(128) NOT NULL,
  `criado_em` varchar(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `usuarios`
--

INSERT INTO `usuarios` (`id`, `nome`, `email`, `papel`, `ativo`, `sal`, `hash`, `criado_em`) VALUES
('889bb961392dcad05f94', 'Pedro viana', 'joao@gmail.com', 'corretor', 0, '', '$2y$10$p1ZJiOGsBBnOZT8Cx3hvFOPwqYLYCAHvdrGVcVyqgbS2cLOq2bX6q', '2026-10-13T12:51:19.000Z'),
('c56a562997d1e2c225eb', 'Pedro Viana', 'pedrohvleao24@gmail.com', 'admin', 1, '', '$2y$10$.61Fn0qSAwXw6ipKj7C57Op6te4I/7xIw9jAxuXMn.aUnVfM7VkkG', '2026-09-26T20:45:45.000Z'),
('e006532fbf7be38747d6', 'Roberto', 'gomessroberto@gmail.com', 'corretor', 1, '', '$2y$10$azQrXZeGvctNgAan3uDEAeZa1HzaL730ejgkH0INGOFCqwkMdFRMC', '2026-09-26T20:46:16.000Z');

-- --------------------------------------------------------

--
-- Estrutura para tabela `visitas`
--

CREATE TABLE `visitas` (
  `id` char(20) NOT NULL,
  `lead_id` char(20) NOT NULL,
  `empreendimento` varchar(160) NOT NULL,
  `data_hora` datetime NOT NULL,
  `status` enum('agendada','realizada','cancelada','faltou') NOT NULL DEFAULT 'agendada',
  `obs` text DEFAULT NULL,
  `criado_em` varchar(32) NOT NULL,
  `atualizado_em` varchar(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `clientes`
--
ALTER TABLE `clientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_clientes_email` (`email`);

--
-- Índices de tabela `clientes_favoritos`
--
ALTER TABLE `clientes_favoritos`
  ADD PRIMARY KEY (`cliente_id`,`empreendimento_id`);

--
-- Índices de tabela `config_app`
--
ALTER TABLE `config_app`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `distribuicao_itens`
--
ALTER TABLE `distribuicao_itens`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_dist_itens_fila` (`situacao`,`liberar_em`),
  ADD KEY `idx_dist_itens_dist` (`distribuicao_id`),
  ADD KEY `idx_dist_itens_lead` (`lead_id`);

--
-- Índices de tabela `distribuicoes`
--
ALTER TABLE `distribuicoes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_distribuicoes_criado` (`criado_em`);

--
-- Índices de tabela `empreendimentos`
--
ALTER TABLE `empreendimentos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_empreendimentos_localidade` (`localidade`);

--
-- Índices de tabela `estagios`
--
ALTER TABLE `estagios`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `leads`
--
ALTER TABLE `leads`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_leads_status` (`status`),
  ADD KEY `idx_leads_responsavel` (`responsavel_id`),
  ADD KEY `idx_leads_telefone` (`telefone`),
  ADD KEY `idx_leads_localidade` (`localidade`);

--
-- Índices de tabela `localidades`
--
ALTER TABLE `localidades`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `modelos_mensagem`
--
ALTER TABLE `modelos_mensagem`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `origens`
--
ALTER TABLE `origens`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_usuarios_email` (`email`);

--
-- Índices de tabela `visitas`
--
ALTER TABLE `visitas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_visitas_data` (`data_hora`),
  ADD KEY `idx_visitas_lead` (`lead_id`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `distribuicao_itens`
--
ALTER TABLE `distribuicao_itens`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `empreendimentos`
--
ALTER TABLE `empreendimentos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=299;

--
-- AUTO_INCREMENT de tabela `estagios`
--
ALTER TABLE `estagios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT de tabela `localidades`
--
ALTER TABLE `localidades`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de tabela `origens`
--
ALTER TABLE `origens`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `distribuicao_itens`
--
ALTER TABLE `distribuicao_itens`
  ADD CONSTRAINT `fk_dist_itens_dist` FOREIGN KEY (`distribuicao_id`) REFERENCES `distribuicoes` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_dist_itens_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `leads`
--
ALTER TABLE `leads`
  ADD CONSTRAINT `fk_leads_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL;

--
-- Restrições para tabelas `visitas`
--
ALTER TABLE `visitas`
  ADD CONSTRAINT `fk_visitas_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
