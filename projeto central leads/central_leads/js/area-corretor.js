/* =====================================================================
   Área do Corretor — tela "Início" do perfil corretor (painel.html)

   O que esta tela responde, nesta ordem:
     1. O que preciso fazer agora?        -> faixa de destaque + "Precisa da sua atenção"
     2. Quais leads precisam de resposta? -> cartões de resumo + lista de atenção
     3. Quais visitas tenho hoje?         -> "Minha agenda"
     4. Quais negócios estão perto de fechar? -> "Meus negócios" (funil arrastável)
     5. Quanto estou vendendo?            -> "Minhas vendas"
     6. Como está minha performance?      -> "Meu desempenho"

   COMO OS DADOS CHEGAM
   Tudo que a tela mostra vem de UM objeto, o "modelo" (ver forma abaixo).
   Existem duas fontes que produzem esse mesmo objeto:
     - fonteReal()  : calcula a partir de E.leads, E.visitas e E.config (dados do sistema)
     - fonteDemo()  : dados fictícios, só para demonstração
   Para ligar em dados reais não é preciso mexer no desenho: basta
   DEMO_PADRAO = false (abaixo) ou o corretor clicar em "Usar meus dados".

   FORMA DO MODELO
   {
     fonte: 'real' | 'demo',
     nome: 'Naylla',
     agoraMin: 612,                       // minutos desde 00:00 (marca o "próximo" na agenda)
     destaque: [{ tipo:'urgente'|'visita'|'proposta'|'venda', titulo, texto, acao? }],
     resumo: { novos, semResposta, visitasHoje, propostas },
     atencao: [{ id, leadId, nome, detalhe, statusTexto, tempoTexto, prioridade:'urgente'|'atencao'|'normal',
                 acao:{ rotulo, tipo:'whatsapp'|'visita'|'lead', leadId, visitaId }, pulsa? }],
     agenda: [{ id, hora:'09:30', tipo:'visita'|'ligacao'|'followup', titulo, detalhe, leadId?, visitaId? }],
     imoveis: [{ id, nome, unidade, areaM2, preco, interessados, leads, visitas, status }],
     funil: [{ id, rotulo, leads:[{ id, nome, valor }] }],        // 6 etapas, em ordem
     vendas: { vendido, comissaoPrevista, comissaoRecebida, vendasMes },
     desempenho: { recebidos, atendidos, visitas, propostas, fechamentos, conversao, variacao }
   }
   ===================================================================== */

const AreaCorretor = (function () {

  /** true = abre com dados fictícios (com aviso na tela). false = abre direto com os dados do sistema. */
  const DEMO_PADRAO = true;
  /** Comissão usada para estimar "comissão prevista" quando o sistema ainda não guarda o percentual por venda. */
  const COMISSAO_PADRAO = 0.03;

  const ETAPAS = [
    { id: 'novos',        rotulo: 'Novos' },
    { id: 'contato',      rotulo: 'Contato' },
    { id: 'qualificados', rotulo: 'Qualificados' },
    { id: 'visita',       rotulo: 'Visita' },
    { id: 'proposta',     rotulo: 'Proposta' },
    { id: 'fechados',     rotulo: 'Fechados' }
  ];

  const ESTADOS_DEMO = [
    ['normal',      'Dia normal'],
    ['sem-leads',   'Sem leads'],
    ['sem-visitas', 'Sem visitas hoje'],
    ['sem-acoes',   'Nenhuma ação pendente'],
    ['urgente',     'Lead urgente'],
    ['proposta',    'Nova proposta'],
    ['visita',      'Visita próxima'],
    ['venda',       'Venda fechada']
  ];

  const store = {
    demo: null,            // true/false (lido de localStorage na primeira vez)
    estadoDemo: 'normal',
    modeloDemo: null,      // o modelo demo é guardado para as mudanças feitas ao arrastar persistirem
    feitos: new Set(),     // ações já feitas (só na demonstração: o item some da lista)
    busca: '',
    ligado: false
  };

  /* ------------------------- utilitários ------------------------- */

  const el = (s, r) => (r || document).querySelector(s);
  const dinheiro = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const semAc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function lerDemo() {
    if (store.demo !== null) return store.demo;
    let v = DEMO_PADRAO;
    try { const s = localStorage.getItem('ac_demo'); if (s === '0') v = false; else if (s === '1') v = true; } catch (e) {}
    store.demo = v;
    return v;
  }
  function gravarDemo(v) {
    store.demo = v;
    try { localStorage.setItem('ac_demo', v ? '1' : '0'); } catch (e) {}
  }

  function tempoTexto(min) {
    if (min == null) return '';
    if (min < 1) return 'agora há pouco';
    if (min < 60) return `há ${Math.round(min)} min`;
    if (min < 60 * 24) return `há ${Math.floor(min / 60)}h`;
    const d = Math.floor(min / 1440);
    return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  const minutosDesde = iso => { const t = new Date(iso).getTime(); return isNaN(t) ? null : (Date.now() - t) / 60000; };
  const horaParaMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };

  function dataExtenso() {
    const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* Preço vigente de um empreendimento: ficha.preco só vale até ficha.precoAte (fim da validade da tabela).
     Passou da data, vira "sob consulta" sozinho, em vez de mostrar valor vencido. */
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function precoVigenteTexto(e) {
    const f = (e && e.ficha) || {};
    return f.preco && (!f.precoAte || f.precoAte >= hojeISO()) ? String(f.preco) : '';
  }
  function precoNumero(t) {
    const m = String(t || '').match(/(\d[\d.]*(?:,\d+)?)/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    if (isNaN(v)) return null;
    return /milh/i.test(t) ? v * 1e6 : /\bmil\b/i.test(t) ? v * 1e3 : v;
  }

  /* =====================================================================
     FONTE DEMO — dados fictícios, só para demonstração
     ===================================================================== */

  function fonteDemo(estado) {
    // 31 leads fictícios distribuídos como no funil: 12 → 8 → 5 → 3 → 2 → 1
    const nomes = [
      'João Silva', 'Fernanda Lima', 'Bruno Tavares', 'Camila Duarte', 'Diego Martins', 'Elaine Rocha', 'Felipe Andrade',
      'Gabriela Nogueira', 'Henrique Pires', 'Isabela Moraes', 'Juliano Barros', 'Karina Lopes',
      'Mariana Costa', 'Nelson Prado', 'Olívia Campos', 'Paulo Mendes', 'Renata Veiga', 'Sérgio Lacerda', 'Tatiane Freitas', 'Ulisses Cardoso',
      'Vanessa Pinto', 'Wagner Teixeira', 'Yara Fontes', 'Zeca Monteiro', 'Adriana Selva',
      'Carlos Almeida', 'Beatriz Souza', 'Lucas Ferraz',
      'Roberto Nunes', 'Patrícia Gomes',
      'Marcelo Vidal'
    ];
    // Preços reais da Guerato (tabelas vigentes de 07/10 a 01/11/2026): são os menores valores com unidade disponível.
    const valores = [239000, 247450, 282800, 299000, 299599, 309929, 257550, 292900, 309929, 247450, 282800, 299000];
    const dist = [12, 8, 5, 3, 2, 1];
    let k = 0;
    const funil = ETAPAS.map((e, i) => ({
      id: e.id, rotulo: e.rotulo,
      leads: Array.from({ length: dist[i] }, () => {
        const n = nomes[k], id = 'd' + (k + 1);
        const l = { id, nome: n, valor: valores[(k * 5) % valores.length] };
        k++; return l;
      })
    }));
    const ajusta = (nome, valor) => { funil.forEach(f => f.leads.forEach(l => { if (l.nome === nome) l.valor = valor; })); };
    ajusta('João Silva', 239000); ajusta('Mariana Costa', 247450); ajusta('Carlos Almeida', 282800); ajusta('Fernanda Lima', 299599);
    ajusta('Roberto Nunes', 299000); ajusta('Lucas Ferraz', 257550); ajusta('Patrícia Gomes', 282800); ajusta('Marcelo Vidal', 309929);
    const ref = (nome, preco) => nome + ' • a partir de ' + dinheiro(preco);
    const idDe = nome => { for (const f of funil) { const l = f.leads.find(x => x.nome === nome); if (l) return l.id; } return ''; };

    const m = {
      fonte: 'demo',
      nome: 'Naylla',
      agoraMin: horaParaMin('10:12'),
      destaque: [],
      resumo: { novos: 8, semResposta: 3, visitasHoje: 2, propostas: 1 },
      atencao: [
        { id: 'a1', leadId: idDe('João Silva'), nome: 'João Silva', detalhe: ref('Parque das Perdizes', 239000), statusTexto: 'Novo lead', tempoTexto: 'há 12 min', prioridade: 'urgente', tipo: 'novo',
          acao: { rotulo: 'Enviar WhatsApp', tipo: 'whatsapp', leadId: idDe('João Silva') } },
        { id: 'a2', leadId: idDe('Mariana Costa'), nome: 'Mariana Costa', detalhe: ref('WL Boa Vista', 247450), statusTexto: 'Aguardando resposta', tempoTexto: 'há 2h', prioridade: 'atencao', tipo: 'resposta',
          acao: { rotulo: 'Responder', tipo: 'whatsapp', leadId: idDe('Mariana Costa') } },
        { id: 'a3', leadId: idDe('Carlos Almeida'), nome: 'Carlos Almeida', detalhe: ref('Urban Vila Guilherme', 282800), statusTexto: 'Visita amanhã às 14:00', tempoTexto: '', prioridade: 'normal', tipo: 'visita',
          acao: { rotulo: 'Ver visita', tipo: 'visita', leadId: idDe('Carlos Almeida') } },
        { id: 'a4', leadId: idDe('Fernanda Lima'), nome: 'Fernanda Lima', detalhe: ref('Bosque da Barra', 299599), statusTexto: 'Novo lead', tempoTexto: 'há 38 min', prioridade: 'urgente', tipo: 'novo',
          acao: { rotulo: 'Enviar WhatsApp', tipo: 'whatsapp', leadId: idDe('Fernanda Lima') } },
        { id: 'a5', leadId: idDe('Roberto Nunes'), nome: 'Roberto Nunes', detalhe: 'Parque das Perdizes • 2 dorms • ' + dinheiro(299000), statusTexto: 'Proposta sem retorno', tempoTexto: 'há 3 dias', prioridade: 'atencao', tipo: 'proposta',
          acao: { rotulo: 'Acompanhar', tipo: 'lead', leadId: idDe('Roberto Nunes') } }
      ],
      agenda: [
        { id: 'g1', hora: '09:30', tipo: 'visita',   titulo: 'Visita — Parque das Perdizes', detalhe: 'com Beatriz Souza' },
        { id: 'g2', hora: '11:00', tipo: 'ligacao',  titulo: 'Ligação — João Silva',          detalhe: 'primeiro contato', leadId: idDe('João Silva') },
        { id: 'g3', hora: '14:30', tipo: 'visita',   titulo: 'Visita — Urban Vila Guilherme', detalhe: 'com Paulo Mendes' },
        { id: 'g4', hora: '16:00', tipo: 'followup', titulo: 'Follow-up — Mariana Costa',     detalhe: 'retomar a conversa', leadId: idDe('Mariana Costa') }
      ],
      imoveis: [
        { id: 'i1', nome: 'Parque das Perdizes', unidade: '1 dorm com terraço',   areaM2: 25, preco: 239000, interessados: 24, leads: 5, visitas: 2, status: 'Lançamento' },
        { id: 'i2', nome: 'WL Boa Vista',        unidade: '2 dorms',              areaM2: 32, preco: 247450, interessados: 18, leads: 4, visitas: 1, status: 'Últimas unidades' },
        { id: 'i3', nome: 'Urban Vila Guilherme', unidade: '2 dorms com terraço', areaM2: 37, preco: 282800, interessados: 31, leads: 7, visitas: 3, status: 'Lançamento' },
        { id: 'i4', nome: 'Parque das Perdizes', unidade: '2 dorms com terraço',  areaM2: 37, preco: 299000, interessados: 12, leads: 3, visitas: 1, status: 'Lançamento' },
        { id: 'i5', nome: 'Bosque da Barra',     unidade: '2 dorms',              areaM2: 34, preco: 299599, interessados: 9,  leads: 2, visitas: 0, status: 'Últimas unidades' },
        { id: 'i6', nome: 'Bosque da Barra',     unidade: '2 dorms com terraço',  areaM2: 37, preco: 309929, interessados: 6,  leads: 1, visitas: 0, status: 'Disponível' }
      ],
      funil,
      vendas: { vendido: 309929, comissaoPrevista: 9298, comissaoRecebida: 3099, vendasMes: 1 },
      desempenho: { recebidos: 31, atendidos: 28, visitas: 9, propostas: 4, fechamentos: 2, conversao: 6.5, variacao: 18 }
    };

    const move = (nome, paraId) => {
      let l = null;
      funil.forEach(f => { const i = f.leads.findIndex(x => x.nome === nome); if (i > -1) l = f.leads.splice(i, 1)[0]; });
      if (l) funil.find(f => f.id === paraId).leads.push(l);
    };

    switch (estado) {
      case 'sem-leads':
        funil.forEach(f => { f.leads = []; });
        m.resumo = { novos: 0, semResposta: 0, visitasHoje: 0, propostas: 0 };
        m.atencao = []; m.agenda = [];
        m.vendas = { vendido: 0, comissaoPrevista: 0, comissaoRecebida: 0, vendasMes: 0 };
        m.desempenho = { recebidos: 0, atendidos: 0, visitas: 0, propostas: 0, fechamentos: 0, conversao: 0, variacao: null };
        m.imoveis.forEach(i => { i.interessados = 0; i.leads = 0; i.visitas = 0; });
        break;
      case 'sem-visitas':
        m.agenda = m.agenda.filter(a => a.tipo !== 'visita');
        m.resumo.visitasHoje = 0;
        break;
      case 'sem-acoes':
        m.atencao = []; m.resumo.novos = 0; m.resumo.semResposta = 0;
        break;
      case 'urgente':
        m.atencao[0].pulsa = true;
        m.destaque.push({ tipo: 'urgente', titulo: 'Lead novo esperando atendimento',
          texto: 'João Silva chegou há 12 min. Quem responde nos primeiros minutos tem muito mais chance de marcar a visita.',
          acao: { rotulo: 'Enviar WhatsApp', tipo: 'whatsapp', leadId: idDe('João Silva') } });
        break;
      case 'proposta':
        move('Lucas Ferraz', 'proposta');
        m.resumo.propostas = 2;
        m.destaque.push({ tipo: 'proposta', titulo: 'Nova proposta registrada',
          texto: 'Lucas Ferraz • WL Boa Vista • ' + dinheiro(257550) + '. Acompanhe o retorno do cliente nos próximos dias.',
          acao: { rotulo: 'Ver proposta', tipo: 'lead', leadId: idDe('Lucas Ferraz') } });
        break;
      case 'visita':
        m.agoraMin = horaParaMin('13:42');
        m.destaque.push({ tipo: 'visita', titulo: 'Sua próxima visita começa em 48 min',
          texto: 'Urban Vila Guilherme às 14:30, com Paulo Mendes. Vale confirmar a presença antes de sair.',
          acao: { rotulo: 'Confirmar por WhatsApp', tipo: 'whatsapp', leadId: idDe('Paulo Mendes') } });
        break;
      case 'venda':
        m.vendas.vendasMes = 2; m.vendas.vendido = 592729; m.vendas.comissaoPrevista = 17782;
        m.desempenho.fechamentos = 3; m.desempenho.conversao = 9.7;
        move('Patrícia Gomes', 'fechados');
        m.destaque.push({ tipo: 'venda', titulo: 'Venda fechada! Parabéns',
          texto: 'Patrícia Gomes • Urban Vila Guilherme • ' + dinheiro(282800) + ' • comissão prevista de ' + dinheiro(8484) + '. Boa, Naylla.',
          acao: null });
        break;
    }
    return m;
  }

  /* =====================================================================
     FONTE REAL — calcula tudo a partir dos dados do sistema (E.leads, E.visitas, E.config)
     ===================================================================== */

  function fonteReal() {
    const estagios = E.config?.estagios || ESTAGIOS_PADRAO;
    const meus = leadsVisiveis();
    const hoje = hojeLocal(), amanha = somarDias(hoje, 1);
    const ag = new Date();
    const idsMeus = new Set(meus.map(l => l.id));
    const etapaDe = l => { const i = estagios.indexOf(l.status); return i > -1 && i < ETAPAS.length ? i : -1; };
    const zaps = l => (l.historico || []).filter(h => h.tipo === 'whatsapp');
    const ultimoZap = l => { const z = zaps(l); return z.length ? z[z.length - 1].em : null; };
    const aberto = l => { const i = etapaDe(l); return i > -1 && i < 5; };
    const nomeEstagioNovo = estagios[0], nomeProposta = estagios[4], nomeFechado = estagios[5];

    // visitas dos meus leads
    const visitas = E.visitas.filter(v => idsMeus.has(v.leadId));
    const visHoje = visitas.filter(v => v.status === 'agendada' && diaDaVisita(v) === hoje).sort((a, b) => a.dataHora.localeCompare(b.dataHora));
    const visAmanha = visitas.filter(v => v.status === 'agendada' && diaDaVisita(v) === amanha);

    // lista "Precisa da sua atenção"
    const itens = [];
    // empreendimentos cadastrados (com a ficha: preço vigente da tabela, entrega…)
    const emps0 = (E.config?.empreendimentos || []).map(e => typeof e === 'string' ? { nome: e } : e).filter(e => e && e.nome);
    const empPorNome = nome => {
      const a = semAc(nome); if (a.length < 4) return null;
      return emps0.find(e => semAc(e.nome) === a) || emps0.find(e => { const n = semAc(e.nome); return n.length >= 4 && (a.includes(n) || n.includes(a)); }) || null;
    };
    // "Empreendimento • a partir de R$ X" com o preço da tabela vigente; vencida ou sem preço, mostra "preço sob consulta"
    // (o valor do negócio do lead só aparece quando o empreendimento não é reconhecido)
    const detalheDe = l => {
      const e = empPorNome(l.interesse), p = e ? precoVigenteTexto(e) : '';
      const partes = [e ? e.nome : (l.interesse || null), p ? 'a partir de ' + p : (e ? 'preço sob consulta' : (Number(l.valor) ? moeda(l.valor) : null))];
      return partes.filter(Boolean).join(' • ') || (l.origem || 'Sem interesse informado');
    };
    meus.forEach(l => {
      if (!aberto(l)) return;
      const detalhe = detalheDe(l);
      const zap = ultimoZap(l);
      const min = minutosDesde(zap || l.criadoEm);
      if (l.status === nomeEstagioNovo && !zap) {
        itens.push({ id: 'n' + l.id, leadId: l.id, nome: l.nome, detalhe, statusTexto: 'Novo lead', tempoTexto: tempoTexto(minutosDesde(l.criadoEm)), prioridade: 'urgente', tipo: 'novo',
          ordem: minutosDesde(l.criadoEm) ?? 9e9, acao: { rotulo: 'Enviar WhatsApp', tipo: 'whatsapp', leadId: l.id } });
      } else if (zap && min != null && min >= 120 && min <= 60 * 24 * 7 && etapaDe(l) <= 2) {
        itens.push({ id: 'r' + l.id, leadId: l.id, nome: l.nome, detalhe, statusTexto: 'Aguardando resposta', tempoTexto: tempoTexto(min), prioridade: min > 60 * 24 ? 'atencao' : 'atencao', tipo: 'resposta',
          ordem: min, acao: { rotulo: 'Responder', tipo: 'whatsapp', leadId: l.id } });
      } else if (l.proximoContato && l.proximoContato <= hoje) {
        itens.push({ id: 'p' + l.id, leadId: l.id, nome: l.nome, detalhe, statusTexto: 'Retorno marcado para ' + dataCurta(l.proximoContato), tempoTexto: '', prioridade: 'atencao', tipo: 'retorno',
          ordem: 1e6, acao: { rotulo: 'Retomar', tipo: 'whatsapp', leadId: l.id } });
      } else if (l.status === nomeProposta) {
        const parado = minutosDesde(l.atualizadoEm || l.criadoEm);
        if (parado != null && parado > 60 * 24 * 3) {
          itens.push({ id: 'q' + l.id, leadId: l.id, nome: l.nome, detalhe, statusTexto: 'Proposta sem retorno', tempoTexto: tempoTexto(parado), prioridade: 'atencao', tipo: 'proposta',
            ordem: 2e6, acao: { rotulo: 'Acompanhar', tipo: 'lead', leadId: l.id } });
        }
      }
    });
    [...visHoje, ...visAmanha].forEach(v => {
      const l = meus.find(x => x.id === v.leadId); if (!l) return;
      const eHoje = diaDaVisita(v) === hoje;
      const faltam = (new Date(v.dataHora).getTime() - ag.getTime()) / 60000;
      itens.push({ id: 'v' + v.id, leadId: l.id, nome: l.nome, detalhe: (() => { const e = empPorNome(v.empreendimento), p = e ? precoVigenteTexto(e) : ''; return [v.empreendimento, p ? 'a partir de ' + p : (e ? 'preço sob consulta' : (Number(l.valor) ? moeda(l.valor) : null))].filter(Boolean).join(' • '); })(),
        statusTexto: `Visita ${eHoje ? 'hoje' : 'amanhã'} às ${horaDaVisita(v)}`, tempoTexto: '',
        prioridade: eHoje && faltam <= 120 ? 'atencao' : 'normal', tipo: 'visita', ordem: 3e6 + new Date(v.dataHora).getTime() / 1e6,
        acao: { rotulo: 'Ver visita', tipo: 'visita', leadId: l.id, visitaId: v.id } });
    });
    const peso = { urgente: 0, atencao: 1, normal: 2 };
    itens.sort((a, b) => peso[a.prioridade] - peso[b.prioridade] || a.ordem - b.ordem);

    // resumo
    const resumo = {
      novos: itens.filter(i => i.tipo === 'novo').length,
      semResposta: itens.filter(i => i.tipo === 'resposta').length,
      visitasHoje: visHoje.length,
      propostas: meus.filter(l => l.status === nomeProposta).length
    };

    // agenda de hoje: visitas com horário + retornos marcados para hoje
    const agenda = visHoje.map(v => {
      const l = meus.find(x => x.id === v.leadId);
      return { id: 'g' + v.id, hora: horaDaVisita(v), tipo: 'visita', titulo: 'Visita — ' + (v.empreendimento || 'sem empreendimento'), detalhe: l ? 'com ' + l.nome : '', leadId: v.leadId, visitaId: v.id };
    });
    meus.filter(l => l.proximoContato === hoje && aberto(l)).forEach(l => {
      agenda.push({ id: 'f' + l.id, hora: '', tipo: 'followup', titulo: 'Follow-up — ' + l.nome, detalhe: l.interesse || '', leadId: l.id });
    });

    // imóveis: empreendimentos cadastrados, com o preço vigente da tabela (fora da validade fica sem preço)
    const imoveis = emps0.map((e, i) => {
      const alvo = semAc(e.nome), f = e.ficha || {};
      const leadsDele = meus.filter(l => semAc(l.interesse).includes(alvo));
      const vis = visitas.filter(v => semAc(v.empreendimento) === alvo);
      const unidade = e.unidade || [f.dormitorios ? f.dormitorios + ' dorm.' : '', f.metragem || '', f.entrega ? 'entrega ' + f.entrega : ''].filter(Boolean).join(' • ') || e.endereco || '';
      return { id: 'e' + i, nome: e.nome, unidade, areaM2: null, preco: precoNumero(precoVigenteTexto(e)),
        interessados: leadsDele.length, leads: leadsDele.length, visitas: vis.length, status: e.status || 'Disponível' };
    }).sort((a, b) => (b.preco ? 1 : 0) - (a.preco ? 1 : 0));   // quem tem preço vigente aparece primeiro

    // funil: uma coluna por etapa (as 6 primeiras do sistema; "Perdido" fica fora)
    const funil = ETAPAS.map((e, i) => ({
      id: e.id, rotulo: e.rotulo,
      leads: meus.filter(l => l.status === estagios[i]).sort((a, b) => String(b.atualizadoEm || b.criadoEm || '').localeCompare(String(a.atualizadoEm || a.criadoEm || '')))
        .map(l => ({ id: l.id, nome: l.nome, valor: Number(l.valor) || 0 }))
    }));

    // vendas e desempenho do mês
    const mes = hoje.slice(0, 7);
    const mesAnt = (() => { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
    const doMes = (iso, m) => String(iso || '').slice(0, 7) === m;
    const fechados = meus.filter(l => l.status === nomeFechado);
    const fechadosMes = fechados.filter(l => doMes(l.atualizadoEm || l.criadoEm, mes));
    const vendido = fechadosMes.reduce((t, l) => t + (Number(l.valor) || 0), 0);
    const recebidos = meus.filter(l => doMes(l.criadoEm, mes));
    const recebAnt = meus.filter(l => doMes(l.criadoEm, mesAnt));
    const atendidos = recebidos.filter(l => zaps(l).length > 0 || etapaDe(l) > 0).length;
    const vMes = visitas.filter(v => String(diaDaVisita(v)).slice(0, 7) === mes && v.status !== 'cancelada').length;
    const propsMes = meus.filter(l => etapaDe(l) >= 4 && doMes(l.atualizadoEm || l.criadoEm, mes)).length;
    const convAnt = recebAnt.length ? meus.filter(l => doMes(l.criadoEm, mesAnt) && l.status === nomeFechado).length / recebAnt.length : null;
    const conv = recebidos.length ? fechadosMes.length / recebidos.length : 0;
    const variacao = convAnt ? Math.round((conv - convAnt) / convAnt * 100) : null;

    // faixa de destaque: no máximo uma, na ordem de importância
    const destaque = [];
    const novoUrgente = itens.find(i => i.tipo === 'novo');
    const proxVisita = visHoje.find(v => { const f = (new Date(v.dataHora).getTime() - ag.getTime()) / 60000; return f > 0 && f <= 90; });
    const vendaRecente = fechadosMes.find(l => (minutosDesde(l.atualizadoEm) ?? 1e9) < 60 * 48);
    const propostaRecente = meus.find(l => l.status === nomeProposta && (minutosDesde(l.atualizadoEm) ?? 1e9) < 60 * 24);
    if (novoUrgente) { novoUrgente.pulsa = true; }
    if (proxVisita) {
      const l = meus.find(x => x.id === proxVisita.leadId);
      const f = Math.round((new Date(proxVisita.dataHora).getTime() - ag.getTime()) / 60000);
      destaque.push({ tipo: 'visita', titulo: `Sua próxima visita começa em ${f} min`, texto: `${proxVisita.empreendimento || 'Visita'} às ${horaDaVisita(proxVisita)}${l ? ', com ' + l.nome : ''}.`,
        acao: { rotulo: 'Ver visita', tipo: 'visita', leadId: proxVisita.leadId, visitaId: proxVisita.id } });
    } else if (novoUrgente && (parseInt(novoUrgente.tempoTexto.replace(/\D/g, ''), 10) || 0) >= 0) {
      destaque.push({ tipo: 'urgente', titulo: 'Lead novo esperando atendimento', texto: `${novoUrgente.nome} chegou ${novoUrgente.tempoTexto}. Quem responde nos primeiros minutos tem mais chance de marcar visita.`,
        acao: novoUrgente.acao });
    }
    if (vendaRecente) {
      destaque.unshift({ tipo: 'venda', titulo: 'Venda fechada! Parabéns', texto: `${vendaRecente.nome}${Number(vendaRecente.valor) ? ' • ' + moeda(vendaRecente.valor) : ''}.`, acao: null });
    } else if (propostaRecente) {
      destaque.push({ tipo: 'proposta', titulo: 'Nova proposta registrada', texto: `${propostaRecente.nome}${Number(propostaRecente.valor) ? ' • ' + moeda(propostaRecente.valor) : ''}.`,
        acao: { rotulo: 'Ver proposta', tipo: 'lead', leadId: propostaRecente.id } });
    }

    return {
      fonte: 'real',
      nome: (E.eu?.nome || '').split(' ')[0],
      agoraMin: ag.getHours() * 60 + ag.getMinutes(),
      destaque: destaque.slice(0, 2),
      resumo, atencao: itens, agenda, imoveis, funil,
      vendas: {
        vendido,
        comissaoPrevista: Math.round(vendido * COMISSAO_PADRAO),
        comissaoRecebida: fechadosMes.reduce((t, l) => t + (Number(l.comissaoRecebida) || 0), 0),
        vendasMes: fechadosMes.length
      },
      desempenho: { recebidos: recebidos.length, atendidos, visitas: vMes, propostas: propsMes, fechamentos: fechadosMes.length, conversao: Math.round(conv * 1000) / 10, variacao }
    };
  }

  /* ------------------------- modelo atual ------------------------- */

  function modelo() {
    if (lerDemo()) {
      if (!store.modeloDemo) store.modeloDemo = fonteDemo(store.estadoDemo);
      const m = store.modeloDemo;
      // ações já feitas somem da lista e baixam os contadores
      const visiveis = m.atencao.filter(i => !store.feitos.has(i.id));
      const feitos = m.atencao.filter(i => store.feitos.has(i.id));
      return { ...m, atencao: visiveis, resumo: {
        ...m.resumo,
        novos: Math.max(0, m.resumo.novos - feitos.filter(i => i.tipo === 'novo').length),
        semResposta: Math.max(0, m.resumo.semResposta - feitos.filter(i => i.tipo === 'resposta').length)
      } };
    }
    return fonteReal();
  }
  function reiniciarDemo(estado) {
    store.estadoDemo = estado; store.modeloDemo = null; store.feitos = new Set();
  }

  /* =====================================================================
     DESENHO
     ===================================================================== */

  const ICONES_AGENDA = { visita: '⌂', ligacao: '☎', followup: '↻' };
  const ROTULOS_AGENDA = { visita: 'Visita', ligacao: 'Ligação', followup: 'Follow-up' };

  function htmlFaixaDemo() {
    if (!lerDemo()) {
      return `<div class="ac-demo-barra ac-demo-leve"><span>Mostrando os seus dados.</span><button class="btn btn-min" data-ac="demo-ligar">Ver demonstração</button></div>`;
    }
    return `<div class="ac-demo-barra" role="note">
      <span class="ac-demo-selo">Demonstração</span>
      <span class="ac-demo-txt">Dados fictícios, só para você ver a tela.</span>
      <label class="ac-demo-sim">Simular
        <select id="ac-estado">${ESTADOS_DEMO.map(([v, r]) => `<option value="${v}" ${v === store.estadoDemo ? 'selected' : ''}>${r}</option>`).join('')}</select>
      </label>
      <button class="btn btn-min" data-ac="demo-desligar">Usar meus dados</button>
    </div>`;
  }

  function htmlDestaque(m) {
    if (!m.destaque.length) return '';
    const icone = { urgente: '🔥', visita: '📅', proposta: '🎯', venda: '✓' };
    return `<div class="ac-destaques" id="ac-destaques">${m.destaque.map((d, i) => `
      <div class="ac-destaque d-${d.tipo}" role="status">
        <span class="ac-destaque-ic" aria-hidden="true">${icone[d.tipo] || '•'}</span>
        <div class="ac-destaque-txt"><b>${esc(d.titulo)}</b><span>${esc(d.texto)}</span></div>
        ${d.acao ? `<button class="btn ${d.acao.tipo === 'whatsapp' ? 'btn-zap' : 'btn-primario'}" data-ac="destaque" data-i="${i}">${esc(d.acao.rotulo)}</button>` : ''}
        <button class="ac-fechar" data-ac="fechar-destaque" data-i="${i}" aria-label="Dispensar aviso">×</button>
      </div>`).join('')}</div>`;
  }

  function htmlKpis(m) {
    const r = m.resumo;
    const cards = [
      { k: 'novos',       ic: '🔥', n: r.novos,       l: 'Leads novos',  h: r.novos ? 'ainda sem contato' : 'tudo atendido', alvo: '#ac-atencao', tom: 'sinal' },
      { k: 'semResposta', ic: '💬', n: r.semResposta, l: 'Sem resposta', h: r.semResposta ? 'esperando você' : 'nenhuma conversa parada', alvo: '#ac-atencao', tom: 'ambar' },
      { k: 'visitasHoje', ic: '📅', n: r.visitasHoje, l: 'Visitas hoje', h: r.visitasHoje ? 'veja na agenda' : 'agenda livre', alvo: '#ac-agenda', tom: 'acento' },
      { k: 'propostas',   ic: '🎯', n: r.propostas,   l: 'Propostas',    h: r.propostas ? 'aguardando o cliente' : 'nenhuma em aberto', alvo: '#ac-negocios', tom: 'zap' }
    ];
    return cards.map(c => `
      <button class="ac-kpi t-${c.tom}${c.n === 0 ? ' zero' : ''}" data-ac="rolar" data-alvo="${c.alvo}" id="ac-kpi-${c.k}">
        <span class="ac-kpi-ic" aria-hidden="true">${c.ic}</span>
        <span class="ac-kpi-corpo"><span class="v num">${c.n}</span><span class="l">${c.l}</span><span class="h">${c.h}</span></span>
      </button>`).join('');
  }

  function htmlItem(it) {
    const feito = store.feitos.has(it.id);
    const prio = { urgente: 'Prioridade urgente', atencao: 'Pede atenção', normal: 'Ação normal' }[it.prioridade];
    const btn = it.acao.tipo === 'whatsapp' ? 'btn-zap' : '';
    return `<li class="ac-item p-${it.prioridade}${it.pulsa ? ' pulsa' : ''}${feito ? ' feito' : ''}" data-item="${esc(it.id)}">
      <span class="ac-prio" aria-hidden="true"></span>
      <div class="ac-av" aria-hidden="true">${esc(iniciais(it.nome))}</div>
      <div class="ac-item-txt">
        <span class="ac-sr">${prio}. </span>
        <b class="nome-lead" data-ac="abrir-lead" data-id="${esc(it.leadId)}">${esc(it.nome)}</b>
        <div class="linha2">${esc(it.detalhe)}</div>
        <div class="ac-item-meta"><i class="ac-ponto p-${it.prioridade}" aria-hidden="true"></i><span>${esc(it.statusTexto)}</span>${it.tempoTexto ? `<span class="ac-sep">•</span><span>${esc(it.tempoTexto)}</span>` : ''}</div>
      </div>
      <button class="btn ${btn} ac-item-btn" data-ac="item" data-item="${esc(it.id)}">${esc(it.acao.rotulo)}</button>
    </li>`;
  }

  function htmlAtencao(m) {
    const itens = m.atencao.slice(0, 8);
    const semLeads = m.funil.every(f => f.leads.length === 0);
    let corpo;
    if (itens.length) {
      corpo = `<ul class="ac-lista">${itens.map(htmlItem).join('')}</ul>
        ${m.atencao.length > itens.length ? `<div class="ac-mais"><button class="btn btn-min" data-ir="leads">Ver todos os ${m.atencao.length}</button></div>` : ''}`;
    } else if (semLeads) {
      corpo = `<div class="ac-vazio"><div class="ac-vazio-ic" aria-hidden="true">🔥</div><b>Você ainda não tem leads</b>
        <p>Quando a administração atribuir leads a você, eles aparecem aqui já ordenados por urgência. Dá para começar cadastrando o primeiro.</p>
        ${perm('criar') ? `<button class="btn btn-primario" data-ac="novo-lead">+ Novo lead</button>` : ''}</div>`;
    } else {
      corpo = `<div class="ac-vazio ok"><div class="ac-vazio-ic ok" aria-hidden="true">✓</div><b>Nenhuma ação pendente</b>
        <p>Todos os leads estão em dia. Bom momento para ligar para quem está em Qualificados ou revisar as propostas em aberto.</p>
        <button class="btn" data-ir="leads">Ver meus leads</button></div>`;
    }
    return `<div class="ac-titulo"><h2>Precisa da sua atenção</h2>${itens.length ? `<span class="ac-contagem num">${m.atencao.length}</span>` : ''}</div>
      <p class="sub ac-sub">Do mais urgente para o mais tranquilo.</p>${corpo}`;
  }

  function htmlAgenda(m) {
    let corpo;
    if (m.agenda.length) {
      const prox = m.agenda.findIndex(a => a.hora && horaParaMin(a.hora) >= m.agoraMin);
      corpo = `<ol class="ac-linha-tempo">${m.agenda.map((a, i) => {
        const passou = a.hora && horaParaMin(a.hora) < m.agoraMin;
        return `<li class="ac-ev tp-${a.tipo}${passou ? ' passou' : ''}${i === prox ? ' proximo' : ''}">
          <time class="num">${a.hora ? esc(a.hora) : 'Hoje'}</time>
          <span class="ac-ev-no" aria-hidden="true">${passou ? '✓' : ''}</span>
          <div class="ac-ev-corpo">
            <b>${esc(a.titulo)}</b>
            <div class="linha2"><span class="ac-ev-tipo">${ICONES_AGENDA[a.tipo]} ${ROTULOS_AGENDA[a.tipo]}</span>${a.detalhe ? ' · ' + esc(a.detalhe) : ''}${i === prox ? ' · <b class="ac-prox">próximo</b>' : ''}</div>
          </div></li>`;
      }).join('')}</ol>`;
    } else {
      corpo = `<div class="ac-vazio compacto"><div class="ac-vazio-ic" aria-hidden="true">📅</div><b>Sem visitas hoje</b>
        <p>Sua agenda está livre. Que tal marcar visitas com os leads que já estão qualificados?</p></div>`;
    }
    return `<div class="ac-titulo"><h2>Minha agenda</h2></div><p class="sub ac-sub">Compromissos de hoje.</p>${corpo}
      <div class="ac-agenda-pe"><button class="btn" data-ir="visitas">Ver agenda completa</button><button class="btn btn-primario" data-ac="agendar">+ Agendar visita</button></div>`;
  }

  function htmlChip(l, comNova) {
    return `<div class="ac-chip${comNova ? ' nova' : ''}" data-id="${esc(l.id)}" tabindex="0" role="button" aria-label="${esc(l.nome)}. Use as setas para mover de etapa.">
      <span class="ac-grip" aria-hidden="true">⋮⋮</span>
      <span class="ac-chip-txt"><span class="ac-chip-nome">${esc(l.nome)}</span>${l.valor ? `<span class="ac-chip-valor num">${esc(dinheiroCurto(l.valor))}</span>` : ''}</span>
    </div>`;
  }
  function dinheiroCurto(v) {
    const n = Number(v) || 0;
    if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
    return 'R$ ' + Math.round(n / 1000) + ' mil';
  }

  function htmlFunil(m, ultimo) {
    const MAX = 4;
    const total = m.funil.reduce((t, f) => t + f.leads.length, 0);
    if (!total) {
      return `<div class="ac-vazio compacto"><div class="ac-vazio-ic" aria-hidden="true">🎯</div><b>Nenhum negócio em andamento</b><p>Seus leads aparecem aqui, etapa por etapa, assim que chegarem.</p></div>`;
    }
    return `<div class="ac-funil" role="list">${m.funil.map((f, i) => `
      <div class="ac-etapa e${i + 1}${f.id === 'proposta' ? ' quase' : ''}" data-etapa="${f.id}" role="listitem">
        <div class="ac-seta"><span class="ac-seta-rot">${esc(f.rotulo.toUpperCase())}</span><span class="ac-n num${ultimo && ultimo.etapa === f.id ? ' bump' : ''}">${f.leads.length}</span></div>
        <div class="ac-zona" aria-label="${esc(f.rotulo)}">
          ${f.leads.slice(0, MAX).map(l => htmlChip(l, ultimo && ultimo.id === l.id)).join('')}
          ${f.leads.length > MAX ? `<button class="ac-mais-chip" data-ir="leads">+ ${f.leads.length - MAX} ${f.leads.length - MAX === 1 ? 'lead' : 'leads'}</button>` : ''}
          ${!f.leads.length ? '<div class="ac-zona-vazia">solte aqui</div>' : ''}
        </div>
      </div>`).join('')}</div>
      <p class="ac-dica">Arraste um lead pela etapa para atualizar o negócio. No teclado, use as setas ← →.</p>`;
  }

  function htmlImovel(im) {
    const partes = [im.unidade, im.areaM2 ? im.areaM2 + ' m²' : null].filter(Boolean).join(' • ');
    const tom = /negocia|reserv/i.test(im.status) ? 'amb' : /ltim|poucas/i.test(im.status) ? 'sin' : /lan/i.test(im.status) ? 'ace' : 'ok';
    return `<article class="ac-imovel" data-busca="${esc(semAc(im.nome + ' ' + im.unidade + ' ' + im.status))}">
      <div class="ac-imovel-topo"><span class="ac-st-imovel s-${tom}">${esc(im.status)}</span></div>
      <h3>${esc(im.nome)}</h3>
      <div class="linha2">${esc(partes || 'Unidade não informada')}</div>
      <div class="ac-preco num">${im.preco ? '<small>a partir de</small> ' + dinheiro(im.preco) : '<small>sob consulta</small>'}</div>
      <div class="ac-imovel-nums"><span><b class="num">${im.interessados}</b> interessados</span><span><b class="num">${im.leads}</b> leads</span><span><b class="num">${im.visitas}</b> visitas</span></div>
      <button class="btn btn-cheio ac-imovel-btn" data-ac="ver-imovel" data-id="${esc(im.id)}">Ver imóvel</button>
    </article>`;
  }

  function htmlImoveis(m) {
    if (!m.imoveis.length) {
      return `<div class="ac-vazio compacto"><div class="ac-vazio-ic" aria-hidden="true">🏢</div><b>Nenhum imóvel por aqui ainda</b><p>Os empreendimentos cadastrados pela administração aparecem aqui, com o interesse de cada um.</p></div>`;
    }
    return `<div class="ac-imoveis-grade" id="ac-imoveis-grade">${m.imoveis.map(htmlImovel).join('')}</div>
      <div class="ac-vazio compacto oculto" id="ac-imoveis-nada"><b>Nada encontrado</b><p>Tente outro nome de empreendimento ou unidade.</p></div>`;
  }

  function htmlVendas(m) {
    const v = m.vendas;
    const venda = m.destaque.find(d => d.tipo === 'venda');
    return `<div class="ac-titulo"><h2>Minhas vendas</h2><span class="ac-mes">${esc(new Date().toLocaleDateString('pt-BR', { month: 'long' }))}</span></div>
      ${venda ? `<div class="ac-venda-ok"><span class="ac-check" aria-hidden="true">✓</span><div><b>${esc(venda.titulo)}</b><span>${esc(venda.texto)}</span></div></div>` : ''}
      <div class="ac-vendido"><div class="num ac-vendido-v">${dinheiro(v.vendido)}</div><div class="ac-vendido-l">Valor vendido</div></div>
      <div class="ac-comissoes">
        <div><div class="num ac-com-v">${dinheiro(v.comissaoPrevista)}</div><div class="ac-com-l">Comissão prevista</div></div>
        <div><div class="num ac-com-v rec">${dinheiro(v.comissaoRecebida)}</div><div class="ac-com-l">Comissão recebida</div></div>
      </div>
      <div class="ac-pe-vendas ${v.vendasMes ? 'tem' : ''}">${v.vendasMes ? `<span class="ac-check peq" aria-hidden="true">✓</span>` : ''}<b class="num">${v.vendasMes}</b> ${v.vendasMes === 1 ? 'venda' : 'vendas'} este mês${v.vendasMes ? '' : ' — a primeira vem aí'}</div>`;
  }

  function htmlDesempenho(m) {
    const d = m.desempenho;
    const base = Math.max(1, d.recebidos);
    const linhas = [['Leads recebidos', d.recebidos], ['Leads atendidos', d.atendidos], ['Visitas', d.visitas], ['Propostas', d.propostas], ['Fechamentos', d.fechamentos]];
    const conv = String(d.conversao).replace('.', ',');
    let msg = '';
    if (d.variacao != null && d.variacao > 0) msg = `<div class="ac-msg-pos"><span aria-hidden="true">↗</span><span>Você está <b>${d.variacao}% acima</b> da sua média do mês passado.</span></div>`;
    else if (d.variacao != null && d.variacao < 0) msg = `<div class="ac-msg-neu"><span aria-hidden="true">→</span><span>Seu mês está um pouco abaixo do anterior. Responder rápido os leads novos costuma ajudar.</span></div>`;
    else if (d.recebidos) msg = `<div class="ac-msg-neu"><span aria-hidden="true">→</span><span>Ainda não há mês anterior para comparar. Siga atendendo e acompanhe sua evolução aqui.</span></div>`;
    return `<div class="ac-titulo"><h2>Meu desempenho</h2><span class="ac-mes">este mês</span></div>
      <ul class="ac-desemp">${linhas.map(([r, n]) => `<li><span class="ac-desemp-r">${r}</span><span class="ac-desemp-barra" aria-hidden="true"><i style="width:${Math.min(100, Math.round(n / base * 100))}%"></i></span><b class="num">${n}</b></li>`).join('')}</ul>
      <div class="ac-conversao"><div><div class="num ac-conv-v">${conv}%</div><div class="ac-conv-l">Taxa de conversão</div></div>${msg}</div>`;
  }

  function telaInicio(m) {
    const nome = m.nome || 'corretor';
    return `
    <div id="ac-raiz" class="ac">
      ${htmlFaixaDemo()}
      <div class="cabecalho ac-cab">
        <div>
          <h1>Olá, ${esc(nome)} <span class="ac-aceno" aria-hidden="true">👋</span></h1>
          <div class="ac-data">${esc(dataExtenso())}</div>
          <p class="sub ac-aqui">Aqui está o que precisa da sua atenção hoje.</p>
        </div>
        <button class="btn btn-primario ac-novo" data-ac="novo-lead">+ Novo lead</button>
      </div>

      <div id="ac-aviso">${htmlDestaque(m)}</div>

      <div class="ac-kpis" id="ac-kpis">${htmlKpis(m)}</div>

      <div class="ac-grade-topo">
        <section class="painel ac-principal" id="ac-atencao" aria-label="Precisa da sua atenção">${htmlAtencao(m)}</section>
        <section class="painel ac-agenda" id="ac-agenda" aria-label="Minha agenda">${htmlAgenda(m)}</section>
      </div>

      <section class="painel ac-bloco" id="ac-negocios" aria-label="Meus negócios">
        <div class="ac-titulo"><h2>Meus negócios</h2><span class="ac-mes">seu funil</span></div>
        <div id="ac-funil-corpo">${htmlFunil(m)}</div>
      </section>

      <section class="painel ac-bloco" id="ac-imoveis" aria-label="Meus imóveis">
        <div class="ac-imoveis-cab">
          <div class="ac-titulo"><h2>Meus imóveis</h2></div>
          <div class="ac-busca"><input type="search" id="ac-busca" placeholder="Buscar empreendimento ou imóvel..." value="${esc(store.busca)}" aria-label="Buscar empreendimento ou imóvel"></div>
        </div>
        ${htmlImoveis(m)}
      </section>

      <div class="ac-grade-pe">
        <section class="painel" id="ac-vendas" aria-label="Minhas vendas">${htmlVendas(m)}</section>
        <section class="painel" id="ac-desempenho" aria-label="Meu desempenho">${htmlDesempenho(m)}</section>
      </div>
    </div>`;
  }

  /* --- telas simples do menu: Mensagens e Propostas --- */

  function telaMensagens(m) {
    const lista = m.atencao.filter(i => i.tipo === 'novo' || i.tipo === 'resposta' || i.tipo === 'retorno');
    return `<div class="ac"><div class="cabecalho"><div><h1>Mensagens</h1><p class="sub">Conversas que esperam por você.</p></div></div>
      <section class="painel ac-principal">${lista.length
        ? `<ul class="ac-lista">${lista.map(htmlItem).join('')}</ul>`
        : `<div class="ac-vazio ok"><div class="ac-vazio-ic ok" aria-hidden="true">✓</div><b>Nenhuma conversa esperando</b><p>Você está em dia com as respostas.</p></div>`}</section></div>`;
  }
  function telaPropostas(m) {
    const f = m.funil.find(x => x.id === 'proposta');
    const lista = f ? f.leads : [];
    return `<div class="ac"><div class="cabecalho"><div><h1>Propostas</h1><p class="sub">Negócios em fase de proposta.</p></div></div>
      <section class="painel ac-principal">${lista.length ? `<ul class="ac-lista">${lista.map(l => `
        <li class="ac-item p-normal"><span class="ac-prio" aria-hidden="true"></span><div class="ac-av" aria-hidden="true">${esc(iniciais(l.nome))}</div>
        <div class="ac-item-txt"><b class="nome-lead" data-ac="abrir-lead" data-id="${esc(l.id)}">${esc(l.nome)}</b><div class="linha2">${l.valor ? esc(dinheiro(l.valor)) : 'Valor não informado'}</div></div>
        <button class="btn" data-ac="abrir-lead" data-id="${esc(l.id)}">Acompanhar</button></li>`).join('')}</ul>`
        : `<div class="ac-vazio compacto"><div class="ac-vazio-ic" aria-hidden="true">🎯</div><b>Nenhuma proposta em aberto</b><p>Quando um lead avançar para Proposta, ele aparece aqui.</p></div>`}</section></div>`;
  }

  /** Chamado por app.js. 'inicio' (e as âncoras imoveis/vendas/desempenho) mostram a Área do Corretor completa. */
  function tela(vista) {
    const m = modelo();
    if (vista === 'mensagens') return telaMensagens(m);
    if (vista === 'propostas') return telaPropostas(m);
    return telaInicio(m);
  }

  /* =====================================================================
     AÇÕES
     ===================================================================== */

  function aviso(txt) { torrada(txt); }
  const emDemo = () => lerDemo();

  /** Executa a ação de um item/aviso. Em demonstração só simula; com dados reais abre as telas do sistema. */
  function executarAcao(acao) {
    if (!acao) return;
    if (emDemo()) { aviso(`Demonstração: aqui abriria ${acao.tipo === 'whatsapp' ? 'o WhatsApp' : acao.tipo === 'visita' ? 'a visita' : 'a ficha do lead'}.`); return; }
    if (acao.tipo === 'whatsapp') modalZap(acao.leadId, acao.visitaId);
    else if (acao.tipo === 'visita' && acao.visitaId) modalVisita(acao.visitaId);
    else modalLead(acao.leadId);
  }

  function atualizarAtencaoEKpis() {
    const m = modelo();
    const a = el('#ac-atencao'); if (a) a.innerHTML = htmlAtencao(m);
    const k = el('#ac-kpis'); if (k) k.innerHTML = htmlKpis(m);
  }

  function clicarItem(id) {
    const m = modelo();
    const it = m.atencao.find(x => x.id === id); if (!it) return;
    executarAcao(it.acao);
    if (emDemo()) {
      store.feitos.add(it.id);
      const li = document.querySelector(`.ac-item[data-item="${CSS.escape(id)}"]`);
      if (li) { li.classList.add('feito'); const b = li.querySelector('.ac-item-btn'); if (b) { b.disabled = true; b.textContent = '✓ Feito'; } }
      setTimeout(atualizarAtencaoEKpis, 750);
    }
  }

  function abrirLead(id) {
    if (emDemo()) { aviso('Demonstração: aqui abriria a ficha do lead.'); return; }
    if (E.leads.some(l => l.id === id)) modalLead(id);
  }

  function verImovel(id) {
    const m = modelo(); const im = m.imoveis.find(x => x.id === id); if (!im) return;
    abrirModal(im.nome, `
      <div class="ac-modal-imovel">
        <div class="ac-preco num">${im.preco ? 'a partir de ' + dinheiro(im.preco) : 'Preço sob consulta'}</div>
        <p class="sub">${esc([im.unidade, im.areaM2 ? im.areaM2 + ' m²' : null].filter(Boolean).join(' • ') || 'Unidade não informada')} · ${esc(im.status)}</p>
        <div class="ac-imovel-nums grande"><span><b class="num">${im.interessados}</b> interessados</span><span><b class="num">${im.leads}</b> leads seus</span><span><b class="num">${im.visitas}</b> visitas</span></div>
        <p class="sub" style="margin-top:14px">${emDemo() ? 'Na versão com dados reais, aqui aparecem fotos, planta, ficha e os leads interessados neste imóvel.' : 'A ficha completa do empreendimento está no Portal do cliente.'}</p>
      </div>`, `<button class="btn" onclick="fecharModal()">Fechar</button>`);
  }

  /* --- mover negócio no funil --- */

  function moverNegocio(id, destinoId) {
    const idx = ETAPAS.findIndex(e => e.id === destinoId); if (idx < 0) return;
    const rotulo = ETAPAS[idx].rotulo;

    if (emDemo()) {
      const m = store.modeloDemo || (store.modeloDemo = fonteDemo(store.estadoDemo));
      let lead = null, origem = null;
      m.funil.forEach(f => { const i = f.leads.findIndex(x => x.id === id); if (i > -1) { origem = f.id; lead = f.leads.splice(i, 1)[0]; } });
      if (!lead || origem === destinoId) { if (lead) m.funil.find(f => f.id === origem).leads.unshift(lead); redesenharFunil(); return; }
      m.funil.find(f => f.id === destinoId).leads.unshift(lead);
      m.destaque = m.destaque.filter(d => d.tipo !== 'proposta' && d.tipo !== 'venda');
      if (destinoId === 'proposta') {
        m.resumo.propostas += 1;
        m.destaque.push({ tipo: 'proposta', titulo: 'Nova proposta registrada', texto: `${lead.nome}${lead.valor ? ' • ' + dinheiro(lead.valor) : ''}. Acompanhe o retorno do cliente.`, acao: { rotulo: 'Ver proposta', tipo: 'lead', leadId: lead.id } });
      }
      if (destinoId === 'fechados') {
        const c = Math.round((lead.valor || 0) * COMISSAO_PADRAO);
        m.vendas.vendasMes += 1; m.vendas.vendido += lead.valor || 0; m.vendas.comissaoPrevista += c;
        m.desempenho.fechamentos += 1;
        m.destaque.push({ tipo: 'venda', titulo: 'Venda fechada! Parabéns', texto: `${lead.nome}${lead.valor ? ' • ' + dinheiro(lead.valor) : ''} • comissão prevista de ${dinheiro(c)}.`, acao: null });
      }
      redesenharFunil({ id, etapa: destinoId });
      aviso(`${lead.nome} → ${rotulo}`);
      if (destinoId === 'proposta' || destinoId === 'fechados') redesenharTudoMenosBusca();
      return;
    }

    // dados reais: grava o novo estágio (e o histórico) como a ficha do lead faz
    const estagios = E.config?.estagios || ESTAGIOS_PADRAO;
    const novoStatus = estagios[idx];
    const antigo = E.leads.find(l => l.id === id); if (!antigo || antigo.status === novoStatus) return;
    if (!perm('editarQualquer') && antigo.responsavelId !== E.eu.id) { aviso('Você só pode mover os seus próprios leads.'); return; }
    const estavaEm = antigo.status;
    antigo.status = novoStatus;                         // atualiza na hora na tela
    redesenharFunil({ id, etapa: destinoId });
    const hist = (antigo.historico || []).slice();
    hist.push({ em: agora(), por: E.eu.nome, tipo: 'estagio', texto: `Estágio: ${estavaEm} → ${novoStatus}` });
    const novo = { ...antigo, status: novoStatus, historico: hist.slice(-60), atualizadoEm: agora() };
    delete novo.id;
    refLeads().doc(id).set(novo).then(() => {
      antigo.historico = novo.historico; antigo.atualizadoEm = novo.atualizadoEm;
      aviso(`${antigo.nome} → ${rotulo}`);
      redesenharTudoMenosBusca();
    }).catch(err => {
      antigo.status = estavaEm;                         // não gravou: volta como estava
      aviso(erroAmigavel(err)); redesenharFunil();
    });
  }

  function redesenharFunil(ultimo) {
    const c = el('#ac-funil-corpo'); if (!c) return;
    c.innerHTML = htmlFunil(modelo(), ultimo);
  }
  /** Atualiza avisos, cartões, vendas e desempenho sem refazer a busca de imóveis nem o funil. */
  function redesenharTudoMenosBusca() {
    const m = modelo();
    const av = el('#ac-aviso'); if (av) av.innerHTML = htmlDestaque(m);
    const k = el('#ac-kpis'); if (k) k.innerHTML = htmlKpis(m);
    const a = el('#ac-atencao'); if (a) a.innerHTML = htmlAtencao(m);
    const v = el('#ac-vendas'); if (v) v.innerHTML = htmlVendas(m);
    const d = el('#ac-desempenho'); if (d) d.innerHTML = htmlDesempenho(m);
  }

  /* =====================================================================
     EVENTOS (ligados uma única vez; o #conteudo nunca é substituído)
     ===================================================================== */

  function aplicarBusca() {
    const q = semAc(store.busca).trim();
    let achou = 0;
    document.querySelectorAll('.ac-imovel').forEach(c => {
      const ok = !q || c.dataset.busca.includes(q);
      c.classList.toggle('oculto', !ok); if (ok) achou++;
    });
    const nada = el('#ac-imoveis-nada'); if (nada) nada.classList.toggle('oculto', achou > 0 || !document.querySelector('.ac-imovel'));
  }

  let arrasto = null;

  function etapaSob(x, y) {
    const e = document.elementFromPoint(x, y);
    return e ? e.closest('.ac-etapa') : null;
  }
  function limparArrasto() {
    document.querySelectorAll('.ac-etapa.alvo').forEach(n => n.classList.remove('alvo'));
    document.body.classList.remove('ac-arrastando');
    if (arrasto) {
      if (arrasto.ghost) arrasto.ghost.remove();
      if (arrasto.chip) arrasto.chip.classList.remove('arrastando');
    }
    arrasto = null;
  }

  function ligarUmaVez() {
    if (store.ligado) return;
    store.ligado = true;
    const c = el('#conteudo');

    c.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ac]'); if (!b) return;
      const a = b.dataset.ac;
      if (a === 'novo-lead') { emDemo() ? aviso('Demonstração: aqui abriria o cadastro de lead.') : modalLead(); }
      else if (a === 'agendar') { emDemo() ? aviso('Demonstração: aqui abriria o agendamento de visita.') : modalVisita(); }
      else if (a === 'item') clicarItem(b.dataset.item);
      else if (a === 'abrir-lead') abrirLead(b.dataset.id);
      else if (a === 'ver-imovel') verImovel(b.dataset.id);
      else if (a === 'rolar') { const t = el(b.dataset.alvo); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (a === 'destaque') { const d = modelo().destaque[Number(b.dataset.i)]; if (d) executarAcao(d.acao); }
      else if (a === 'fechar-destaque') {
        const m = emDemo() ? store.modeloDemo : null;
        if (m) m.destaque.splice(Number(b.dataset.i), 1);
        const bloco = b.closest('.ac-destaque'); if (bloco) { bloco.classList.add('saindo'); setTimeout(() => bloco.remove(), 220); }
      }
      else if (a === 'demo-ligar') { gravarDemo(true); desenhar(); }
      else if (a === 'demo-desligar') { gravarDemo(false); desenhar(); }
    });

    c.addEventListener('input', ev => {
      if (ev.target.id === 'ac-busca') { store.busca = ev.target.value; aplicarBusca(); }
    });
    c.addEventListener('change', ev => {
      if (ev.target.id === 'ac-estado') { reiniciarDemo(ev.target.value); desenhar(); }
    });

    // teclado: setas movem o lead de etapa
    c.addEventListener('keydown', ev => {
      const chip = ev.target.closest('.ac-chip'); if (!chip) return;
      const etapa = chip.closest('.ac-etapa'); if (!etapa) return;
      const i = ETAPAS.findIndex(e => e.id === etapa.dataset.etapa);
      if (ev.key === 'ArrowRight' && i < ETAPAS.length - 1) { ev.preventDefault(); moverNegocio(chip.dataset.id, ETAPAS[i + 1].id); }
      else if (ev.key === 'ArrowLeft' && i > 0) { ev.preventDefault(); moverNegocio(chip.dataset.id, ETAPAS[i - 1].id); }
      else if (ev.key === 'Enter') { ev.preventDefault(); abrirLead(chip.dataset.id); }
    });

    // arrastar com mouse, caneta ou toque (no toque, só pela alça ⋮⋮ — o resto continua rolando a página)
    c.addEventListener('pointerdown', ev => {
      const chip = ev.target.closest('.ac-chip'); if (!chip) return;
      if (ev.pointerType === 'touch' && !ev.target.closest('.ac-grip')) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      arrasto = { chip, id: chip.dataset.id, x: ev.clientX, y: ev.clientY, ativo: false, ghost: null, alvo: null };
    });
    document.addEventListener('pointermove', ev => {
      if (!arrasto) return;
      if (!arrasto.ativo) {
        if (Math.hypot(ev.clientX - arrasto.x, ev.clientY - arrasto.y) < 6) return;
        arrasto.ativo = true;
        const r = arrasto.chip.getBoundingClientRect();
        const g = arrasto.chip.cloneNode(true);
        g.classList.add('ac-fantasma'); g.style.width = r.width + 'px';
        document.body.appendChild(g);
        arrasto.ghost = g; arrasto.dx = ev.clientX - r.left; arrasto.dy = ev.clientY - r.top;
        arrasto.chip.classList.add('arrastando');
        document.body.classList.add('ac-arrastando');
      }
      ev.preventDefault();
      arrasto.ghost.style.transform = `translate(${ev.clientX - arrasto.dx}px, ${ev.clientY - arrasto.dy}px) rotate(1.5deg)`;
      const alvo = etapaSob(ev.clientX, ev.clientY);
      if (alvo !== arrasto.alvo) {
        if (arrasto.alvo) arrasto.alvo.classList.remove('alvo');
        if (alvo) alvo.classList.add('alvo');
        arrasto.alvo = alvo;
      }
    }, { passive: false });
    const soltar = ev => {
      if (!arrasto) return;
      const { ativo, id, alvo, chip } = arrasto;
      const origem = chip.closest('.ac-etapa');
      limparArrasto();
      if (ev.type === 'pointercancel') return;
      if (!ativo) { abrirLead(id); return; }
      if (alvo && alvo !== origem) moverNegocio(id, alvo.dataset.etapa);
    };
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
  }

  /** Chamado por app.js depois de desenhar. */
  function ligar() {
    ligarUmaVez();
    aplicarBusca();
  }

  /** app.js pergunta isto antes de redesenhar por causa de novos dados: não interrompe um arrasto em andamento. */
  function ocupado() { return !!(arrasto && arrasto.ativo); }

  return { tela, ligar, ocupado, ETAPAS };
})();

window.AreaCorretor = AreaCorretor;
