/**
 * Camada de apresentação e coordenação da interface.
 *
 * Este arquivo liga eventos de UI aos casos de uso de `domain.js`, renderiza as
 * views e coordena recursos do navegador (rascunhos, tema, pesquisa e shutdown).
 * Regras de negócio e acesso direto ao IndexedDB devem permanecer fora daqui.
 */

import {
  APP_VERSION,
  DIAS_UTEIS_PADRAO,
  ESTADOS_OCORRENCIA,
  HORARIOS_PADRAO,
  PRIORIDADES,
  SITUACOES,
} from './constants.js';
import {
  adiarOcorrencia,
  caseAtivo,
  classificarResolvidosLegados,
  confirmarOcorrencia,
  criarCase,
  diagnosticoLocal,
  editarCase,
  definirAnotacaoFavorita,
  definirModeloFavorito,
  definirQueryFavorita,
  excluirCase,
  excluirItemLixeiraDefinitivamente,
  excluirModelo,
  excluirQuerySql,
  excluirAnotacao,
  excluirComentarioCase,
  listarAnotacoes,
  listarComentariosCase,
  obterAnotacao,
  salvarAnotacao,
  adicionarComentarioCase,
  listarCases,
  listarItensLixeira,
  listarModelos,
  listarOcorrenciasAbertas,
  listarQueriesSql,
  moverCaseParaLixeira,
  marcarCaseResolvido,
  obterCaseCompleto,
  obterModelo,
  obterQuerySql,
  purgarResolvidosAntigos,
  purgarLixeiraAntiga,
  reabrirCaseResolvido,
  restaurarItemLixeira,
  salvarModelo,
  salvarQuerySql,
  substituirAgendas,
  vencimentoEfetivo,
} from './domain.js';
import {
  abrirPastaBackups,
  baixarBackupManual,
  enviarAlertaTesteAgente,
  exportarBackup,
  lerBackupArquivo,
  obterResumoAnexosLocais,
  obterStatusAgenteLocal,
  obterStatusBackupsLocais,
  restaurarBackup,
  restaurarUltimoBackupAnexos,
  salvarBackupAnexosSeparado,
  sincronizarEstadoComServidor,
} from './backup.js';
import { iniciarMotorLembretes, solicitarPermissaoNotificacao } from './notifications.js';
import { adicionarAnexos, excluirAnexo, limparAnexosOrfaos, listarAnexos } from './attachments.js';
import { datetimeLocalNoFusoParaIso, fimDoDiaNoFuso, formatarDataHora, inicioDoDiaNoFuso } from './time.js';

// -----------------------------------------------------------------------------
// Referências de interface e metadados das views
// -----------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const refs = {
  sidebar: $('sidebar'),
  btnMenu: $('btnMenu'),
  pageTitle: $('pageTitle'),
  pageSubtitle: $('pageSubtitle'),
  btnPesquisaGlobal: $('btnPesquisaGlobal'),
  dlgPesquisaGlobal: $('dlgPesquisaGlobal'),
  pesquisaGlobal: $('pesquisaGlobal'),
  resultadosPesquisaGlobal: $('resultadosPesquisaGlobal'),
  btnFecharPesquisaGlobal: $('btnFecharPesquisaGlobal'),
  viewPrincipal: $('viewPrincipal'),
  viewBackup: $('viewBackup'),
  viewQueries: $('viewQueries'),
  viewRascunhos: $('viewRascunhos'),
  viewMacros: $('viewMacros'),
  viewAnotacoes: $('viewAnotacoes'),
  viewConfiguracoes: $('viewConfiguracoes'),
  viewLixeira: $('viewLixeira'),
  listaLixeira: $('listaLixeira'),
  contadorLixeira: $('contadorLixeira'),
  cardsResumo: $('cardsResumo'),
  painelFavoritos: $('painelFavoritos'),
  listaFavoritos: $('listaFavoritos'),
  contadorFavoritos: $('contadorFavoritos'),
  metricAtrasados: $('metricAtrasados'),
  metricHoje: $('metricHoje'),
  metricPrioritarios: $('metricPrioritarios'),
  metricAtivos: $('metricAtivos'),
  toolbarFiltros: $('toolbarFiltros'),
  listaTitulo: $('listaTitulo'),
  listaEyebrow: $('listaEyebrow'),
  contadorLista: $('contadorLista'),
  lista: $('listaCases'),
  filtroTexto: $('filtroTexto'),
  filtroSituacao: $('filtroSituacao'),
  filtroPrioridade: $('filtroPrioridade'),
  filtroEstado: $('filtroEstado'),
  filtroVencimento: $('filtroVencimento'),
  dlgCase: $('dlgCase'),
  formCase: $('formCase'),
  caseId: $('caseId'),
  protocolo: $('protocolo'),
  titulo: $('titulo'),
  situacao: $('situacao'),
  prioridade: $('prioridade'),
  resumo: $('resumo'),
  mensagem: $('mensagem'),
  observacoes: $('observacoes'),
  comentariosCaseSection: $('comentariosCaseSection'),
  comentarioTexto: $('comentarioTexto'),
  inputImagemComentario: $('inputImagemComentario'),
  comentarioArquivosPendentes: $('comentarioArquivosPendentes'),
  btnAdicionarComentario: $('btnAdicionarComentario'),
  listaComentariosCase: $('listaComentariosCase'),
  horariosSelecionados: $('horariosSelecionados'),
  btnAbrirHorarios: $('btnAbrirHorarios'),
  painelHorarios: $('painelHorarios'),
  inputNovoHorario: $('inputNovoHorario'),
  btnAdicionarHorario: $('btnAdicionarHorario'),
  modoLembreteDiasUteis: $('modoLembreteDiasUteis'),
  modoLembreteTodosDias: $('modoLembreteTodosDias'),
  ocorrenciasCase: $('ocorrenciasCase'),
  historicoCase: $('historicoCase'),
  modeloAplicar: $('modeloAplicar'),
  dlgModelos: $('dlgModelos'),
  listaModelos: $('listaModelos'),
  filtroRascunhos: $('filtroRascunhos'),
  contadorRascunhos: $('contadorRascunhos'),
  listaRascunhos: $('listaRascunhos'),
  badgeRascunhosMenu: $('badgeRascunhosMenu'),
  btnNovaMacro: $('btnNovaMacro'),
  contadorMacros: $('contadorMacros'),
  filtroMacros: $('filtroMacros'),
  tituloDialogMacro: $('tituloDialogMacro'),
  metaDialogMacro: $('metaDialogMacro'),
  btnCopiarMacroModal: $('btnCopiarMacroModal'),
  btnExcluirMacroModal: $('btnExcluirMacroModal'),
  btnFavoritarMacroModal: $('btnFavoritarMacroModal'),
  formModelo: $('formModelo'),
  modeloId: $('modeloId'),
  modeloNome: $('modeloNome'),
  modeloConteudo: $('modeloConteudo'),
  dlgRestore: $('dlgRestore'),
  resumoRestore: $('resumoRestore'),
  inputBackup: $('inputBackup'),
  alertaNotificacao: $('alertaNotificacao'),
  alertaNotificacaoTexto: $('alertaNotificacaoTexto'),
  btnAtivarNotificacoesBanner: $('btnAtivarNotificacoesBanner'),
  btnNotificacao: $('btnNotificacao'),
  textoStatusNotificacao: $('textoStatusNotificacao'),
  btnNotificacaoConfig: $('btnNotificacaoConfig'),
  configStatusNotificacao: $('configStatusNotificacao'),
  diagnosticoTexto: $('diagnosticoTexto'),
  versaoAplicacao: $('versaoAplicacao'),
  versaoSidebar: $('versaoSidebar'),
  btnEncerrarApp: $('btnEncerrarApp'),
  btnTemaClaro: $('btnTemaClaro'),
  btnTemaEscuro: $('btnTemaEscuro'),
  backupAutomaticoStatus: $('backupAutomaticoStatus'),
  backupMacrosStatus: $('backupMacrosStatus'),
  backupAnotacoesStatus: $('backupAnotacoesStatus'),
  backupAnexosStatus: $('backupAnexosStatus'),
  backupManualStatus: $('backupManualStatus'),
  btnBackupAnexos: $('btnBackupAnexos'),
  btnRestaurarAnexos: $('btnRestaurarAnexos'),
  statusAgenteSegundoPlano: $('statusAgenteSegundoPlano'),
  btnTestarAgente: $('btnTestarAgente'),
  statusArmazenamento: $('statusArmazenamento'),
  btnLimparAnexosOrfaos: $('btnLimparAnexosOrfaos'),
  btnAbrirPastaBackups: $('btnAbrirPastaBackups'),
  btnBaixarBackup: $('btnBaixarBackup'),
  formQuery: $('formQuery'),
  queryId: $('queryId'),
  queryNome: $('queryNome'),
  queryDescricao: $('queryDescricao'),
  queryTexto: $('queryTexto'),
  queryTags: $('queryTags'),
  queryFavorita: $('queryFavorita'),
  filtroQueries: $('filtroQueries'),
  contadorQueries: $('contadorQueries'),
  listaQueries: $('listaQueries'),
  btnNovaQuery: $('btnNovaQuery'),
  filtroAnotacoes: $('filtroAnotacoes'),
  contadorAnotacoes: $('contadorAnotacoes'),
  listaAnotacoes: $('listaAnotacoes'),
  btnNovaAnotacao: $('btnNovaAnotacao'),
  dlgAnotacao: $('dlgAnotacao'),
  formAnotacao: $('formAnotacao'),
  anotacaoId: $('anotacaoId'),
  anotacaoTitulo: $('anotacaoTitulo'),
  anotacaoConteudo: $('anotacaoConteudo'),
  inputAnexosAnotacao: $('inputAnexosAnotacao'),
  anexosAnotacao: $('anexosAnotacao'),
  tituloDialogAnotacao: $('tituloDialogAnotacao'),
  metaDialogAnotacao: $('metaDialogAnotacao'),
  btnFecharAnotacao: $('btnFecharAnotacao'),
  btnExcluirAnotacao: $('btnExcluirAnotacao'),
  btnCopiarAnotacao: $('btnCopiarAnotacao'),
  btnFavoritarAnotacaoModal: $('btnFavoritarAnotacaoModal'),
  statusRascunhoCase: $('statusRascunhoCase'),
  statusRascunhoAnotacao: $('statusRascunhoAnotacao'),
  btnAutoteste: $('btnAutoteste'),
  resultadoAutoteste: $('resultadoAutoteste'),
  metaThemeColor: document.querySelector('meta[name="theme-color"]'),
};

const VIEW_META = Object.freeze({
  painel: {
    title: 'Acompanhamento de Cases',
    subtitle: 'Visão geral dos atendimentos e lembretes do dia.',
    eyebrow: 'Acompanhamento',
    listTitle: 'Cases em acompanhamento',
  },
  cases: {
    title: 'Cases',
    subtitle: 'Consulte, filtre e acompanhe todos os protocolos cadastrados.',
    eyebrow: 'Base local',
    listTitle: 'Todos os cases',
  },
  lembretes: {
    title: 'Lembretes',
    subtitle: 'Priorize contatos pendentes, atrasados e próximos horários conforme a recorrência configurada em cada lembrete.',
    eyebrow: 'Agenda',
    listTitle: 'Lembretes em aberto',
  },
  gmud: {
    title: 'Aguardando GMUD',
    subtitle: 'Cases que aguardam a GMUD do dia, concentrados em uma fila própria.',
    eyebrow: 'Mudança',
    listTitle: 'Cases aguardando GMUD',
  },
  historico: {
    title: 'Histórico',
    subtitle: 'Cases concluídos separados entre resoluções gerais e resoluções realizadas pela fila de GMUD. Retenção de 15 dias.',
    eyebrow: 'Histórico',
    listTitle: 'Cases resolvidos',
  },
  rascunhos: {
    title: 'Rascunhos',
    subtitle: 'Revise e recupere rascunhos locais salvos automaticamente durante o preenchimento.',
  },
  macros: {
    title: 'Macros',
    subtitle: 'Crie, organize e copie mensagens reutilizáveis para o atendimento diário.',
  },
  anotacoes: {
    title: 'Anotações',
    subtitle: 'Salve procedimentos, referências e informações pesquisáveis para consulta rápida.',
  },
  queries: {
    title: 'Queries SQL',
    subtitle: 'Salve consultas SQL Server com contexto de uso para copiar quando necessário.',
  },
  lixeira: {
    title: 'Lixeira',
    subtitle: 'Recupere itens excluídos nos últimos 7 dias antes da remoção definitiva.',
  },
  backup: {
    title: 'Backup',
    subtitle: 'Proteja os dados locais e restaure informações quando necessário.',
  },
  configuracoes: {
    title: 'Configurações',
    subtitle: 'Verifique notificações, armazenamento e informações da aplicação.',
  },
});

const CLASSE_SITUACAO = Object.freeze({
  'Em análise': 'analise',
  'Em desenvolvimento': 'desenvolvimento',
  'Em validação': 'validacao',
  'Aguardando deploy': 'deploy',
  'Aguardando GMUD': 'gmud',
  'Aguardando Financeiro': 'financeiro',
  'Aguardando usuário': 'usuario',
  'Aguardando retorno interno': 'interno',
  Resolvido: 'resolvido',
  Cancelado: 'cancelado',
});

let snapshotRestore = null;
let toastTimer;
const DIAS_TODOS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
let horariosSelecionadosState = HORARIOS_PADRAO.map((horario) => ({ horario, diasSemana: [...DIAS_UTEIS_PADRAO] }));
let viewAtual = 'painel';
let comentarioArquivosPendentesState = [];
let anotacaoArquivosPendentesState = [];
let macroFavoritaState = false;
let anotacaoFavoritaState = false;
const objectUrlsAtivos = new Set();

const CHAVE_RASCUNHO_CASE = 'case-tracker-draft-case';
const CHAVE_RASCUNHO_ANOTACAO = 'case-tracker-draft-note';
const DURACAO_RASCUNHO_MS = 24 * 60 * 60 * 1000;
const CANAL_SYNC = 'case-tracker-entity-sync';
let suspenderRascunhos = false;
let timerRascunhoCase = null;
let timerRascunhoAnotacao = null;
let versaoCaseAberto = null;
let versaoAnotacaoAberta = null;
let caseAlteradoOutraAba = false;
let anotacaoAlteradaOutraAba = false;
const canalEntidades = 'BroadcastChannel' in window ? new BroadcastChannel(CANAL_SYNC) : null;
let pararMotorLembretes = null;
let intervaloLimpezaAutomatica = null;
let encerrandoAplicacao = false;

const CHAVE_TEMA = 'case-tracker-theme';
const TEMAS_VALIDOS = new Set(['light', 'dark']);

// -----------------------------------------------------------------------------
// Tema e utilitários de UI
// -----------------------------------------------------------------------------

function obterTemaAtual() {
  const temaDocumento = document.documentElement.dataset.theme;
  if (TEMAS_VALIDOS.has(temaDocumento)) return temaDocumento;
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (TEMAS_VALIDOS.has(salvo)) return salvo;
  } catch {
    // Mantém o tema claro quando o armazenamento local não estiver disponível.
  }
  return 'light';
}

function atualizarControlesTema(tema) {
  refs.btnTemaClaro?.setAttribute('aria-pressed', tema === 'light' ? 'true' : 'false');
  refs.btnTemaEscuro?.setAttribute('aria-pressed', tema === 'dark' ? 'true' : 'false');
  refs.btnTemaClaro?.classList.toggle('ativo', tema === 'light');
  refs.btnTemaEscuro?.classList.toggle('ativo', tema === 'dark');
}

function aplicarTema(tema, { persistir = true, avisar = false } = {}) {
  const novoTema = TEMAS_VALIDOS.has(tema) ? tema : 'light';
  document.documentElement.dataset.theme = novoTema;
  document.documentElement.style.colorScheme = novoTema === 'dark' ? 'dark' : 'light';
  if (refs.metaThemeColor) refs.metaThemeColor.content = novoTema === 'dark' ? '#0b1220' : '#172a3a';
  atualizarControlesTema(novoTema);

  if (persistir) {
    try { localStorage.setItem(CHAVE_TEMA, novoTema); }
    catch { /* A alteração visual continua válida durante esta sessão. */ }
  }

  if (avisar) toast(`Tema ${novoTema === 'dark' ? 'escuro' : 'claro'} ativado.`);
}

function el(tag, props = {}, ...filhos) {
  const node = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (chave === 'className') node.className = valor;
    else if (chave === 'dataset') Object.assign(node.dataset, valor);
    else if (chave.startsWith('on') && typeof valor === 'function') node.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (['disabled', 'checked', 'hidden', 'selected', 'required', 'readOnly'].includes(chave) && typeof valor === 'boolean') node[chave] = valor;
    else if (valor !== undefined && valor !== null) node.setAttribute(chave, String(valor));
  }
  for (const filho of filhos.flat()) {
    // Nunca renderizar marcadores de ausência como texto visível na interface.
    // Além de null/undefined reais, bloqueamos strings legadas que possam ter
    // vindo de dados antigos ou de uma versão anterior do aplicativo.
    if (filho == null) continue;
    if (typeof filho === 'string' && ['null', 'undefined'].includes(filho.trim().toLowerCase())) continue;
    node.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return node;
}

function toast(mensagem, erro = false) {
  const t = $('toast');
  t.textContent = mensagem;
  t.dataset.erro = erro ? '1' : '0';
  t.classList.add('ativo');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('ativo'), 3600);
}


function normalizarBusca(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function nomeArquivoSeguro(valor, fallback = 'arquivo') {
  const limpo = String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  return limpo || fallback;
}

function baixarTexto(conteudo, nome, tipo = 'text/plain;charset=utf-8') {
  const blob = new Blob([String(conteudo ?? '')], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// -----------------------------------------------------------------------------
// Rascunhos locais e sincronização entre abas
// -----------------------------------------------------------------------------

function chaveRascunho(prefixo, id) {
  return `${prefixo}:${id || 'novo'}`;
}

function lerRascunho(prefixo, id) {
  try {
    const bruto = localStorage.getItem(chaveRascunho(prefixo, id));
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function listarMetadadosRascunhos() {
  const itens = [];
  const agora = Date.now();
  const definicoes = [
    { prefixo: CHAVE_RASCUNHO_CASE, tipo: 'case' },
    { prefixo: CHAVE_RASCUNHO_ANOTACAO, tipo: 'anotacao' },
  ];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const chave = localStorage.key(i);
      if (!chave) continue;
      for (const definicao of definicoes) {
        const prefixoCompleto = `${definicao.prefixo}:`;
        if (!chave.startsWith(prefixoCompleto)) continue;
        try {
          const bruto = localStorage.getItem(chave);
          if (!bruto) continue;
          const dados = JSON.parse(bruto);
          const salvoEm = Date.parse(dados?.salvoEm ?? '');
          if (!Number.isFinite(salvoEm) || (agora - salvoEm) > DURACAO_RASCUNHO_MS) {
            localStorage.removeItem(chave);
            continue;
          }
          itens.push({
            chave,
            tipo: definicao.tipo,
            idRegistro: chave.slice(prefixoCompleto.length),
            salvoEm: new Date(salvoEm).toISOString(),
            dados,
          });
        } catch {
          localStorage.removeItem(chave);
        }
      }
    }
  } catch {
    return [];
  }
  return itens.sort((a, b) => Date.parse(b.salvoEm) - Date.parse(a.salvoEm));
}

function atualizarIndicadorRascunhos() {
  const quantidade = listarMetadadosRascunhos().length;
  if (refs.badgeRascunhosMenu) {
    refs.badgeRascunhosMenu.hidden = quantidade < 1;
    refs.badgeRascunhosMenu.textContent = quantidade > 99 ? '99+' : String(quantidade);
  }
  return quantidade;
}

function descricaoExpiracaoRascunho(salvoEm) {
  const restante = Math.max(0, DURACAO_RASCUNHO_MS - (Date.now() - Date.parse(salvoEm)));
  const horas = Math.max(1, Math.ceil(restante / 3600000));
  return horas >= 24 ? 'Expira em até 1 dia' : `Expira em cerca de ${horas}h`;
}

async function abrirRascunho(item) {
  if (item.tipo === 'case') {
    if (item.idRegistro && item.idRegistro !== 'novo') {
      await carregarCaseNoDialog(item.idRegistro);
      refs.dlgCase.showModal();
      aplicarRascunhoCase(item.dados);
      return;
    }
    limparFormularioCase();
    await atualizarSelectModelos();
    refs.dlgCase.showModal();
    aplicarRascunhoCase(item.dados);
    window.setTimeout(() => refs.protocolo.focus(), 0);
    return;
  }
  if (item.tipo === 'anotacao') {
    if (item.idRegistro && item.idRegistro !== 'novo') {
      await abrirAnotacaoExistente(item.idRegistro);
      aplicarRascunhoAnotacao(item.dados);
      return;
    }
    limparFormularioAnotacao();
    refs.dlgAnotacao.showModal();
    aplicarRascunhoAnotacao(item.dados);
    window.setTimeout(() => refs.anotacaoTitulo.focus(), 0);
  }
}

async function renderRascunhos() {
  if (!refs.listaRascunhos) return;
  const termo = normalizarBusca(refs.filtroRascunhos?.value);
  const itens = listarMetadadosRascunhos().filter((item) => {
    if (!termo) return true;
    const corpus = item.tipo === 'case'
      ? [item.dados?.protocolo, item.dados?.titulo, item.dados?.mensagem, item.dados?.observacoes, item.dados?.resumo].join(' ')
      : [item.dados?.titulo, item.dados?.conteudo].join(' ');
    return normalizarBusca(corpus).includes(termo);
  });
  if (refs.contadorRascunhos) refs.contadorRascunhos.textContent = `${itens.length} ${itens.length === 1 ? 'rascunho' : 'rascunhos'}`;
  refs.listaRascunhos.replaceChildren();
  if (!itens.length) {
    refs.listaRascunhos.append(
      el('div', { className: 'vazio' },
        el('strong', {}, termo ? 'Nenhum rascunho encontrado.' : 'Nenhum rascunho disponível.'),
        el('p', {}, termo ? 'Tente pesquisar por outro termo.' : 'Ao fechar um case ou anotação sem salvar, o rascunho ficará disponível aqui por até 1 dia.'),
      ),
    );
    atualizarIndicadorRascunhos();
    return;
  }
  for (const item of itens) {
    const titulo = item.tipo === 'case'
      ? (item.dados?.titulo || item.dados?.protocolo || 'Novo case em rascunho')
      : (item.dados?.titulo || 'Nova anotação em rascunho');
    const linhaSecundaria = item.tipo === 'case'
      ? (item.dados?.protocolo ? `Protocolo ${item.dados.protocolo}` : 'Sem protocolo definido')
      : 'Rascunho de anotação';
    const previewBase = item.tipo === 'case'
      ? (item.dados?.mensagem || item.dados?.observacoes || item.dados?.resumo || '')
      : (item.dados?.conteudo || '');
    const preview = String(previewBase).trim();
    refs.listaRascunhos.append(
      el('article', { className: 'note-card' },
        el('div', { className: 'note-card-top' },
          el('div', {},
            el('h3', { className: 'note-card-title' }, titulo),
            el('p', { className: 'note-card-date' }, linhaSecundaria),
          ),
          el('span', { className: 'draft-kind-tag' }, item.tipo === 'case' ? 'Case' : 'Anotação'),
        ),
        el('div', { className: 'draft-card-meta' },
          el('span', { className: 'note-card-date' }, `Salvo em ${formatarDataHora(item.salvoEm)}`),
          el('span', { className: 'draft-expire-tag' }, descricaoExpiracaoRascunho(item.salvoEm)),
        ),
        el('div', { className: 'note-card-preview' }, preview ? (preview.length > 260 ? `${preview.slice(0, 260)}…` : preview) : 'Sem conteúdo adicional no rascunho.'),
        el('div', { className: 'note-card-footer draft-card-footer' },
          el('span', { className: 'note-files-count' }, item.idRegistro === 'novo' ? 'Novo registro não salvo' : 'Edição pendente'),
          el('div', { className: 'draft-card-actions' },
            el('button', { type: 'button', className: 'secondary-action compact-action', onclick: () => abrirRascunho(item).catch((e) => toast(e.message, true)) }, item.tipo === 'case' ? 'Abrir case →' : 'Abrir anotação →'),
            el('button', { type: 'button', className: 'secondary-action compact-action', onclick: async () => {
              removerRascunho(item.tipo === 'case' ? CHAVE_RASCUNHO_CASE : CHAVE_RASCUNHO_ANOTACAO, item.idRegistro);
              await renderRascunhos();
              toast('Rascunho removido.');
            } }, 'Excluir rascunho'),
          ),
        ),
      ),
    );
  }
  atualizarIndicadorRascunhos();
}

function removerRascunho(prefixo, id) {
  try { localStorage.removeItem(chaveRascunho(prefixo, id)); } catch { /* sem ação */ }
  atualizarIndicadorRascunhos();
}

function mostrarStatusRascunho(ref, texto, alerta = false) {
  if (!ref) return;
  ref.hidden = !texto;
  ref.textContent = texto || '';
  ref.classList.toggle('draft-warning', alerta);
}

function rascunhoCaseTemConteudo(rascunho) {
  return [rascunho?.protocolo, rascunho?.titulo, rascunho?.resumo, rascunho?.mensagem, rascunho?.observacoes]
    .some((campo) => String(campo ?? '').trim());
}

function rascunhoAnotacaoTemConteudo(rascunho) {
  return [rascunho?.titulo, rascunho?.conteudo].some((campo) => String(campo ?? '').trim());
}

function salvarRascunhoCaseAgora() {
  if (suspenderRascunhos || !refs.dlgCase?.open) return;
  const id = refs.caseId.value || 'novo';
  const rascunho = {
    salvoEm: new Date().toISOString(),
    id: refs.caseId.value || null,
    protocolo: refs.protocolo.value,
    titulo: refs.titulo.value,
    situacao: refs.situacao.value,
    prioridade: refs.prioridade.value,
    resumo: refs.resumo.value,
    mensagem: refs.mensagem.value,
    observacoes: refs.observacoes.value,
    agendasLembretes: horariosSelecionadosState.map((item) => ({ horario: item.horario, diasSemana: [...item.diasSemana] })),
    horarios: horariosSelecionadosState.map((item) => item.horario),
  };
  try {
    if (!rascunhoCaseTemConteudo(rascunho)) {
      removerRascunho(CHAVE_RASCUNHO_CASE, id);
      mostrarStatusRascunho(refs.statusRascunhoCase, '');
      return;
    }
    localStorage.setItem(chaveRascunho(CHAVE_RASCUNHO_CASE, id), JSON.stringify(rascunho));
    atualizarIndicadorRascunhos();
    mostrarStatusRascunho(refs.statusRascunhoCase, `Rascunho salvo automaticamente às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`);
  } catch {
    mostrarStatusRascunho(refs.statusRascunhoCase, 'Não foi possível salvar o rascunho neste navegador.', true);
  }
}

function agendarRascunhoCase() {
  if (suspenderRascunhos) return;
  clearTimeout(timerRascunhoCase);
  timerRascunhoCase = window.setTimeout(salvarRascunhoCaseAgora, 550);
}

function aplicarRascunhoCase(rascunho) {
  suspenderRascunhos = true;
  refs.protocolo.value = rascunho.protocolo ?? refs.protocolo.value;
  refs.titulo.value = rascunho.titulo ?? refs.titulo.value;
  refs.situacao.value = rascunho.situacao ?? refs.situacao.value;
  refs.prioridade.value = rascunho.prioridade ?? refs.prioridade.value;
  refs.resumo.value = rascunho.resumo ?? '';
  refs.mensagem.value = rascunho.mensagem ?? '';
  refs.observacoes.value = rascunho.observacoes ?? '';
  if (Array.isArray(rascunho.agendasLembretes)) definirHorariosSelecionados(rascunho.agendasLembretes);
  else if (Array.isArray(rascunho.horarios)) definirHorariosSelecionados(rascunho.horarios);
  suspenderRascunhos = false;
  mostrarStatusRascunho(refs.statusRascunhoCase, 'Rascunho recuperado. Revise os dados antes de salvar.');
}

function recuperarRascunhoCaseSeNecessario(id, atualizadoEmBanco = null) {
  const rascunho = lerRascunho(CHAVE_RASCUNHO_CASE, id || 'novo');
  if (id === 'novo') return;
  if (!rascunho?.salvoEm) return;
  const maisNovo = !atualizadoEmBanco || Date.parse(rascunho.salvoEm) > Date.parse(atualizadoEmBanco);
  if (!maisNovo) {
    removerRascunho(CHAVE_RASCUNHO_CASE, id || 'novo');
    return;
  }
  if (confirm('Existe um rascunho mais recente deste case. Deseja recuperá-lo?')) aplicarRascunhoCase(rascunho);
  else removerRascunho(CHAVE_RASCUNHO_CASE, id || 'novo');
}

function salvarRascunhoAnotacaoAgora() {
  if (suspenderRascunhos || !refs.dlgAnotacao?.open) return;
  const id = refs.anotacaoId.value || 'novo';
  const rascunho = {
    salvoEm: new Date().toISOString(),
    id: refs.anotacaoId.value || null,
    titulo: refs.anotacaoTitulo.value,
    conteudo: refs.anotacaoConteudo.value,
    favorita: anotacaoFavoritaState,
  };
  try {
    if (!rascunhoAnotacaoTemConteudo(rascunho)) {
      removerRascunho(CHAVE_RASCUNHO_ANOTACAO, id);
      mostrarStatusRascunho(refs.statusRascunhoAnotacao, '');
      return;
    }
    localStorage.setItem(chaveRascunho(CHAVE_RASCUNHO_ANOTACAO, id), JSON.stringify(rascunho));
    atualizarIndicadorRascunhos();
    mostrarStatusRascunho(refs.statusRascunhoAnotacao, `Rascunho salvo automaticamente às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`);
  } catch {
    mostrarStatusRascunho(refs.statusRascunhoAnotacao, 'Não foi possível salvar o rascunho desta anotação.', true);
  }
}

function agendarRascunhoAnotacao() {
  if (suspenderRascunhos) return;
  clearTimeout(timerRascunhoAnotacao);
  timerRascunhoAnotacao = window.setTimeout(salvarRascunhoAnotacaoAgora, 550);
}

function aplicarRascunhoAnotacao(rascunho) {
  suspenderRascunhos = true;
  refs.anotacaoTitulo.value = rascunho.titulo ?? refs.anotacaoTitulo.value;
  refs.anotacaoConteudo.value = rascunho.conteudo ?? '';
  anotacaoFavoritaState = rascunho.favorita === true;
  atualizarBotaoFavorito(refs.btnFavoritarAnotacaoModal, anotacaoFavoritaState, 'anotação');
  suspenderRascunhos = false;
  mostrarStatusRascunho(refs.statusRascunhoAnotacao, 'Rascunho recuperado. Revise antes de salvar.');
}

function recuperarRascunhoAnotacaoSeNecessario(id, atualizadoEmBanco = null) {
  const rascunho = lerRascunho(CHAVE_RASCUNHO_ANOTACAO, id || 'novo');
  if (id === 'novo') return;
  if (!rascunho?.salvoEm) return;
  const maisNovo = !atualizadoEmBanco || Date.parse(rascunho.salvoEm) > Date.parse(atualizadoEmBanco);
  if (!maisNovo) {
    removerRascunho(CHAVE_RASCUNHO_ANOTACAO, id || 'novo');
    return;
  }
  if (confirm('Existe um rascunho mais recente desta anotação. Deseja recuperá-lo?')) aplicarRascunhoAnotacao(rascunho);
  else removerRascunho(CHAVE_RASCUNHO_ANOTACAO, id || 'novo');
}

function notificarAlteracaoEntidade(tipo, id, atualizadoEm = new Date().toISOString()) {
  try { canalEntidades?.postMessage({ tipo, id, atualizadoEm }); } catch { /* sem ação */ }
}

async function verificarConflitoCaseAntesSalvar(id) {
  if (!id) return true;
  const atual = await obterCaseCompleto(id);
  const mudou = caseAlteradoOutraAba || (versaoCaseAberto && atual?.case?.atualizadoEm && atual.case.atualizadoEm !== versaoCaseAberto);
  if (!mudou) return true;
  return confirm('Este case foi alterado em outra guia depois que você o abriu. Deseja sobrescrever as alterações mais recentes com o conteúdo desta guia?');
}

async function verificarConflitoAnotacaoAntesSalvar(id) {
  if (!id) return true;
  const atual = await obterAnotacao(id);
  const mudou = anotacaoAlteradaOutraAba || (versaoAnotacaoAberta && atual?.atualizadoEm && atual.atualizadoEm !== versaoAnotacaoAberta);
  if (!mudou) return true;
  return confirm('Esta anotação foi alterada em outra guia depois que você a abriu. Deseja sobrescrever a versão mais recente?');
}

if (canalEntidades) {
  canalEntidades.addEventListener('message', (event) => {
    const dado = event.data ?? {};
    if (dado.tipo === 'case' && refs.dlgCase?.open && refs.caseId.value && refs.caseId.value === dado.id) {
      caseAlteradoOutraAba = true;
      mostrarStatusRascunho(refs.statusRascunhoCase, 'Atenção: este case foi alterado em outra guia. Ao salvar, o sistema pedirá confirmação.', true);
    }
    if (dado.tipo === 'anotacao' && refs.dlgAnotacao?.open && refs.anotacaoId.value && refs.anotacaoId.value === dado.id) {
      anotacaoAlteradaOutraAba = true;
      mostrarStatusRascunho(refs.statusRascunhoAnotacao, 'Atenção: esta anotação foi alterada em outra guia. Ao salvar, o sistema pedirá confirmação.', true);
    }
    if (!refs.dlgCase?.open && !refs.dlgAnotacao?.open) atualizarTudo().catch(() => {});
  });
}

async function sincronizarEstadoSeguro() {
  try {
    await sincronizarEstadoComServidor();
    await atualizarStatusBackups();
  } catch (erro) {
    console.warn('Sincronização local indisponível:', erro);
  }
}

function diasRestantesResolvido(caseItem) {
  const referencia = Date.parse(caseItem.finalizadoEm ?? caseItem.atualizadoEm ?? caseItem.criadoEm ?? '');
  if (!Number.isFinite(referencia)) return 15;
  const decorrido = Math.floor((Date.now() - referencia) / 86_400_000);
  return Math.max(0, 15 - decorrido);
}

function preencherSelect(select, valores, valorInicial = '') {
  for (const valor of valores) {
    const option = document.createElement('option');
    option.value = valor;
    option.textContent = valor;
    select.append(option);
  }
  if (valorInicial) select.value = valorInicial;
}

function normalizarHorario(valor) {
  const texto = String(valor ?? '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(texto)) throw new Error(`Horário inválido: ${texto}. Use HH:mm.`);
  const [hh, mm] = texto.split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    throw new Error(`Horário inválido: ${texto}.`);
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------
// Configuração de horários e recorrência por case
// -----------------------------------------------------------------------------

function normalizarDiasAgenda(diasSemana) {
  const validos = [...new Set((Array.isArray(diasSemana) ? diasSemana : [])
    .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6))].sort((a, b) => a - b);
  return validos.length ? validos : [...DIAS_UTEIS_PADRAO];
}

function diasIguais(a, b) {
  const aa = normalizarDiasAgenda(a);
  const bb = normalizarDiasAgenda(b);
  return aa.length === bb.length && aa.every((dia, i) => dia === bb[i]);
}

function rotuloDiasAgenda(diasSemana) {
  const dias = normalizarDiasAgenda(diasSemana);
  if (diasIguais(dias, DIAS_TODOS)) return 'Todos os dias';
  if (diasIguais(dias, DIAS_UTEIS_PADRAO)) return 'Seg a sex';
  const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return dias.map((dia) => nomes[dia]).join(', ');
}

function diasSelecionadosNoPainel() {
  return refs.modoLembreteTodosDias?.checked ? [...DIAS_TODOS] : [...DIAS_UTEIS_PADRAO];
}

function ordenarHorarios(horarios) {
  return [...horarios].sort((a, b) => a.horario.localeCompare(b.horario));
}

function fecharPainelHorarios() {
  refs.painelHorarios.hidden = true;
  refs.btnAbrirHorarios.setAttribute('aria-expanded', 'false');
}

function abrirPainelHorarios() {
  refs.painelHorarios.hidden = false;
  refs.btnAbrirHorarios.setAttribute('aria-expanded', 'true');
  window.setTimeout(() => refs.inputNovoHorario.focus(), 0);
}

function renderHorariosSelecionados() {
  refs.horariosSelecionados.replaceChildren();
  if (!horariosSelecionadosState.length) {
    refs.horariosSelecionados.append(
      el('span', { className: 'horario-vazio' }, 'Nenhum horário selecionado. Este case ficará sem lembretes automáticos.'),
    );
    return;
  }

  for (const agenda of horariosSelecionadosState) {
    const horario = agenda.horario;
    refs.horariosSelecionados.append(
      el('span', { className: 'horario-chip horario-chip-regra' },
        el('span', { className: 'horario-chip-hora' }, horario),
        el('span', { className: 'horario-chip-dias' }, rotuloDiasAgenda(agenda.diasSemana)),
        el('button', {
          type: 'button',
          title: `Remover horário ${horario}`,
          'aria-label': `Remover horário ${horario}`,
          onclick: () => {
            horariosSelecionadosState = horariosSelecionadosState.filter((item) => item.horario !== horario);
            renderHorariosSelecionados();
            agendarRascunhoCase();
          },
        }, '×'),
      ),
    );
  }
}

function definirHorariosSelecionados(horarios) {
  const porHorario = new Map();
  for (const item of (horarios ?? [])) {
    if (!item) continue;
    const horario = normalizarHorario(typeof item === 'string' ? item : item.horario);
    const diasSemana = typeof item === 'string' ? [...DIAS_UTEIS_PADRAO] : normalizarDiasAgenda(item.diasSemana);
    porHorario.set(horario, { horario, diasSemana });
  }
  horariosSelecionadosState = ordenarHorarios([...porHorario.values()]);
  renderHorariosSelecionados();
  if (!suspenderRascunhos) agendarRascunhoCase();
}

function adicionarHorarioSelecionado(valor) {
  const horario = normalizarHorario(valor);
  const diasSemana = diasSelecionadosNoPainel();
  const existente = horariosSelecionadosState.find((item) => item.horario === horario);
  if (existente) {
    if (diasIguais(existente.diasSemana, diasSemana)) {
      toast(`O horário ${horario} já foi adicionado com essa regra.`);
      return;
    }
    existente.diasSemana = diasSemana;
    horariosSelecionadosState = ordenarHorarios(horariosSelecionadosState);
    renderHorariosSelecionados();
    refs.inputNovoHorario.value = '';
    agendarRascunhoCase();
    toast(`Regra do horário ${horario} atualizada para ${rotuloDiasAgenda(diasSemana)}.`);
    return;
  }
  horariosSelecionadosState = ordenarHorarios([...horariosSelecionadosState, { horario, diasSemana }]);
  renderHorariosSelecionados();
  refs.inputNovoHorario.value = '';
  agendarRascunhoCase();
}

function horariosDoFormulario() {
  return horariosSelecionadosState.map((item) => ({ horario: item.horario, diasSemana: [...item.diasSemana] }));
}

async function agendasDoFormulario(caseId) {
  const horarios = horariosDoFormulario();
  if (!caseId) {
    return horarios.map((item) => ({ ...item, ativa: true }));
  }
  const atual = await obterCaseCompleto(caseId);
  const existentesAtivos = atual?.agendas.filter((a) => a.ativa) ?? [];
  return horarios.map((item) => {
    const existente = existentesAtivos.find((a) => a.horario === item.horario);
    return { id: existente?.id, horario: item.horario, diasSemana: [...item.diasSemana], ativa: true };
  });
}

function dadosCaseDoFormulario() {
  return {
    protocolo: refs.protocolo.value,
    titulo: refs.titulo.value,
    situacao: refs.situacao.value,
    prioridade: refs.prioridade.value,
    resumo: refs.resumo.value,
    mensagem: refs.mensagem.value,
    observacoes: refs.observacoes.value,
  };
}

function limparFormularioCase() {
  suspenderRascunhos = true;
  refs.formCase.reset();
  refs.caseId.value = '';
  refs.situacao.value = 'Em análise';
  refs.prioridade.value = 'Normal';
  definirHorariosSelecionados(HORARIOS_PADRAO);
  if (refs.modoLembreteDiasUteis) refs.modoLembreteDiasUteis.checked = true;
  refs.ocorrenciasCase.replaceChildren();
  refs.historicoCase.replaceChildren();
  refs.ocorrenciasCase.hidden = true;
  refs.historicoCase.hidden = true;
  refs.comentariosCaseSection.hidden = true;
  refs.listaComentariosCase.replaceChildren();
  refs.comentarioTexto.value = '';
  refs.inputImagemComentario.value = '';
  comentarioArquivosPendentesState = [];
  renderPendentesComentario();
  limparUrlsTemporarias();
  $('btnExcluirCase').hidden = true;
  $('tituloDialogCase').textContent = 'Novo case';
  fecharPainelHorarios();
  versaoCaseAberto = null;
  caseAlteradoOutraAba = false;
  mostrarStatusRascunho(refs.statusRascunhoCase, '');
  suspenderRascunhos = false;
}

// -----------------------------------------------------------------------------
// Cases, ocorrências e cards principais
// -----------------------------------------------------------------------------

async function abrirNovoCase() {
  limparFormularioCase();
  await atualizarSelectModelos();
  refs.dlgCase.showModal();
  window.setTimeout(() => refs.protocolo.focus(), 0);
}

function classePrioridade(prioridade) {
  return `badge-priority-${String(prioridade).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}`;
}

function classeSituacao(situacao) {
  return `badge-status-${CLASSE_SITUACAO[situacao] ?? 'cancelado'}`;
}

function badgePrioridade(prioridade) {
  const prefixo = prioridade === 'Crítica' ? '▲ ' : prioridade === 'Alta' ? '▲ ' : '';
  return el('span', { className: `badge ${classePrioridade(prioridade)}` }, `${prefixo}${prioridade}`);
}

function badgeSituacao(situacao) {
  return el('span', { className: `badge ${classeSituacao(situacao)}` }, situacao);
}

async function executarConfirmacaoOcorrencia(ocorrenciaId) {
  await confirmarOcorrencia(ocorrenciaId);
  toast('Atualização confirmada.');
  await atualizarTudo();
  if (refs.caseId.value) await carregarCaseNoDialog(refs.caseId.value);
  await sincronizarEstadoSeguro();
}

async function executarAdiamentoOcorrencia(ocorrenciaId, minutos) {
  await adiarOcorrencia(ocorrenciaId, { minutos });
  toast(`Ocorrência adiada por ${minutos === 60 ? '1 hora' : `${minutos} minutos`}.`);
  await atualizarTudo();
  if (refs.caseId.value) await carregarCaseNoDialog(refs.caseId.value);
  await sincronizarEstadoSeguro();
}

function criarLinhaOcorrencia(ocorrencia) {
  const efetivo = vencimentoEfetivo(ocorrencia);
  const status = el('span', { className: `tag ${ocorrencia.estado === ESTADOS_OCORRENCIA.ATRASADA ? 'atrasada' : ''}` }, ocorrencia.estado);
  const texto = el('div', {}, status, ' ', formatarDataHora(efetivo));
  const acoes = el('div', { className: 'ocorrencia-acoes' });

  if (![ESTADOS_OCORRENCIA.CONFIRMADA, ESTADOS_OCORRENCIA.CANCELADA].includes(ocorrencia.estado)) {
    acoes.append(
      el('button', {
        type: 'button',
        onclick: () => executarConfirmacaoOcorrencia(ocorrencia.id).catch((e) => toast(e.message, true)),
      }, 'Confirmar'),
      el('button', {
        type: 'button',
        onclick: () => executarAdiamentoOcorrencia(ocorrencia.id, 15).catch((e) => toast(e.message, true)),
      }, '+15 min'),
      el('button', {
        type: 'button',
        onclick: () => executarAdiamentoOcorrencia(ocorrencia.id, 30).catch((e) => toast(e.message, true)),
      }, '+30 min'),
      el('button', {
        type: 'button',
        onclick: () => executarAdiamentoOcorrencia(ocorrencia.id, 60).catch((e) => toast(e.message, true)),
      }, '+1h'),
      el('button', {
        type: 'button',
        onclick: async () => {
          const valor = prompt('Informe o novo horário no formato AAAA-MM-DDTHH:mm (fuso de São Paulo):');
          if (!valor) return;
          try {
            await adiarOcorrencia(ocorrencia.id, { para: datetimeLocalNoFusoParaIso(valor) });
            toast('Ocorrência adiada.');
            await atualizarTudo();
            if (refs.caseId.value) await carregarCaseNoDialog(refs.caseId.value);
            await sincronizarEstadoSeguro();
          } catch (e) { toast(e.message, true); }
        },
      }, 'Personalizar'),
    );
  }
  return el('div', { className: 'ocorrencia' }, texto, acoes);
}

async function carregarCaseNoDialog(caseId) {
  const completo = await obterCaseCompleto(caseId);
  if (!completo) throw new Error('Case não encontrado.');
  const c = completo.case;
  suspenderRascunhos = true;
  refs.caseId.value = c.id;
  refs.protocolo.value = c.protocolo;
  refs.titulo.value = c.titulo;
  refs.situacao.value = c.situacao;
  refs.prioridade.value = c.prioridade;
  refs.resumo.value = c.resumo ?? '';
  refs.mensagem.value = c.mensagem ?? '';
  refs.observacoes.value = c.observacoes ?? '';
  definirHorariosSelecionados(completo.agendas.filter((a) => a.ativa).map((a) => ({ horario: a.horario, diasSemana: a.diasSemana })));
  versaoCaseAberto = c.atualizadoEm ?? null;
  caseAlteradoOutraAba = false;
  mostrarStatusRascunho(refs.statusRascunhoCase, '');
  suspenderRascunhos = false;
  recuperarRascunhoCaseSeNecessario(c.id, c.atualizadoEm);
  $('tituloDialogCase').textContent = `Case ${c.protocolo}`;
  $('btnExcluirCase').hidden = false;
  fecharPainelHorarios();

  refs.ocorrenciasCase.hidden = false;
  refs.historicoCase.hidden = false;
  refs.comentariosCaseSection.hidden = false;
  refs.comentarioTexto.value = '';
  comentarioArquivosPendentesState = [];
  renderPendentesComentario();
  limparUrlsTemporarias();
  await renderComentariosCase(caseId);

  const tituloOc = el('h3', {}, 'Ocorrências recentes');
  const listaOc = el('div');
  if (!completo.ocorrencias.length) listaOc.append(el('p', {}, 'Nenhuma ocorrência registrada.'));
  for (const o of completo.ocorrencias.slice(0, 12)) listaOc.append(criarLinhaOcorrencia(o));
  refs.ocorrenciasCase.replaceChildren(tituloOc, listaOc);

  const histTitulo = el('h3', {}, 'Histórico');
  const histLista = el('div');
  if (completo.historicos.length === 0) histLista.append(el('p', {}, 'Sem histórico.'));
  for (const h of completo.historicos.slice(0, 30)) {
    histLista.append(el('div', {}, `${formatarDataHora(h.ocorridoEm)} — ${h.tipoEvento}`));
  }
  refs.historicoCase.replaceChildren(histTitulo, histLista);
}

async function abrirCase(caseId) {
  await atualizarSelectModelos();
  await carregarCaseNoDialog(caseId);
  refs.dlgCase.showModal();
}

function casePassaFiltros(c, ocorrPorCase) {
  if (viewAtual === 'gmud' && c.situacao !== 'Aguardando GMUD') return false;
  if (viewAtual === 'cases' && c.situacao === 'Resolvido') return false;

  const termo = refs.filtroTexto.value.trim().toLowerCase();
  if (termo && !`${c.protocolo} ${c.titulo}`.toLowerCase().includes(termo)) return false;
  if (refs.filtroSituacao.value && c.situacao !== refs.filtroSituacao.value) return false;
  if (refs.filtroPrioridade.value === '__prioritarios__' && !['Alta', 'Crítica'].includes(c.prioridade)) return false;
  if (refs.filtroPrioridade.value && refs.filtroPrioridade.value !== '__prioritarios__' && c.prioridade !== refs.filtroPrioridade.value) return false;
  if (refs.filtroEstado.value === 'ativos' && !caseAtivo(c)) return false;
  if (refs.filtroEstado.value === 'finalizados' && caseAtivo(c)) return false;
  const abertas = ocorrPorCase.get(c.id) ?? [];
  if (refs.filtroVencimento.value === 'atrasados' && !abertas.some((o) => o.estado === ESTADOS_OCORRENCIA.ATRASADA)) return false;
  if (refs.filtroVencimento.value === 'hoje') {
    const ini = inicioDoDiaNoFuso(new Date());
    const fim = fimDoDiaNoFuso(new Date());
    if (!abertas.some((o) => {
      const d = new Date(vencimentoEfetivo(o));
      return d >= ini && d <= fim;
    })) return false;
  }
  if (refs.filtroVencimento.value === 'sem' && abertas.length > 0) return false;
  return true;
}

async function resolverCasePelaGmud(caseItem, checkbox) {
  if (!checkbox.checked) return;
  const confirmou = confirm(`Marcar o case ${caseItem.protocolo} como resolvido via GMUD? Ele será movido para Histórico > Resolvidos via GMUD e ficará disponível por 15 dias.`);
  if (!confirmou) {
    checkbox.checked = false;
    return;
  }
  checkbox.disabled = true;
  try {
    const atualizado = await marcarCaseResolvido(caseItem.id, { origem: 'GMUD' });
    notificarAlteracaoEntidade('case', caseItem.id, atualizado?.atualizadoEm);
    toast('Case movido para Histórico > Resolvidos via GMUD.');
    await atualizarTudo();
    await sincronizarEstadoSeguro();
  } catch (erro) {
    checkbox.checked = false;
    checkbox.disabled = false;
    toast(erro.message, true);
  }
}

async function reabrirResolvido(caseItem) {
  if (!confirm(`Reabrir o case ${caseItem.protocolo} em "Em análise"?`)) return;
  try {
    const atualizado = await reabrirCaseResolvido(caseItem.id, 'Em análise');
    notificarAlteracaoEntidade('case', caseItem.id, atualizado?.atualizadoEm);
    toast('Case reaberto.');
    await atualizarTudo();
    await sincronizarEstadoSeguro();
  } catch (erro) {
    toast(erro.message, true);
  }
}

function criarCardCase(c, abertas) {
  const atrasados = abertas.filter((o) => o.estado === ESTADOS_OCORRENCIA.ATRASADA).length;
  const proxima = abertas[0] ?? null;
  const corpo = el('div', { className: 'case-card-body' });

  const mensagemPreview = c.mensagem || c.resumo;
  if (mensagemPreview) {
    const texto = mensagemPreview.length > 210 ? `${mensagemPreview.slice(0, 210)}…` : mensagemPreview;
    corpo.append(el('p', { className: 'case-message' }, texto));
  }

  const info = el('div', {});
  if (viewAtual === 'historico') {
    const dias = diasRestantesResolvido(c);
    info.append(
      el('span', { className: 'case-meta-label' }, 'Retenção do histórico'),
      el('span', { className: 'case-meta-value' }, c.finalizadoEm ? `Resolvido em ${formatarDataHora(c.finalizadoEm)}` : 'Case resolvido'),
      el('span', { className: 'retention-note' }, dias === 0 ? 'Exclusão na próxima limpeza automática' : `Exclusão automática em ${dias} dia(s)`),
    );
  } else {
    info.append(
      el('span', { className: 'case-meta-label' }, 'Próximo lembrete'),
      el('span', { className: 'case-meta-value' }, proxima ? formatarDataHora(vencimentoEfetivo(proxima)) : 'Sem lembrete pendente'),
    );
    if (atrasados > 0) {
      info.append(el('span', { className: 'overdue-note' }, `${atrasados} lembrete(s) atrasado(s)`));
    }
  }

  const acoes = el('div', { className: 'case-card-actions' });
  if (viewAtual === 'gmud') {
    const checkbox = el('input', { type: 'checkbox', 'aria-label': `Marcar ${c.protocolo} como resolvido` });
    checkbox.addEventListener('change', () => resolverCasePelaGmud(c, checkbox));
    acoes.append(el('label', { className: 'resolve-check' }, checkbox, el('span', {}, 'Resolvido')));
  }
  if (viewAtual !== 'historico') {
    acoes.append(
      el('button', {
        type: 'button',
        className: 'secondary-action compact-action btn-copy',
        disabled: !String(c.mensagem ?? '').trim(),
        title: c.mensagem ? 'Copiar mensagem preparada' : 'Este case não possui mensagem preparada',
        onclick: async () => {
          try { await navigator.clipboard.writeText(c.mensagem ?? ''); toast('Mensagem do case copiada.'); }
          catch { toast('Não foi possível copiar a mensagem.', true); }
        },
      }, 'Copiar mensagem'),
      el('button', {
        type: 'button',
        className: 'secondary-action compact-action btn-delay',
        disabled: !proxima,
        title: proxima ? 'Adiar o próximo lembrete em 30 minutos' : 'Sem lembrete em aberto',
        onclick: () => proxima && executarAdiamentoOcorrencia(proxima.id, 30).catch((e) => toast(e.message, true)),
      }, '+30 min'),
    );
    if (caseAtivo(c) && c.situacao !== 'Aguardando GMUD') {
      acoes.append(el('button', {
        type: 'button', className: 'secondary-action compact-action btn-gmud', onclick: async () => {
          if (!confirm(`Mover ${c.protocolo} para Aguardando GMUD?`)) return;
          try {
            const atualizado = await editarCase(c.id, { situacao: 'Aguardando GMUD' });
            notificarAlteracaoEntidade('case', c.id, atualizado?.atualizadoEm);
            await atualizarTudo();
            await sincronizarEstadoSeguro();
            toast('Case movido para Aguardando GMUD.');
          } catch (e) { toast(e.message, true); }
        },
      }, 'Enviar para GMUD'));
    }
    if (caseAtivo(c) && viewAtual !== 'gmud') {
      acoes.append(el('button', {
        type: 'button', className: 'secondary-action compact-action btn-success', onclick: async () => {
          if (!confirm(`Marcar ${c.protocolo} como resolvido?`)) return;
          try {
            const atualizado = await marcarCaseResolvido(c.id, { origem: 'GERAL' });
            notificarAlteracaoEntidade('case', c.id, atualizado?.atualizadoEm);
            await atualizarTudo();
            await sincronizarEstadoSeguro();
            toast('Case movido para o Histórico de resolvidos.');
          } catch (e) { toast(e.message, true); }
        },
      }, 'Resolver'));
    }
  }
  if (viewAtual === 'historico') {
    acoes.append(el('button', {
      type: 'button',
      className: 'secondary-action compact-action btn-reopen',
      onclick: () => reabrirResolvido(c),
    }, 'Reabrir'));
  }
  acoes.append(el('button', {
    type: 'button',
    className: 'open-case-button btn-open',
    onclick: () => abrirCase(c.id).catch((e) => toast(e.message, true)),
  }, 'Abrir case →'));

  const meta = el('div', { className: 'case-meta-row' }, info, acoes);
  corpo.append(meta);

  return el('article', { className: 'case-card', dataset: { prioridade: c.prioridade } },
    el('div', { className: 'case-card-top' },
      el('div', {},
        el('div', { className: 'case-protocol' }, c.protocolo),
        el('div', { className: 'case-title' }, c.titulo),
      ),
      el('div', { className: 'case-card-badges' },
        badgePrioridade(c.prioridade),
        badgeSituacao(c.situacao),
        viewAtual === 'historico' && c.origemResolucao === 'GMUD'
          ? el('span', { className: 'badge history-origin-badge' }, 'Via GMUD')
          : null,
      ),
    ),
    corpo,
  );
}

function criarColunaHistorico(titulo, descricao, cases, ocorrPorCase, classe = '') {
  const lista = el('div', { className: 'history-column-list' });
  if (!cases.length) {
    lista.append(
      el('div', { className: 'history-empty' },
        el('strong', {}, 'Nenhum case nesta coluna.'),
        el('p', {}, descricao),
      ),
    );
  } else {
    for (const c of cases) lista.append(criarCardCase(c, ocorrPorCase.get(c.id) ?? []));
  }

  return el('section', { className: `history-column ${classe}`.trim() },
    el('header', { className: 'history-column-header' },
      el('div', {},
        el('p', { className: 'eyebrow' }, 'Retenção de 15 dias'),
        el('h3', {}, titulo),
        el('p', { className: 'history-column-description' }, descricao),
      ),
      el('span', { className: 'count-badge' }, `${cases.length} ${cases.length === 1 ? 'case' : 'cases'}`),
    ),
    lista,
  );
}

function renderHistorico(cases, ocorrPorCase) {
  const resolvidos = cases.filter((c) => c.situacao === 'Resolvido');
  const resolvidosGmud = resolvidos.filter((c) => c.origemResolucao === 'GMUD');
  const resolvidosGerais = resolvidos.filter((c) => c.origemResolucao !== 'GMUD');

  refs.lista.replaceChildren(
    el('div', { className: 'history-columns' },
      criarColunaHistorico(
        'Cases resolvidos',
        'Cases concluídos pelo fluxo normal do atendimento.',
        resolvidosGerais,
        ocorrPorCase,
        'history-general',
      ),
      criarColunaHistorico(
        'Resolvidos via GMUD',
        'Cases marcados como resolvidos diretamente na fila Aguardando GMUD.',
        resolvidosGmud,
        ocorrPorCase,
        'history-gmud',
      ),
    ),
  );
  refs.contadorLista.textContent = `${resolvidos.length} ${resolvidos.length === 1 ? 'item' : 'itens'}`;
}

async function renderCases() {
  const [cases, ocorrencias] = await Promise.all([listarCases(), listarOcorrenciasAbertas()]);
  const ocorrPorCase = new Map();
  for (const o of ocorrencias) {
    if (!ocorrPorCase.has(o.caseId)) ocorrPorCase.set(o.caseId, []);
    ocorrPorCase.get(o.caseId).push(o);
  }

  if (viewAtual === 'historico') {
    renderHistorico(cases, ocorrPorCase);
    return;
  }

  const filtrados = cases.filter((c) => casePassaFiltros(c, ocorrPorCase));
  refs.lista.replaceChildren();
  refs.contadorLista.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'item' : 'itens'}`;

  if (!filtrados.length) {
    const vazio = el('div', { className: 'vazio' },
      el('strong', {}, cases.length ? 'Nenhum case encontrado para os filtros atuais.' : 'Nenhum case cadastrado ainda.'),
    );
    if (!cases.length) {
      vazio.append(
        el('p', {}, 'Os cases são cadastrados manualmente. Adicione o primeiro protocolo para iniciar o acompanhamento.'),
        el('button', {
          type: 'button',
          className: 'primary-action',
          onclick: () => abrirNovoCase().catch((e) => toast(e.message, true)),
        }, '+ Novo case'),
      );
    }
    refs.lista.append(vazio);
    return;
  }

  const grupos = new Map();
  for (const c of filtrados) {
    if (!grupos.has(c.situacao)) grupos.set(c.situacao, []);
    grupos.get(c.situacao).push(c);
  }

  for (const [situacao, grupo] of grupos) {
    const grid = el('div', { className: 'case-grid' });
    for (const c of grupo) grid.append(criarCardCase(c, ocorrPorCase.get(c.id) ?? []));
    refs.lista.append(
      el('section', { className: 'case-group' },
        el('div', { className: 'case-group-heading' },
          el('h3', {}, situacao),
          el('span', { className: 'case-group-count' }, `${grupo.length} ${grupo.length === 1 ? 'case' : 'cases'}`),
        ),
        grid,
      ),
    );
  }
}

function criarCardLembrete(ocorrencia) {
  const c = ocorrencia.case;
  const atrasado = ocorrencia.estado === ESTADOS_OCORRENCIA.ATRASADA;
  const quando = formatarDataHora(vencimentoEfetivo(ocorrencia));
  const card = el('article', { className: `reminder-card ${atrasado ? 'atrasado' : ''}` },
    el('div', { className: 'reminder-top' },
      el('div', {},
        el('div', { className: 'case-protocol' }, c.protocolo),
        el('div', { className: 'case-title' }, c.titulo),
      ),
      badgePrioridade(c.prioridade),
    ),
    el('div', { className: 'case-card-body' },
      el('div', {},
        el('span', { className: 'case-meta-label' }, atrasado ? 'Lembrete atrasado' : 'Horário previsto'),
        el('span', { className: 'reminder-when' }, quando),
      ),
      badgeSituacao(c.situacao),
    ),
  );

  const acoes = el('div', { className: 'reminder-actions' },
    el('button', {
      type: 'button',
      className: 'btn-success',
      onclick: () => executarConfirmacaoOcorrencia(ocorrencia.id).catch((e) => toast(e.message, true)),
    }, 'Confirmar atualização'),
    el('button', {
      type: 'button',
      className: 'btn-delay',
      onclick: () => executarAdiamentoOcorrencia(ocorrencia.id, 30).catch((e) => toast(e.message, true)),
    }, '+30 min'),
    el('button', {
      type: 'button',
      className: 'btn-open',
      onclick: () => abrirCase(c.id).catch((e) => toast(e.message, true)),
    }, 'Abrir case'),
  );
  card.append(acoes);
  return card;
}

// -----------------------------------------------------------------------------
// Lembretes e diagnóstico de notificações
// -----------------------------------------------------------------------------

async function renderLembretes() {
  const ocorrencias = await listarOcorrenciasAbertas();
  const ocorrPorCase = new Map();
  for (const o of ocorrencias) {
    if (!ocorrPorCase.has(o.caseId)) ocorrPorCase.set(o.caseId, []);
    ocorrPorCase.get(o.caseId).push(o);
  }

  const filtradas = ocorrencias.filter((o) => casePassaFiltros(o.case, ocorrPorCase));
  refs.lista.replaceChildren();
  refs.contadorLista.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'lembrete' : 'lembretes'}`;

  if (!filtradas.length) {
    refs.lista.append(
      el('div', { className: 'vazio' },
        el('strong', {}, 'Nenhum lembrete em aberto.'),
        el('p', {}, 'Os próximos lembretes aparecerão aqui conforme os horários definidos em cada case.'),
      ),
    );
    return;
  }

  const grid = el('div', { className: 'reminders-grid' });
  for (const ocorrencia of filtradas) grid.append(criarCardLembrete(ocorrencia));
  refs.lista.append(grid);
}

async function renderConteudoPrincipal() {
  if (viewAtual === 'lembretes') await renderLembretes();
  else await renderCases();
}

async function atualizarResumo() {
  const [cases, ocorrencias] = await Promise.all([listarCases(), listarOcorrenciasAbertas()]);
  const agora = new Date();
  const ini = inicioDoDiaNoFuso(agora);
  const fim = fimDoDiaNoFuso(agora);
  $('qtdAtrasados').textContent = ocorrencias.filter((o) => o.estado === ESTADOS_OCORRENCIA.ATRASADA).length;
  $('qtdHoje').textContent = ocorrencias.filter((o) => {
    const d = new Date(vencimentoEfetivo(o));
    return d >= ini && d <= fim;
  }).length;
  $('qtdPrioritarios').textContent = cases.filter((c) => caseAtivo(c) && ['Alta', 'Crítica'].includes(c.prioridade)).length;
  $('qtdAtivos').textContent = cases.filter(caseAtivo).length;
}

function obterStatusNotificacao() {
  if (!('Notification' in window)) return 'sem suporte';
  return Notification.permission;
}

function instrucoesNotificacaoBloqueada() {
  return 'As notificações estão bloqueadas. No Chrome, clique no ícone ao lado do endereço, abra as permissões do site e permita notificações para localhost:8765.';
}

function atualizarAlertaNotificacao() {
  const status = obterStatusNotificacao();
  refs.btnNotificacao.dataset.status = status;

  if (status === 'granted') {
    refs.alertaNotificacao.hidden = true;
    refs.textoStatusNotificacao.textContent = 'Notificações ativas';
    refs.configStatusNotificacao.textContent = 'Permitidas. O Chrome pode exibir os lembretes enquanto o sistema estiver disponível.';
    refs.btnNotificacaoConfig.textContent = 'Notificações ativas';
    return;
  }

  refs.alertaNotificacao.hidden = false;
  refs.btnAtivarNotificacoesBanner.hidden = false;

  if (status === 'default') {
    refs.textoStatusNotificacao.textContent = 'Ativar notificações';
    refs.alertaNotificacaoTexto.textContent = 'Você ainda não permitiu notificações para este site. Sem a permissão, os lembretes continuam visíveis dentro do sistema, mas não aparecem como alerta do Chrome.';
    refs.btnAtivarNotificacoesBanner.textContent = 'Ativar agora';
    refs.btnAtivarNotificacoesBanner.dataset.acao = 'solicitar';
    refs.configStatusNotificacao.textContent = 'A permissão ainda não foi solicitada ou concluída neste navegador.';
    refs.btnNotificacaoConfig.textContent = 'Permitir notificações';
    return;
  }

  if (status === 'denied') {
    refs.textoStatusNotificacao.textContent = 'Notificações bloqueadas';
    refs.alertaNotificacaoTexto.textContent = 'O Chrome está bloqueando os alertas deste site. Reative a permissão para receber os avisos dos cases.';
    refs.btnAtivarNotificacoesBanner.textContent = 'Ver como ativar';
    refs.btnAtivarNotificacoesBanner.dataset.acao = 'ajuda';
    refs.configStatusNotificacao.textContent = 'Bloqueadas pelo Chrome. A permissão precisa ser reativada nas configurações do site.';
    refs.btnNotificacaoConfig.textContent = 'Ver como ativar';
    return;
  }

  refs.textoStatusNotificacao.textContent = 'Sem suporte a notificações';
  refs.alertaNotificacaoTexto.textContent = 'Este navegador não oferece suporte à API de notificações necessária para os alertas externos.';
  refs.btnAtivarNotificacoesBanner.hidden = true;
  refs.btnAtivarNotificacoesBanner.dataset.acao = '';
  refs.configStatusNotificacao.textContent = 'A API de notificações não está disponível neste navegador.';
  refs.btnNotificacaoConfig.textContent = 'Indisponível';
}

async function atualizarDiagnostico() {
  const d = await diagnosticoLocal();
  const backup = d.ultimoBackupEm ? formatarDataHora(d.ultimoBackupEm) : 'nunca';
  const backupAntigo = !d.ultimoBackupEm || (Date.now() - Date.parse(d.ultimoBackupEm)) > 7 * 86_400_000;
  const avisoBackup = backupAntigo ? ' • Backup recomendado' : '';
  refs.diagnosticoTexto.textContent = `IndexedDB: ${d.indexedDBDisponivel ? 'OK' : 'indisponível'} • Notificações: ${d.notificacoes} • Último backup: ${backup}${avisoBackup}`;
  refs.versaoAplicacao.textContent = APP_VERSION;
  refs.versaoSidebar.textContent = APP_VERSION;
}

async function atualizarTudo() {
  await Promise.all([renderConteudoPrincipal(), atualizarResumo(), atualizarDiagnostico(), renderFavoritosPainel()]);
  atualizarIndicadorRascunhos();
  if (viewAtual === 'rascunhos') await renderRascunhos();
  atualizarAlertaNotificacao();
}

async function atualizarSelectModelos() {
  const modelos = await listarModelos();
  refs.modeloAplicar.replaceChildren(el('option', { value: '' }, 'Aplicar macro...'));
  for (const m of modelos) refs.modeloAplicar.append(el('option', { value: m.id }, m.nome));
}

async function copiarTextoMacro(conteudo) {
  try {
    await navigator.clipboard.writeText(String(conteudo ?? ''));
    toast('Macro copiada.');
  } catch {
    toast('Não foi possível copiar a macro. Verifique a permissão da área de transferência.', true);
  }
}

function atualizarBotaoFavorito(botao, favorita, rotuloSingular) {
  if (!botao) return;
  const ativo = favorita === true;
  botao.classList.toggle('ativo', ativo);
  botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  botao.setAttribute('title', ativo ? `Remover ${rotuloSingular} dos favoritos` : `Favoritar ${rotuloSingular}`);
  botao.setAttribute('aria-label', ativo ? `Remover ${rotuloSingular} dos favoritos` : `Favoritar ${rotuloSingular}`);
  const estrela = botao.querySelector('[aria-hidden="true"]');
  const label = botao.querySelector('.favorite-button-label');
  if (estrela) estrela.textContent = ativo ? '★' : '☆';
  if (label) label.textContent = ativo ? 'Favorita' : 'Favoritar';
}

// -----------------------------------------------------------------------------
// Macros de mensagem
// -----------------------------------------------------------------------------

function limparModelo() {
  refs.modeloId.value = '';
  refs.modeloNome.value = '';
  refs.modeloConteudo.value = '';
  macroFavoritaState = false;
  atualizarBotaoFavorito(refs.btnFavoritarMacroModal, false, 'macro');
  if (refs.tituloDialogMacro) refs.tituloDialogMacro.textContent = 'Nova macro';
  if (refs.metaDialogMacro) refs.metaDialogMacro.textContent = 'Crie uma mensagem reutilizável para o atendimento diário.';
  if (refs.btnCopiarMacroModal) refs.btnCopiarMacroModal.disabled = true;
  if (refs.btnExcluirMacroModal) refs.btnExcluirMacroModal.hidden = true;
}

function abrirNovaMacro() {
  limparModelo();
  refs.dlgModelos.showModal();
  window.setTimeout(() => refs.modeloNome.focus(), 0);
}

function abrirMacroExistente(modelo) {
  refs.modeloId.value = modelo.id;
  refs.modeloNome.value = modelo.nome;
  refs.modeloConteudo.value = modelo.conteudo;
  macroFavoritaState = modelo.favorita === true;
  atualizarBotaoFavorito(refs.btnFavoritarMacroModal, macroFavoritaState, 'macro');
  if (refs.tituloDialogMacro) refs.tituloDialogMacro.textContent = 'Editar macro';
  if (refs.metaDialogMacro) {
    refs.metaDialogMacro.textContent = modelo.criadoEm
      ? `Criada em ${formatarDataHora(modelo.criadoEm)} • Última atualização em ${formatarDataHora(modelo.atualizadoEm ?? modelo.criadoEm)}`
      : 'Edite ou copie esta mensagem reutilizável.';
  }
  if (refs.btnCopiarMacroModal) refs.btnCopiarMacroModal.disabled = false;
  if (refs.btnExcluirMacroModal) refs.btnExcluirMacroModal.hidden = false;
  refs.dlgModelos.showModal();
  window.setTimeout(() => refs.modeloNome.focus(), 0);
}

async function renderModelos() {
  const modelos = await listarModelos();
  const termo = String(refs.filtroMacros?.value ?? '').trim().toLocaleLowerCase('pt-BR');
  const filtrados = modelos.filter((modelo) => {
    if (!termo) return true;
    const corpus = [modelo.nome, modelo.conteudo].join(' ').toLocaleLowerCase('pt-BR');
    return corpus.includes(termo);
  });

  refs.listaModelos.replaceChildren();
  if (refs.contadorMacros) refs.contadorMacros.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'macro' : 'macros'}`;

  if (!filtrados.length) {
    refs.listaModelos.append(
      el('div', { className: 'vazio macro-empty' },
        el('strong', {}, termo ? 'Nenhuma macro encontrada.' : 'Nenhuma macro cadastrada ainda.'),
        el('p', {}, termo ? 'Tente pesquisar por outro título ou trecho da mensagem.' : 'Crie mensagens reutilizáveis para responder e atualizar cases com mais rapidez.'),
        termo ? null : el('button', { type: 'button', className: 'primary-action', onclick: abrirNovaMacro }, '+ Nova macro'),
      ),
    );
    return;
  }

  for (const m of filtrados) {
    const dataCriacao = m.criadoEm ? formatarDataHora(m.criadoEm) : 'Data não disponível';
    const preview = String(m.conteudo ?? '').trim();
    const card = el('article', { className: `case-card macro-library-card${m.favorita === true ? ' is-favorite' : ''}`, dataset: { prioridade: 'Normal' } },
      el('div', { className: 'case-card-top macro-card-top' },
        el('div', { className: 'macro-card-title-wrap' },
          el('button', {
            type: 'button',
            className: 'macro-title-button',
            onclick: () => abrirMacroExistente(m),
          }, m.nome),
          el('span', { className: 'macro-created-date' }, `Criada em ${dataCriacao}`),
        ),
        el('div', { className: 'favorite-card-tools' },
          el('button', {
            type: 'button',
            className: `favorite-button favorite-button-card${m.favorita === true ? ' ativo' : ''}`,
            title: m.favorita === true ? 'Remover macro dos favoritos' : 'Favoritar macro',
            'aria-label': m.favorita === true ? 'Remover macro dos favoritos' : 'Favoritar macro',
            'aria-pressed': m.favorita === true ? 'true' : 'false',
            onclick: async (event) => {
              event.stopPropagation();
              try {
                await definirModeloFavorito(m.id, m.favorita !== true);
                await Promise.all([renderModelos(), renderFavoritosPainel()]);
                await atualizarSelectModelos();
                await sincronizarEstadoSeguro();
                toast(m.favorita === true ? 'Macro removida dos favoritos.' : 'Macro adicionada aos favoritos.');
              } catch (e) { toast(e.message, true); }
            },
          }, m.favorita === true ? '★' : '☆'),
          el('span', { className: 'badge badge-status-analise' }, m.favorita === true ? 'Favorita' : 'Macro'),
        ),
      ),
      preview
        ? el('div', { className: 'macro-card-preview' }, preview.length > 240 ? `${preview.slice(0, 240)}…` : preview)
        : el('div', { className: 'macro-card-preview macro-card-preview-empty' }, 'Sem conteúdo.'),
      el('div', { className: 'macro-card-footer' },
        el('div', { className: 'macro-card-meta' },
          el('span', { className: 'case-reminder-label' }, 'MENSAGEM REUTILIZÁVEL'),
          el('span', {}, m.atualizadoEm && m.atualizadoEm !== m.criadoEm ? `Atualizada em ${formatarDataHora(m.atualizadoEm)}` : 'Pronta para copiar'),
        ),
        el('div', { className: 'macro-card-actions' },
          el('button', {
            type: 'button',
            className: 'secondary-action compact-action btn-copy',
            onclick: async (event) => {
              event.stopPropagation();
              await copiarTextoMacro(m.conteudo);
            },
          }, 'Copiar'),
          el('button', {
            type: 'button',
            className: 'secondary-action compact-action btn-duplicate',
            onclick: async (event) => {
              event.stopPropagation();
              try {
                await salvarModelo({ nome: `${m.nome} (cópia)`, conteudo: m.conteudo, favorita: false });
                await renderModelos();
                await atualizarSelectModelos();
                await sincronizarEstadoSeguro();
                toast('Macro duplicada.');
              } catch (e) { toast(e.message, true); }
            },
          }, 'Duplicar'),
          el('button', {
            type: 'button',
            className: 'secondary-action compact-action btn-export',
            onclick: (event) => {
              event.stopPropagation();
              baixarTexto(m.conteudo, `${nomeArquivoSeguro(m.nome, 'macro')}.txt`);
              toast('Macro exportada.');
            },
          }, 'Exportar'),
          el('button', {
            type: 'button',
            className: 'open-case-button btn-open',
            onclick: (event) => {
              event.stopPropagation();
              abrirMacroExistente(m);
            },
          }, 'Abrir macro →'),
        ),
      ),
    );
    refs.listaModelos.append(card);
  }
}


// -----------------------------------------------------------------------------
// Comentários e anexos
// -----------------------------------------------------------------------------

function formatarTamanhoArquivo(bytes) {
  const valor = Number(bytes ?? 0);
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / 1024 / 1024).toFixed(1)} MB`;
}

function criarUrlTemporaria(blob) {
  const url = URL.createObjectURL(blob);
  objectUrlsAtivos.add(url);
  return url;
}

function limparUrlsTemporarias() {
  for (const url of objectUrlsAtivos) URL.revokeObjectURL(url);
  objectUrlsAtivos.clear();
}

function nomeSeguroArquivo(file) {
  return String(file?.name ?? `imagem-${Date.now()}.png`).slice(0, 180);
}

function normalizarArquivosClipboard(files) {
  return Array.from(files ?? []).map((file) => {
    if (file.name) return file;
    return new File([file], `imagem-colada-${Date.now()}.png`, { type: file.type || 'image/png' });
  });
}

function renderPendentesComentario() {
  refs.comentarioArquivosPendentes.replaceChildren();
  for (const [indice, file] of comentarioArquivosPendentesState.entries()) {
    refs.comentarioArquivosPendentes.append(
      el('span', { className: 'pending-attachment' },
        el('span', {}, `${nomeSeguroArquivo(file)} • ${formatarTamanhoArquivo(file.size)}`),
        el('button', {
          type: 'button',
          title: 'Remover imagem',
          'aria-label': `Remover ${nomeSeguroArquivo(file)}`,
          onclick: () => {
            comentarioArquivosPendentesState.splice(indice, 1);
            renderPendentesComentario();
          },
        }, '×'),
      ),
    );
  }
}

function adicionarImagensPendentesComentario(files) {
  const imagens = normalizarArquivosClipboard(files).filter((file) => String(file.type).startsWith('image/'));
  if (!imagens.length) return;
  comentarioArquivosPendentesState.push(...imagens);
  renderPendentesComentario();
}

function criarCardAnexo(anexo, { removivel = true, aoRemover = null } = {}) {
  const ehImagem = String(anexo.mimeType).startsWith('image/');
  const url = criarUrlTemporaria(anexo.blob);
  const visual = ehImagem
    ? el('img', { className: 'attachment-preview', src: url, alt: anexo.nome })
    : el('div', { className: 'attachment-file-icon', 'aria-hidden': 'true' }, 'PDF');
  const acoes = el('div', { className: 'attachment-card-actions' },
    el('button', {
      type: 'button',
      className: 'secondary-action',
      onclick: () => window.open(url, '_blank', 'noopener,noreferrer'),
    }, ehImagem ? 'Abrir' : 'Abrir PDF'),
  );
  if (removivel) {
    acoes.append(el('button', {
      type: 'button',
      className: 'danger-action',
      onclick: async () => {
        if (!confirm(`Remover o arquivo "${anexo.nome}"?`)) return;
        await excluirAnexo(anexo.id);
        await aoRemover?.();
        toast('Arquivo removido.');
      },
    }, 'Remover'));
  }
  return el('article', { className: 'attachment-card' },
    visual,
    el('div', { className: 'attachment-name', title: anexo.nome }, anexo.nome),
    el('div', { className: 'attachment-meta' }, formatarTamanhoArquivo(anexo.tamanho)),
    acoes,
  );
}

async function renderComentariosCase(caseId) {
  if (!refs.listaComentariosCase || !caseId) return;
  const comentarios = await listarComentariosCase(caseId);
  refs.listaComentariosCase.replaceChildren();
  if (!comentarios.length) {
    refs.listaComentariosCase.append(el('p', { className: 'muted-empty' }, 'Nenhum comentário registrado neste case.'));
    return;
  }
  for (const comentario of comentarios) {
    const anexos = await listarAnexos('caseComment', comentario.id);
    const galeria = el('div', { className: 'attachment-gallery' });
    for (const anexo of anexos) {
      galeria.append(criarCardAnexo(anexo, { aoRemover: () => renderComentariosCase(caseId) }));
    }
    refs.listaComentariosCase.append(
      el('article', { className: 'comment-item' },
        el('div', { className: 'comment-item-header' },
          el('span', {}, formatarDataHora(comentario.criadoEm)),
          el('span', {}, anexos.length ? `${anexos.length} imagem(ns)` : 'Sem imagens'),
        ),
        comentario.texto ? el('div', { className: 'comment-item-text' }, comentario.texto) : null,
        anexos.length ? galeria : null,
        el('div', { className: 'comment-item-actions' },
          el('button', {
            type: 'button',
            className: 'danger-action compact-action',
            onclick: async () => {
              if (!confirm('Excluir este comentário e suas imagens?')) return;
              await excluirComentarioCase(comentario.id);
              await renderComentariosCase(caseId);
              await sincronizarEstadoSeguro();
              toast('Comentário excluído.');
            },
          }, 'Excluir comentário'),
        ),
      ),
    );
  }
}

async function salvarNovoComentarioCase() {
  const caseId = refs.caseId.value;
  if (!caseId) throw new Error('Salve o case antes de adicionar comentários.');
  const texto = refs.comentarioTexto.value.trim();
  if (!texto && !comentarioArquivosPendentesState.length) throw new Error('Digite um comentário ou adicione uma imagem.');
  const comentarioId = await adicionarComentarioCase({ caseId, texto });
  try {
    if (comentarioArquivosPendentesState.length) {
      await adicionarAnexos('caseComment', comentarioId, comentarioArquivosPendentesState, { aceitarPdf: false });
    }
  } catch (erro) {
    await excluirComentarioCase(comentarioId);
    throw erro;
  }
  refs.comentarioTexto.value = '';
  refs.inputImagemComentario.value = '';
  comentarioArquivosPendentesState = [];
  renderPendentesComentario();
  limparUrlsTemporarias();
  await renderComentariosCase(caseId);
  await sincronizarEstadoSeguro();
  toast('Comentário adicionado.');
}

// -----------------------------------------------------------------------------
// Anotações
// -----------------------------------------------------------------------------

function limparFormularioAnotacao() {
  suspenderRascunhos = true;
  refs.formAnotacao.reset();
  refs.anotacaoId.value = '';
  anotacaoFavoritaState = false;
  atualizarBotaoFavorito(refs.btnFavoritarAnotacaoModal, false, 'anotação');
  refs.tituloDialogAnotacao.textContent = 'Nova anotação';
  refs.metaDialogAnotacao.textContent = 'Crie uma anotação pesquisável e mantenha referências locais.';
  refs.btnExcluirAnotacao.hidden = true;
  refs.anexosAnotacao.replaceChildren(el('p', { className: 'muted-empty' }, 'Os arquivos serão vinculados após salvar a anotação.'));
  anotacaoArquivosPendentesState = [];
  refs.inputAnexosAnotacao.value = '';
  versaoAnotacaoAberta = null;
  anotacaoAlteradaOutraAba = false;
  mostrarStatusRascunho(refs.statusRascunhoAnotacao, '');
  suspenderRascunhos = false;
}

function abrirNovaAnotacao() {
  limparFormularioAnotacao();
  refs.dlgAnotacao.showModal();
  window.setTimeout(() => refs.anotacaoTitulo.focus(), 0);
}

async function renderAnexosAnotacao(anotacaoId) {
  refs.anexosAnotacao.replaceChildren();
  if (!anotacaoId) {
    for (const [indice, file] of anotacaoArquivosPendentesState.entries()) {
      refs.anexosAnotacao.append(
        el('div', { className: 'pending-attachment' },
          el('span', {}, `${nomeSeguroArquivo(file)} • ${formatarTamanhoArquivo(file.size)}`),
          el('button', { type: 'button', onclick: () => {
            anotacaoArquivosPendentesState.splice(indice, 1);
            renderAnexosAnotacao(null);
          } }, '×'),
        ),
      );
    }
    if (!anotacaoArquivosPendentesState.length) refs.anexosAnotacao.append(el('p', { className: 'muted-empty' }, 'Nenhum arquivo selecionado.'));
    return;
  }
  limparUrlsTemporarias();
  const anexos = await listarAnexos('note', anotacaoId);
  if (!anexos.length) {
    refs.anexosAnotacao.append(el('p', { className: 'muted-empty' }, 'Nenhum arquivo anexado.'));
    return;
  }
  for (const anexo of anexos) {
    refs.anexosAnotacao.append(criarCardAnexo(anexo, { aoRemover: () => renderAnexosAnotacao(anotacaoId) }));
  }
}

async function abrirAnotacaoExistente(id) {
  const nota = await obterAnotacao(id);
  if (!nota) throw new Error('Anotação não encontrada.');
  suspenderRascunhos = true;
  refs.anotacaoId.value = nota.id;
  refs.anotacaoTitulo.value = nota.titulo;
  refs.anotacaoConteudo.value = nota.conteudo ?? '';
  anotacaoFavoritaState = nota.favorita === true;
  atualizarBotaoFavorito(refs.btnFavoritarAnotacaoModal, anotacaoFavoritaState, 'anotação');
  refs.tituloDialogAnotacao.textContent = 'Editar anotação';
  refs.metaDialogAnotacao.textContent = `Criada em ${formatarDataHora(nota.criadoEm)} • Atualizada em ${formatarDataHora(nota.atualizadoEm)}`;
  refs.btnExcluirAnotacao.hidden = false;
  anotacaoArquivosPendentesState = [];
  versaoAnotacaoAberta = nota.atualizadoEm ?? null;
  anotacaoAlteradaOutraAba = false;
  mostrarStatusRascunho(refs.statusRascunhoAnotacao, '');
  suspenderRascunhos = false;
  await renderAnexosAnotacao(nota.id);
  refs.dlgAnotacao.showModal();
  recuperarRascunhoAnotacaoSeNecessario(nota.id, nota.atualizadoEm);
  window.setTimeout(() => refs.anotacaoTitulo.focus(), 0);
}

async function renderAnotacoes() {
  if (!refs.listaAnotacoes) return;
  const notas = await listarAnotacoes();
  const termo = String(refs.filtroAnotacoes?.value ?? '').trim().toLocaleLowerCase('pt-BR');
  const filtradas = notas.filter((nota) => {
    if (!termo) return true;
    const corpus = [nota.titulo, nota.conteudo, ...(nota.palavrasChave ?? [])].join(' ').toLocaleLowerCase('pt-BR');
    return corpus.includes(termo);
  });
  refs.contadorAnotacoes.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'anotação' : 'anotações'}`;
  refs.listaAnotacoes.replaceChildren();
  if (!filtradas.length) {
    refs.listaAnotacoes.append(
      el('div', { className: 'vazio' },
        el('strong', {}, termo ? 'Nenhuma anotação encontrada.' : 'Nenhuma anotação cadastrada.'),
        el('p', {}, termo ? 'Tente pesquisar por outro título, conteúdo ou palavra.' : 'Crie uma anotação para guardar procedimentos e referências.'),
        termo ? null : el('button', { type: 'button', className: 'primary-action', onclick: abrirNovaAnotacao }, '+ Nova anotação'),
      ),
    );
    return;
  }
  for (const nota of filtradas) {
    const anexos = await listarAnexos('note', nota.id);
    const preview = String(nota.conteudo ?? '').trim();
    refs.listaAnotacoes.append(
      el('article', { className: `note-card${nota.favorita === true ? ' is-favorite' : ''}` },
        el('div', { className: 'note-card-top' },
          el('div', {},
            el('h3', { className: 'note-card-title' }, nota.titulo),
            nota.favorita === true ? el('span', { className: 'favorite-inline-label' }, '★ Favorita') : null,
          ),
          el('div', { className: 'note-card-top-actions' },
            el('button', {
              type: 'button',
              className: `favorite-button favorite-button-card${nota.favorita === true ? ' ativo' : ''}`,
              title: nota.favorita === true ? 'Remover anotação dos favoritos' : 'Favoritar anotação',
              'aria-label': nota.favorita === true ? 'Remover anotação dos favoritos' : 'Favoritar anotação',
              'aria-pressed': nota.favorita === true ? 'true' : 'false',
              onclick: async (event) => {
                event.stopPropagation();
                try {
                  const atualizada = await definirAnotacaoFavorita(nota.id, nota.favorita !== true);
                  notificarAlteracaoEntidade('anotacao', nota.id, atualizada?.atualizadoEm);
                  await renderAnotacoes();
                  await renderFavoritosPainel();
                  await sincronizarEstadoSeguro();
                  toast(nota.favorita === true ? 'Anotação removida dos favoritos.' : 'Anotação adicionada aos favoritos.');
                } catch (e) { toast(e.message, true); }
              },
            }, nota.favorita === true ? '★' : '☆'),
            el('span', { className: 'note-card-date' }, `Atualizada em ${formatarDataHora(nota.atualizadoEm)}`),
          ),
        ),
        el('div', { className: 'note-card-preview' }, preview ? (preview.length > 260 ? `${preview.slice(0, 260)}…` : preview) : 'Sem conteúdo de texto.'),
        el('div', { className: 'note-card-footer' },
          el('span', { className: 'note-files-count' }, `${anexos.length} arquivo(s) local(is)`),
          el('div', { className: 'note-card-actions' },
            el('button', { type: 'button', className: 'secondary-action compact-action btn-copy', onclick: async () => {
              try { await navigator.clipboard.writeText(nota.conteudo ?? ''); toast('Anotação copiada.'); }
              catch { toast('Não foi possível copiar a anotação.', true); }
            } }, 'Copiar'),
            el('button', { type: 'button', className: 'secondary-action compact-action btn-duplicate', onclick: async () => {
              try {
                await salvarAnotacao({ titulo: `${nota.titulo} (cópia)`, conteudo: nota.conteudo, favorita: false });
                await renderAnotacoes();
                await sincronizarEstadoSeguro();
                toast('Anotação duplicada.');
              } catch (e) { toast(e.message, true); }
            } }, 'Duplicar'),
            el('button', { type: 'button', className: 'secondary-action compact-action btn-export', onclick: () => {
              baixarTexto(nota.conteudo ?? '', `${nomeArquivoSeguro(nota.titulo, 'anotacao')}.txt`);
              toast('Anotação exportada.');
            } }, 'Exportar'),
            el('button', { type: 'button', className: 'open-case-button btn-open', onclick: () => abrirAnotacaoExistente(nota.id).catch((e) => toast(e.message, true)) }, 'Abrir anotação →'),
          ),
        ),
      ),
    );
  }
}


// -----------------------------------------------------------------------------
// Biblioteca de Queries SQL
// -----------------------------------------------------------------------------

function limparQuery() {
  if (!refs.formQuery) return;
  refs.formQuery.reset();
  refs.queryId.value = '';
  refs.queryTags.value = '';
  refs.queryFavorita.checked = false;
  refs.queryNome.focus();
}

function normalizarQueryParaUso(valor) {
  const texto = String(valor ?? '');
  if (!texto.includes('\n') && texto.includes('\\n')) {
    return texto.replace(/\\r\\n|\\n|\\r/g, '\n');
  }
  return texto;
}

function tagsDoCampoQuery() {
  return [...new Set(String(refs.queryTags?.value ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12))];
}

function preencherQueryFormulario(q) {
  const queryUso = normalizarQueryParaUso(q.query);
  refs.queryId.value = q.id;
  refs.queryNome.value = q.nome;
  refs.queryDescricao.value = q.descricao ?? '';
  refs.queryTags.value = (q.tags ?? []).join(', ');
  refs.queryFavorita.checked = q.favorita === true;
  refs.queryTexto.value = queryUso;
  refs.queryNome.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function renderQueries() {
  if (!refs.listaQueries) return;
  const queries = await listarQueriesSql();
  const termo = normalizarBusca(refs.filtroQueries?.value);
  const filtradas = queries.filter((q) => {
    if (!termo) return true;
    return normalizarBusca([q.nome, q.descricao, q.query, ...(q.tags ?? [])].join(' ')).includes(termo);
  });
  refs.listaQueries.replaceChildren();
  if (refs.contadorQueries) refs.contadorQueries.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'query' : 'queries'}`;
  if (!filtradas.length) {
    refs.listaQueries.append(
      el('div', { className: 'vazio' },
        el('strong', {}, termo ? 'Nenhuma query encontrada.' : 'Nenhuma query salva.'),
        el('p', {}, termo ? 'Tente pesquisar por outro nome, descrição, trecho SQL ou tag.' : 'Cadastre consultas SQL Server usadas em tratativas recorrentes para reutilizar com segurança.'),
      ),
    );
    return;
  }

  for (const q of filtradas) {
    const queryUso = normalizarQueryParaUso(q.query);
    const pre = el('pre', { className: 'query-code' }, el('code', {}, queryUso));
    const tags = el('div', { className: 'query-tags' }, ...(q.tags ?? []).map((tag) => el('span', { className: 'query-tag' }, tag)));
    refs.listaQueries.append(
      el('article', { className: `query-card${q.favorita === true ? ' is-favorite' : ''}` },
        el('div', { className: 'query-card-header' },
          el('div', {},
            el('div', { className: 'query-title-line' },
              el('h3', {}, q.nome),
              el('button', {
                type: 'button',
                className: `favorite-button favorite-button-card${q.favorita === true ? ' ativo' : ''}`,
                title: q.favorita === true ? 'Remover query dos favoritos' : 'Favoritar query',
                'aria-label': q.favorita === true ? 'Remover query dos favoritos' : 'Favoritar query',
                onclick: async () => {
                  try {
                    await definirQueryFavorita(q.id, q.favorita !== true);
                    await Promise.all([renderQueries(), renderFavoritosPainel()]);
                    await sincronizarEstadoSeguro();
                    toast(q.favorita === true ? 'Query removida dos favoritos.' : 'Query adicionada aos favoritos.');
                  } catch (e) { toast(e.message, true); }
                },
              }, q.favorita === true ? '★' : '☆'),
            ),
            q.descricao ? el('p', {}, q.descricao) : null,
            (q.tags ?? []).length ? tags : null,
          ),
          el('span', { className: 'query-date' }, `Atualizada em ${formatarDataHora(q.atualizadoEm)}`),
        ),
        pre,
        el('div', { className: 'query-actions' },
          el('button', {
            type: 'button',
            className: 'secondary-action compact-action btn-copy',
            onclick: async () => {
              try { await navigator.clipboard.writeText(queryUso); toast('Query copiada.'); }
              catch { toast('Não foi possível copiar a query.', true); }
            },
          }, 'Copiar query'),
          el('button', { type: 'button', className: 'secondary-action compact-action btn-edit', onclick: () => preencherQueryFormulario(q) }, 'Editar'),
          el('button', {
            type: 'button', className: 'secondary-action compact-action btn-duplicate', onclick: async () => {
              try {
                await salvarQuerySql({ nome: `${q.nome} (cópia)`, descricao: q.descricao, query: q.query, tags: q.tags, favorita: false });
                await renderQueries();
                await sincronizarEstadoSeguro();
                toast('Query duplicada.');
              } catch (e) { toast(e.message, true); }
            },
          }, 'Duplicar'),
          el('button', {
            type: 'button', className: 'secondary-action compact-action btn-export', onclick: () => {
              baixarTexto(queryUso, `${nomeArquivoSeguro(q.nome, 'query')}.sql`, 'text/sql;charset=utf-8');
              toast('Arquivo SQL preparado para download.');
            },
          }, 'Exportar .sql'),
          el('button', {
            type: 'button',
            className: 'danger-action compact-action',
            onclick: async () => {
              if (!confirm(`Mover a query "${q.nome}" para a Lixeira por 7 dias?`)) return;
              await excluirQuerySql(q.id);
              await Promise.all([renderQueries(), renderFavoritosPainel()]);
              await sincronizarEstadoSeguro();
              toast('Query movida para a Lixeira.');
            },
          }, 'Lixeira'),
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Favoritos, pesquisa global e lixeira
// -----------------------------------------------------------------------------

function criarCardFavorito(tipo, item) {
  const mapaTipo = { macro: 'Macro', anotacao: 'Anotação', query: 'Query SQL' };
  const titulo = tipo === 'macro' ? item.nome : item.titulo ?? item.nome;
  const preview = tipo === 'macro' ? item.conteudo : tipo === 'anotacao' ? item.conteudo : item.descricao || item.query;
  const copiar = tipo === 'macro' ? item.conteudo : tipo === 'anotacao' ? item.conteudo : normalizarQueryParaUso(item.query);
  return el('article', { className: 'favorite-hub-card' },
    el('div', { className: 'favorite-hub-top' },
      el('span', { className: 'favorite-hub-type' }, `★ ${mapaTipo[tipo]}`),
      el('span', { className: 'favorite-hub-date' }, item.atualizadoEm ? formatarDataHora(item.atualizadoEm) : ''),
    ),
    el('h3', {}, titulo),
    el('p', {}, String(preview ?? '').trim().slice(0, 150) || 'Sem conteúdo de pré-visualização.'),
    el('div', { className: 'favorite-hub-actions' },
      el('button', { type: 'button', className: 'secondary-action compact-action', onclick: async () => {
        try { await navigator.clipboard.writeText(String(copiar ?? '')); toast(`${mapaTipo[tipo]} copiada.`); }
        catch { toast('Não foi possível copiar o conteúdo.', true); }
      } }, tipo === 'query' ? 'Copiar SQL' : 'Copiar'),
      el('button', { type: 'button', className: 'open-case-button', onclick: async () => {
        if (tipo === 'macro') abrirMacroExistente(item);
        else if (tipo === 'anotacao') await abrirAnotacaoExistente(item.id);
        else {
          await selecionarView('queries');
          preencherQueryFormulario(item);
        }
      } }, 'Abrir →'),
    ),
  );
}

async function renderFavoritosPainel() {
  if (!refs.listaFavoritos) return;
  const [macros, anotacoes, queries] = await Promise.all([listarModelos(), listarAnotacoes(), listarQueriesSql()]);
  const itens = [
    ...macros.filter((x) => x.favorita === true).map((item) => ({ tipo: 'macro', item })),
    ...anotacoes.filter((x) => x.favorita === true).map((item) => ({ tipo: 'anotacao', item })),
    ...queries.filter((x) => x.favorita === true).map((item) => ({ tipo: 'query', item })),
  ].sort((a, b) => String(b.item.atualizadoEm ?? '').localeCompare(String(a.item.atualizadoEm ?? '')));
  refs.contadorFavoritos.textContent = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
  refs.listaFavoritos.replaceChildren();
  if (!itens.length) {
    refs.listaFavoritos.append(el('div', { className: 'favorites-empty' }, 'Favorite macros, anotações ou queries para acessá-las rapidamente por aqui.'));
    return;
  }
  for (const { tipo, item } of itens.slice(0, 9)) refs.listaFavoritos.append(criarCardFavorito(tipo, item));
}

function abrirPesquisaGlobal() {
  refs.dlgPesquisaGlobal.showModal();
  refs.pesquisaGlobal.value = '';
  refs.resultadosPesquisaGlobal.replaceChildren(el('div', { className: 'global-search-empty' }, 'Pesquise por protocolo, título, conteúdo, descrição ou trecho SQL.'));
  window.setTimeout(() => refs.pesquisaGlobal.focus(), 0);
}

function criarGrupoPesquisaGlobal(titulo, resultados, tipo) {
  if (!resultados.length) return null;
  const lista = el('div', { className: 'global-search-group-list' });
  for (const item of resultados.slice(0, 6)) {
    const nome = tipo === 'case' ? `${item.protocolo} — ${item.titulo}` : tipo === 'macro' ? item.nome : item.titulo ?? item.nome;
    const detalhe = tipo === 'case' ? `${item.situacao} • ${item.prioridade}` : tipo === 'query' ? (item.descricao || item.query) : item.conteudo;
    lista.append(el('button', { type: 'button', className: 'global-search-result', onclick: async () => {
      refs.dlgPesquisaGlobal.close();
      if (tipo === 'case') await abrirCase(item.id);
      else if (tipo === 'macro') abrirMacroExistente(item);
      else if (tipo === 'anotacao') await abrirAnotacaoExistente(item.id);
      else {
        await selecionarView('queries');
        preencherQueryFormulario(item);
      }
    } },
    el('strong', {}, nome),
    el('span', {}, String(detalhe ?? '').replace(/\s+/g, ' ').slice(0, 135)),
    ));
  }
  return el('section', { className: 'global-search-group' }, el('h3', {}, titulo), lista);
}

async function executarPesquisaGlobal() {
  const termo = normalizarBusca(refs.pesquisaGlobal.value);
  refs.resultadosPesquisaGlobal.replaceChildren();
  if (termo.length < 2) {
    refs.resultadosPesquisaGlobal.append(el('div', { className: 'global-search-empty' }, 'Digite ao menos 2 caracteres para pesquisar.'));
    return;
  }
  const [cases, macros, anotacoes, queries] = await Promise.all([listarCases(), listarModelos(), listarAnotacoes(), listarQueriesSql()]);
  const filtrar = (lista, campos) => lista.filter((item) => normalizarBusca(campos(item).join(' ')).includes(termo));
  const grupos = [
    criarGrupoPesquisaGlobal('Cases', filtrar(cases, (c) => [c.protocolo, c.titulo, c.resumo, c.mensagem, c.observacoes]), 'case'),
    criarGrupoPesquisaGlobal('Macros', filtrar(macros, (m) => [m.nome, m.conteudo]), 'macro'),
    criarGrupoPesquisaGlobal('Anotações', filtrar(anotacoes, (a) => [a.titulo, a.conteudo, ...(a.palavrasChave ?? [])]), 'anotacao'),
    criarGrupoPesquisaGlobal('Queries SQL', filtrar(queries, (q) => [q.nome, q.descricao, q.query, ...(q.tags ?? [])]), 'query'),
  ].filter(Boolean);
  if (!grupos.length) refs.resultadosPesquisaGlobal.append(el('div', { className: 'global-search-empty' }, 'Nenhum resultado encontrado.'));
  else refs.resultadosPesquisaGlobal.append(...grupos);
}

function diasRestantesLixeira(excluidoEm) {
  const data = Date.parse(excluidoEm ?? '');
  if (!Number.isFinite(data)) return 7;
  const decorrido = Math.floor((Date.now() - data) / 86_400_000);
  return Math.max(0, 7 - decorrido);
}

async function renderLixeira() {
  if (!refs.listaLixeira) return;
  const itens = await listarItensLixeira();
  refs.contadorLixeira.textContent = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
  refs.listaLixeira.replaceChildren();
  if (!itens.length) {
    refs.listaLixeira.append(el('div', { className: 'vazio' }, el('strong', {}, 'A Lixeira está vazia.'), el('p', {}, 'Itens excluídos de Cases, Macros, Anotações e Queries permanecem aqui por 7 dias.')));
    return;
  }
  const nomes = { case: 'Case', macro: 'Macro', anotacao: 'Anotação', query: 'Query SQL' };
  for (const item of itens) {
    const dias = diasRestantesLixeira(item.excluidoEm);
    refs.listaLixeira.append(el('article', { className: 'trash-card' },
      el('div', { className: 'trash-card-top' },
        el('span', { className: 'badge trash-type-badge' }, nomes[item.tipo] ?? item.tipo),
        el('span', { className: 'trash-date' }, `Excluído em ${formatarDataHora(item.excluidoEm)}`),
      ),
      el('h3', {}, item.titulo),
      el('p', { className: 'trash-retention' }, dias > 0 ? `Remoção automática em ${dias} dia(s).` : 'Aguardando remoção automática.'),
      el('div', { className: 'trash-actions' },
        el('button', { type: 'button', className: 'secondary-action compact-action', onclick: async () => {
          try {
            const restaurado = await restaurarItemLixeira(item.tipo, item.id);
            notificarAlteracaoEntidade(item.tipo === 'anotacao' ? 'anotacao' : item.tipo, item.id, restaurado?.atualizadoEm);
            await Promise.all([renderLixeira(), renderFavoritosPainel(), atualizarResumo()]);
            await sincronizarEstadoSeguro();
            toast('Item restaurado.');
          } catch (e) { toast(e.message, true); }
        } }, 'Restaurar'),
        el('button', { type: 'button', className: 'danger-action compact-action', onclick: async () => {
          if (!confirm(`Excluir definitivamente "${item.titulo}"? Esta ação não poderá ser desfeita.`)) return;
          try {
            await excluirItemLixeiraDefinitivamente(item.tipo, item.id);
            notificarAlteracaoEntidade(item.tipo === 'anotacao' ? 'anotacao' : item.tipo, item.id);
            await renderLixeira();
            await sincronizarEstadoSeguro();
            toast('Item excluído definitivamente.');
          } catch (e) { toast(e.message, true); }
        } }, 'Excluir definitivamente'),
      ),
    ));
  }
}


// -----------------------------------------------------------------------------
// Backups, armazenamento e autoteste
// -----------------------------------------------------------------------------

function formatarBytes(bytes) {
  const valor = Number(bytes ?? 0);
  if (!Number.isFinite(valor) || valor <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const indice = Math.min(unidades.length - 1, Math.floor(Math.log(valor) / Math.log(1024)));
  const numero = valor / (1024 ** indice);
  return `${numero.toLocaleString('pt-BR', { maximumFractionDigits: indice === 0 ? 0 : 1 })} ${unidades[indice]}`;
}

async function atualizarStatusAgente() {
  if (!refs.statusAgenteSegundoPlano) return null;
  try {
    const status = await obterStatusAgenteLocal();
    if (!status) {
      refs.statusAgenteSegundoPlano.textContent = 'Indisponível. Inicie o Case Tracker pelo atalho local para usar alertas com as abas fechadas.';
      if (refs.btnTestarAgente) refs.btnTestarAgente.disabled = true;
      return null;
    }
    if (refs.btnTestarAgente) refs.btnTestarAgente.disabled = status.ativo !== true;
    const sync = status.ultimaSincronizacao ? formatarDataHora(status.ultimaSincronizacao) : 'ainda não sincronizado';
    refs.statusAgenteSegundoPlano.textContent = status.ativo
      ? `Ativo. Verifica os lembretes a cada ${Number(status.intervaloSegundos ?? 60)} segundos e continua funcionando com as guias do navegador fechadas. Estado local: ${sync}.`
      : 'O servidor local está ativo, mas o recurso de alerta do Windows não pôde ser inicializado. Enquanto a página estiver aberta, os alertas continuam pelo navegador.';
    return status;
  } catch (erro) {
    refs.statusAgenteSegundoPlano.textContent = 'Não foi possível consultar o agente em segundo plano.';
    if (refs.btnTestarAgente) refs.btnTestarAgente.disabled = true;
    return null;
  }
}

async function atualizarStatusArmazenamento() {
  if (!refs.statusArmazenamento) return null;
  const anexos = await obterResumoAnexosLocais();
  let estimativa = null;
  try { estimativa = await navigator.storage?.estimate?.(); } catch { estimativa = null; }
  const uso = Number(estimativa?.usage ?? 0);
  const quota = Number(estimativa?.quota ?? 0);
  const quotaTexto = quota > 0 ? ` • armazenamento do navegador: ${formatarBytes(uso)} de ${formatarBytes(quota)}` : '';
  refs.statusArmazenamento.textContent = `${anexos.quantidade} anexo(s), ${formatarBytes(anexos.totalBytes)} em imagens/PDFs${quotaTexto}.`;
  return { ...anexos, uso, quota };
}

async function executarAutoteste() {
  if (!refs.resultadoAutoteste) return;
  refs.btnAutoteste.disabled = true;
  refs.resultadoAutoteste.replaceChildren(el('span', { className: 'diagnostic-running' }, 'Executando verificações...'));
  const resultados = [];
  try {
    const d = await diagnosticoLocal();
    resultados.push(['IndexedDB', d.indexedDBDisponivel, d.indexedDBDisponivel ? 'Banco local acessível' : 'Banco local indisponível']);
  } catch (e) { resultados.push(['IndexedDB', false, e.message]); }
  try {
    const chave = `case-tracker-test-${Date.now()}`;
    localStorage.setItem(chave, 'ok');
    const ok = localStorage.getItem(chave) === 'ok';
    localStorage.removeItem(chave);
    resultados.push(['Rascunhos locais', ok, ok ? 'localStorage disponível' : 'Falha de leitura']);
  } catch (e) { resultados.push(['Rascunhos locais', false, e.message]); }
  resultados.push(['Sincronização entre abas', 'BroadcastChannel' in window, 'BroadcastChannel' in window ? 'Recurso disponível' : 'Recurso não suportado']);
  resultados.push(['Notificações', 'Notification' in window, 'Notification' in window ? `Permissão: ${Notification.permission}` : 'API indisponível']);
  try {
    if ('serviceWorker' in navigator) {
      const registro = await navigator.serviceWorker.getRegistration();
      resultados.push(['Service Worker', true, registro ? 'Registrado' : 'Disponível, ainda não registrado']);
    } else {
      resultados.push(['Service Worker', false, 'Indisponível']);
    }
  } catch (e) {
    resultados.push(['Service Worker', false, e.message || 'Falha ao consultar registro']);
  }
  if (ambienteLocalControlavel()) {
    try {
      const resposta = await fetch(`/__session?teste=${Date.now()}`, { cache: 'no-store' });
      resultados.push(['Servidor local', resposta.ok, resposta.ok ? 'localhost:8765 respondendo' : `HTTP ${resposta.status}`]);
    } catch (e) { resultados.push(['Servidor local', false, e.message]); }
  } else resultados.push(['Servidor local', false, 'Aplicação não foi aberta pelo localhost']);

  try {
    const agente = await obterStatusAgenteLocal();
    resultados.push(['Agente em segundo plano', agente?.ativo === true, agente?.ativo ? 'Alertas do Windows disponíveis' : 'Agente de alerta indisponível']);
  } catch (e) { resultados.push(['Agente em segundo plano', false, e.message]); }
  try {
    const storage = await obterResumoAnexosLocais();
    resultados.push(['Armazenamento de anexos', true, `${storage.quantidade} arquivo(s) • ${formatarBytes(storage.totalBytes)}`]);
  } catch (e) { resultados.push(['Armazenamento de anexos', false, e.message]); }

  refs.resultadoAutoteste.replaceChildren(...resultados.map(([nome, ok, detalhe]) =>
    el('div', { className: `diagnostic-result ${ok ? 'ok' : 'fail'}` },
      el('span', { className: 'diagnostic-result-mark' }, ok ? '✓' : '!'),
      el('div', {}, el('strong', {}, nome), el('span', {}, detalhe)),
    )));
  refs.btnAutoteste.disabled = false;
}

async function atualizarStatusBackups() {
  if (!refs.backupAutomaticoStatus || !refs.backupMacrosStatus || !refs.backupAnotacoesStatus) return;
  try {
    const status = await obterStatusBackupsLocais();
    if (!status) {
      const indisponivel = 'Disponível quando o Case Tracker é iniciado pelo atalho local.';
      refs.backupAutomaticoStatus.textContent = indisponivel;
      refs.backupMacrosStatus.textContent = indisponivel;
      refs.backupAnotacoesStatus.textContent = indisponivel;
      if (refs.backupAnexosStatus) refs.backupAnexosStatus.textContent = indisponivel;
      if (refs.backupManualStatus) refs.backupManualStatus.textContent = indisponivel;
      return;
    }

    refs.backupAutomaticoStatus.textContent = status.ultimoAutomatico
      ? `Último backup automático: ${formatarDataHora(status.ultimoAutomatico)}. O arquivo anterior é substituído a cada 48 horas.`
      : 'Aguardando o primeiro backup automático. O processo local mantém somente o arquivo automático mais recente.';

    if (status.ultimoMacros) {
      const pendentes = Number(status.macrosAlteracoesPendentes ?? 0);
      const proxima = status.proximaAtualizacaoMacros ? formatarDataHora(status.proximaAtualizacaoMacros) : null;
      refs.backupMacrosStatus.textContent = pendentes > 0
        ? `Histórico de macros atualizado em ${formatarDataHora(status.ultimoMacros)}. ${pendentes} alteração(ões) pendente(s) serão acrescentadas ao arquivo separado de macros${proxima ? ` em ${proxima}` : ' no próximo ciclo de 5 dias'}, sem apagar o histórico anterior.`
        : `Histórico de macros atualizado em ${formatarDataHora(status.ultimoMacros)}. O arquivo Backups\\Macros\\macros-historico.json é mantido e recebe novas alterações a cada ciclo de 5 dias.`;
    } else {
      refs.backupMacrosStatus.textContent = 'O histórico acumulativo de macros será criado separadamente em Backups\\Macros\\macros-historico.json.';
    }

    if (status.ultimoAnotacoes) {
      const pendentes = Number(status.anotacoesAlteracoesPendentes ?? 0);
      const proxima = status.proximaAtualizacaoAnotacoes ? formatarDataHora(status.proximaAtualizacaoAnotacoes) : null;
      refs.backupAnotacoesStatus.textContent = pendentes > 0
        ? `Histórico de anotações atualizado em ${formatarDataHora(status.ultimoAnotacoes)}. ${pendentes} alteração(ões) pendente(s) serão acrescentadas ao arquivo separado de anotações${proxima ? ` em ${proxima}` : ' no próximo ciclo de 5 dias'}, sem apagar o histórico anterior.`
        : `Histórico de anotações atualizado em ${formatarDataHora(status.ultimoAnotacoes)}. O arquivo Backups\\Anotacoes\\anotacoes-historico.json é mantido e recebe novas alterações a cada ciclo de 5 dias.`;
    } else {
      refs.backupAnotacoesStatus.textContent = 'O histórico acumulativo de anotações será criado separadamente em Backups\\Anotacoes\\anotacoes-historico.json.';
    }

    if (refs.backupManualStatus) {
      refs.backupManualStatus.textContent = `${Number(status.backupsManuais ?? 0)} backup(s) manual(is) armazenado(s). Retenção automática: ${Number(status.retencaoManuaisDias ?? 30)} dias.`;
    }

    if (refs.backupAnexosStatus) {
      const local = await obterResumoAnexosLocais();
      const ultimo = status.ultimoBackupAnexos ? `Último backup: ${formatarDataHora(status.ultimoBackupAnexos)} com ${Number(status.anexosBackupQuantidade ?? 0)} arquivo(s).` : 'Nenhum backup separado de anexos foi criado ainda.';
      const copias = `${Number(status.backupsAnexosCopias ?? 0)}/${Number(status.backupsAnexosMaxCopias ?? 3)} cópia(s) de backup armazenada(s).`;
      refs.backupAnexosStatus.textContent = `${local.quantidade} anexo(s) local(is), ${formatarBytes(local.totalBytes)}. ${ultimo} ${copias}`;
    }
  } catch (erro) {
    refs.backupAutomaticoStatus.textContent = 'Não foi possível consultar o status dos backups automáticos.';
    refs.backupMacrosStatus.textContent = 'Não foi possível consultar o status do backup de macros.';
    refs.backupAnotacoesStatus.textContent = 'Não foi possível consultar o status do backup de anotações.';
    if (refs.backupAnexosStatus) refs.backupAnexosStatus.textContent = 'Não foi possível consultar o status do backup de anexos.';
    if (refs.backupManualStatus) refs.backupManualStatus.textContent = 'Não foi possível consultar a retenção dos backups manuais.';
  }
}

async function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registro = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      await registro.update();
    } catch (e) {
      console.warn('Service Worker não registrado:', e);
    }
  }
}

async function tratarPermissaoNotificacao() {
  const status = obterStatusNotificacao();
  const acao = status === 'denied' ? 'ajuda' : refs.btnAtivarNotificacoesBanner.dataset.acao || 'solicitar';
  if (acao === 'ajuda') {
    toast(instrucoesNotificacaoBloqueada(), true);
    return;
  }

  try {
    const p = await solicitarPermissaoNotificacao();
    if (p === 'denied') toast(instrucoesNotificacaoBloqueada(), true);
    else if (p === 'granted') toast('Notificações ativadas com sucesso.');
    else toast('A permissão de notificações não foi concedida.');
    await atualizarTudo();
  } catch (e) {
    toast(e.message, true);
  }
}

function fecharSidebarMobile() {
  refs.sidebar.classList.remove('aberta');
  refs.btnMenu.setAttribute('aria-expanded', 'false');
}

async function selecionarView(view, { resetarFiltros = true } = {}) {
  if (!VIEW_META[view]) return;
  viewAtual = view;
  const meta = VIEW_META[view];
  refs.pageTitle.textContent = meta.title;
  refs.pageSubtitle.textContent = meta.subtitle;

  const principal = ['painel', 'cases', 'lembretes', 'gmud', 'historico'].includes(view);
  refs.viewPrincipal.hidden = !principal;
  refs.viewBackup.hidden = view !== 'backup';
  if (refs.viewQueries) refs.viewQueries.hidden = view !== 'queries';
  if (refs.viewRascunhos) refs.viewRascunhos.hidden = view !== 'rascunhos';
  if (refs.viewMacros) refs.viewMacros.hidden = view !== 'macros';
  if (refs.viewAnotacoes) refs.viewAnotacoes.hidden = view !== 'anotacoes';
  if (refs.viewLixeira) refs.viewLixeira.hidden = view !== 'lixeira';
  refs.viewConfiguracoes.hidden = view !== 'configuracoes';
  if (!principal && refs.painelFavoritos) refs.painelFavoritos.hidden = true;

  document.querySelectorAll('.nav-item[data-view]').forEach((botao) => {
    const ativo = botao.dataset.view === view;
    botao.classList.toggle('ativo', ativo);
    if (ativo) botao.setAttribute('aria-current', 'page');
    else botao.removeAttribute('aria-current');
  });

  if (principal) {
    refs.cardsResumo.hidden = view !== 'painel';
    if (refs.painelFavoritos) refs.painelFavoritos.hidden = view !== 'painel';
    if (refs.toolbarFiltros) refs.toolbarFiltros.hidden = view === 'historico';
    refs.listaEyebrow.textContent = meta.eyebrow;
    refs.listaTitulo.textContent = meta.listTitle;
    refs.filtroTexto.placeholder = view === 'lembretes' ? 'Pesquisar case por protocolo ou título' : 'Pesquisar protocolo ou título';

    refs.filtroSituacao.disabled = false;
    refs.filtroEstado.disabled = false;
    refs.filtroVencimento.disabled = false;

    if (resetarFiltros) {
      refs.filtroTexto.value = '';
      refs.filtroSituacao.value = '';
      refs.filtroPrioridade.value = '';
      refs.filtroVencimento.value = 'todos';
      refs.filtroEstado.value = view === 'cases' ? 'todos' : 'ativos';
    }

    if (view === 'gmud') {
      refs.filtroSituacao.value = 'Aguardando GMUD';
      refs.filtroSituacao.disabled = true;
      refs.filtroEstado.value = 'ativos';
      refs.filtroEstado.disabled = true;
    }

    if (view === 'historico') {
      refs.filtroTexto.value = '';
      refs.filtroSituacao.value = '';
      refs.filtroPrioridade.value = '';
      refs.filtroEstado.value = 'finalizados';
      refs.filtroVencimento.value = 'todos';
    }

    await renderConteudoPrincipal();
  }

  if (view === 'painel') await renderFavoritosPainel();
  if (view === 'rascunhos') await renderRascunhos();
  if (view === 'macros') await renderModelos();
  if (view === 'anotacoes') await renderAnotacoes();
  if (view === 'queries') await renderQueries();
  if (view === 'lixeira') await renderLixeira();
  if (view === 'backup') await atualizarStatusBackups();
  if (view === 'configuracoes') {
    await atualizarDiagnostico();
    await Promise.all([atualizarStatusAgente(), atualizarStatusArmazenamento()]);
    atualizarAlertaNotificacao();
  }

  fecharSidebarMobile();
}


// -----------------------------------------------------------------------------
// Encerramento controlado do servidor e recursos do navegador
// -----------------------------------------------------------------------------

function ambienteLocalControlavel() {
  return location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname);
}

function aguardar(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function servidorLocalRespondendo(timeoutMs = 700) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resposta = await fetch(`/__case_tracker_ping?ts=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    return resposta.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function aguardarServidorParar() {
  for (let tentativa = 0; tentativa < 12; tentativa += 1) {
    if (!(await servidorLocalRespondendo(500))) return true;
    await aguardar(180);
  }
  return false;
}

function pararAtividadesPagina() {
  try { pararMotorLembretes?.(); } catch { /* sem ação */ }
  pararMotorLembretes = null;
  if (intervaloLimpezaAutomatica) window.clearInterval(intervaloLimpezaAutomatica);
  intervaloLimpezaAutomatica = null;
  clearTimeout(timerRascunhoCase);
  clearTimeout(timerRascunhoAnotacao);
  timerRascunhoCase = null;
  timerRascunhoAnotacao = null;
  try { canalEntidades?.close(); } catch { /* sem ação */ }
  limparUrlsTemporarias();
}

async function finalizarRecursosDoNavegador() {
  pararAtividadesPagina();
  // O Service Worker não possui agenda própria, mas é desregistrado no encerramento
  // para que a sessão seja realmente finalizada e a próxima abertura venha do servidor local.
  try {
    if ('serviceWorker' in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((registro) => registro.unregister()));
    }
  } catch { /* não bloqueia o encerramento */ }
  // Remove somente caches estáticos do app; IndexedDB/localStorage permanecem intactos.
  try {
    if ('caches' in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((nome) => nome.startsWith('acompanhamento-cases-')).map((nome) => caches.delete(nome)));
    }
  } catch { /* não bloqueia o encerramento */ }
}

function mostrarTelaEncerrado({ servidorJaEstavaParado = false } = {}) {
  document.title = 'Case Tracker encerrado';
  document.body.className = 'shutdown-body';
  const descricao = servidorJaEstavaParado
    ? 'O servidor local já estava encerrado. A sessão desta guia também foi finalizada e nenhuma rotina do Case Tracker continuará sendo executada nesta página.'
    : 'O servidor local, o agente de lembretes em segundo plano e as rotinas desta página foram encerrados com segurança. Seus dados já salvos permanecem armazenados no navegador.';
  const caixa = el('main', { className: 'shutdown-screen', role: 'status', 'aria-live': 'polite' },
    el('div', { className: 'shutdown-mark', 'aria-hidden': 'true' }, '✓'),
    el('p', { className: 'shutdown-eyebrow' }, 'Aplicação finalizada'),
    el('h1', {}, 'Case Tracker encerrado'),
    el('p', { className: 'shutdown-description' }, descricao),
    el('div', { className: 'shutdown-instructions' },
      el('strong', {}, 'Para iniciar o sistema novamente:'),
      el('ol', {},
        el('li', {}, 'Feche esta guia do navegador.'),
        el('li', {}, 'Abra novamente o Case Tracker pelo atalho do sistema.'),
      ),
    ),
    el('p', { className: 'shutdown-hint' }, 'Esta guia não mantém servidor, notificações ou ciclos de manutenção ativos depois do encerramento.'),
  );
  document.body.replaceChildren(caixa);
}

async function encerrarAplicativo() {
  if (!ambienteLocalControlavel()) {
    toast('Para encerrar o servidor pelo sistema, abra o Case Tracker pelo atalho ou pelo inicializador local.', true);
    return;
  }
  if (encerrandoAplicacao) return;

  if (!confirm('Encerrar completamente o Case Tracker agora? O servidor local, o agente de lembretes e as rotinas desta página serão finalizados. Os dados já salvos serão preservados.')) return;

  encerrandoAplicacao = true;
  refs.btnEncerrarApp.disabled = true;

  try {
    // Se o servidor já tiver sido encerrado externamente (ou a pasta local tiver sido removida),
    // não exibe "Failed to fetch": encerra também esta guia de forma limpa.
    if (!(await servidorLocalRespondendo())) {
      await finalizarRecursosDoNavegador();
      mostrarTelaEncerrado({ servidorJaEstavaParado: true });
      return;
    }

    let token = null;
    try {
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const sessaoResposta = await fetch(`/__session?nonce=${encodeURIComponent(nonce)}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (sessaoResposta.ok) {
        const sessao = await sessaoResposta.json();
        token = sessao?.token ?? null;
      }
    } catch {
      // A confirmação abaixo verifica se o servidor realmente parou.
    }

    let respostaEncerramento = null;
    let erroFetch = null;
    if (token) {
      try {
        respostaEncerramento = await fetch(`/__encerrar?nonce=${encodeURIComponent(`${Date.now()}-${Math.random().toString(36).slice(2)}`)}`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            'X-Case-Tracker-Token': token,
          },
        });
      } catch (erro) {
        erroFetch = erro;
      }
    }

    // O processo pode encerrar imediatamente depois de enviar a resposta. Nesse caso o navegador
    // pode registrar erro de rede mesmo tendo funcionado; a fonte da verdade passa a ser a porta.
    const servidorParou = await aguardarServidorParar();
    if (servidorParou) {
      await finalizarRecursosDoNavegador();
      mostrarTelaEncerrado();
      return;
    }

    if (!token) throw new Error('não foi possível validar a sessão do servidor local');
    if (respostaEncerramento && !respostaEncerramento.ok) throw new Error(`servidor recusou o encerramento (HTTP ${respostaEncerramento.status})`);
    if (erroFetch) throw new Error('o servidor continua ativo após a tentativa de encerramento');
    throw new Error('o servidor local não confirmou o encerramento');
  } catch (erro) {
    encerrandoAplicacao = false;
    refs.btnEncerrarApp.disabled = false;
    toast(`Não foi possível encerrar completamente: ${erro.message}.`, true);
  }
}

// -----------------------------------------------------------------------------
// Binding de eventos e inicialização
// -----------------------------------------------------------------------------

function vincularEventos() {
  $('btnNovo').addEventListener('click', () => abrirNovoCase().catch((e) => toast(e.message, true)));
  refs.btnPesquisaGlobal?.addEventListener('click', abrirPesquisaGlobal);
  refs.btnFecharPesquisaGlobal?.addEventListener('click', () => refs.dlgPesquisaGlobal.close());
  refs.pesquisaGlobal?.addEventListener('input', () => executarPesquisaGlobal().catch((e) => toast(e.message, true)));
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLocaleLowerCase('pt-BR') === 'k') {
      ev.preventDefault();
      if (!refs.dlgPesquisaGlobal.open) abrirPesquisaGlobal();
    }
  });
  refs.metricAtrasados?.addEventListener('click', () => (async () => {
    await selecionarView('lembretes');
    refs.filtroVencimento.value = 'atrasados';
    await renderConteudoPrincipal();
  })().catch((e) => toast(e.message, true)));
  refs.metricHoje?.addEventListener('click', () => (async () => {
    await selecionarView('lembretes');
    refs.filtroVencimento.value = 'hoje';
    await renderConteudoPrincipal();
  })().catch((e) => toast(e.message, true)));
  refs.metricPrioritarios?.addEventListener('click', () => (async () => {
    await selecionarView('cases');
    refs.filtroPrioridade.value = '__prioritarios__';
    await renderConteudoPrincipal();
  })().catch((e) => toast(e.message, true)));
  refs.metricAtivos?.addEventListener('click', () => (async () => {
    await selecionarView('cases');
    refs.filtroEstado.value = 'ativos';
    await renderConteudoPrincipal();
  })().catch((e) => toast(e.message, true)));
  refs.btnAutoteste?.addEventListener('click', () => executarAutoteste().catch((e) => toast(e.message, true)));
  window.addEventListener('beforeunload', () => {
    if (refs.dlgCase?.open) salvarRascunhoCaseAgora();
    if (refs.dlgAnotacao?.open) salvarRascunhoAnotacaoAgora();
  });
  refs.btnEncerrarApp?.addEventListener('click', () => encerrarAplicativo());
  $('btnCancelarCase').addEventListener('click', () => { salvarRascunhoCaseAgora(); refs.dlgCase.close(); });
  $('btnFecharCase').addEventListener('click', () => { salvarRascunhoCaseAgora(); refs.dlgCase.close(); });
  refs.dlgCase.addEventListener('cancel', () => salvarRascunhoCaseAgora());
  refs.dlgCase.addEventListener('close', limparUrlsTemporarias);
  refs.dlgAnotacao?.addEventListener('close', limparUrlsTemporarias);
  $('btnFecharModelos').addEventListener('click', () => refs.dlgModelos.close());
  $('btnNovoModelo').addEventListener('click', limparModelo);
  refs.btnNovaMacro?.addEventListener('click', abrirNovaMacro);
  refs.btnCopiarMacroModal?.addEventListener('click', () => copiarTextoMacro(refs.modeloConteudo.value));
  refs.btnFavoritarMacroModal?.addEventListener('click', async () => {
    macroFavoritaState = !macroFavoritaState;
    atualizarBotaoFavorito(refs.btnFavoritarMacroModal, macroFavoritaState, 'macro');
    const id = refs.modeloId.value;
    if (id) {
      try {
        await definirModeloFavorito(id, macroFavoritaState);
        await Promise.all([renderModelos(), renderFavoritosPainel()]);
        await atualizarSelectModelos();
        await sincronizarEstadoSeguro();
        toast(macroFavoritaState ? 'Macro adicionada aos favoritos.' : 'Macro removida dos favoritos.');
      } catch (e) { toast(e.message, true); }
    }
  });
  refs.btnExcluirMacroModal?.addEventListener('click', async () => {
    const id = refs.modeloId.value;
    const nome = refs.modeloNome.value.trim() || 'esta macro';
    if (!id || !confirm(`Mover a macro "${nome}" para a Lixeira? Ela poderá ser restaurada por 7 dias.`)) return;
    try {
      await excluirModelo(id);
      refs.dlgModelos.close();
      limparModelo();
      await Promise.all([renderModelos(), renderFavoritosPainel()]);
      await atualizarSelectModelos();
      await sincronizarEstadoSeguro();
      toast('Macro movida para a Lixeira.');
    } catch (e) {
      toast(e.message, true);
    }
  });
  refs.modeloConteudo?.addEventListener('input', () => {
    if (refs.btnCopiarMacroModal) refs.btnCopiarMacroModal.disabled = !refs.modeloConteudo.value.trim();
  });

  refs.filtroMacros?.addEventListener('input', () => renderModelos().catch((e) => toast(e.message, true)));

  refs.filtroRascunhos?.addEventListener('input', () => renderRascunhos().catch((e) => toast(e.message, true)));
  refs.btnNovaAnotacao?.addEventListener('click', abrirNovaAnotacao);
  refs.anotacaoTitulo?.addEventListener('input', agendarRascunhoAnotacao);
  refs.anotacaoConteudo?.addEventListener('input', agendarRascunhoAnotacao);
  refs.btnFecharAnotacao?.addEventListener('click', () => { salvarRascunhoAnotacaoAgora(); limparUrlsTemporarias(); refs.dlgAnotacao.close(); });
  refs.dlgAnotacao?.addEventListener('cancel', () => salvarRascunhoAnotacaoAgora());
  refs.filtroAnotacoes?.addEventListener('input', () => renderAnotacoes().catch((e) => toast(e.message, true)));
  refs.btnCopiarAnotacao?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(refs.anotacaoConteudo.value); toast('Texto da anotação copiado.'); }
    catch { toast('Não foi possível copiar a anotação.', true); }
  });
  refs.btnFavoritarAnotacaoModal?.addEventListener('click', async () => {
    anotacaoFavoritaState = !anotacaoFavoritaState;
    atualizarBotaoFavorito(refs.btnFavoritarAnotacaoModal, anotacaoFavoritaState, 'anotação');
    agendarRascunhoAnotacao();
    const id = refs.anotacaoId.value;
    if (id) {
      try {
        const atualizada = await definirAnotacaoFavorita(id, anotacaoFavoritaState);
        versaoAnotacaoAberta = atualizada.atualizadoEm ?? versaoAnotacaoAberta;
        notificarAlteracaoEntidade('anotacao', id, versaoAnotacaoAberta);
        await renderAnotacoes();
        await renderFavoritosPainel();
        await sincronizarEstadoSeguro();
        toast(anotacaoFavoritaState ? 'Anotação adicionada aos favoritos.' : 'Anotação removida dos favoritos.');
      } catch (e) { toast(e.message, true); }
    }
  });
  refs.inputAnexosAnotacao?.addEventListener('change', async () => {
    try {
      const files = Array.from(refs.inputAnexosAnotacao.files ?? []);
      refs.inputAnexosAnotacao.value = '';
      const id = refs.anotacaoId.value;
      if (id) {
        await adicionarAnexos('note', id, files, { aceitarPdf: true });
        await renderAnexosAnotacao(id);
        toast('Arquivo(s) adicionado(s) à anotação.');
      } else {
        anotacaoArquivosPendentesState.push(...files);
        await renderAnexosAnotacao(null);
      }
    } catch (e) { toast(e.message, true); }
  });
  refs.anotacaoConteudo?.addEventListener('paste', (ev) => {
    const imagens = Array.from(ev.clipboardData?.files ?? []).filter((file) => String(file.type).startsWith('image/'));
    if (!imagens.length) return;
    const id = refs.anotacaoId.value;
    if (id) {
      adicionarAnexos('note', id, normalizarArquivosClipboard(imagens), { aceitarPdf: true })
        .then(() => renderAnexosAnotacao(id))
        .then(() => toast('Imagem colada na anotação.'))
        .catch((e) => toast(e.message, true));
    } else {
      anotacaoArquivosPendentesState.push(...normalizarArquivosClipboard(imagens));
      renderAnexosAnotacao(null);
    }
  });
  refs.formAnotacao?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const idAnterior = refs.anotacaoId.value || undefined;
      if (idAnterior && !(await verificarConflitoAnotacaoAntesSalvar(idAnterior))) return;
      const id = await salvarAnotacao({
        id: idAnterior,
        titulo: refs.anotacaoTitulo.value,
        conteudo: refs.anotacaoConteudo.value,
        favorita: anotacaoFavoritaState,
      });
      if (!idAnterior && anotacaoArquivosPendentesState.length) {
        await adicionarAnexos('note', id, anotacaoArquivosPendentesState, { aceitarPdf: true });
      }
      removerRascunho(CHAVE_RASCUNHO_ANOTACAO, idAnterior || 'novo');
      const atualizada = await obterAnotacao(id);
      notificarAlteracaoEntidade('anotacao', id, atualizada?.atualizadoEm);
      anotacaoArquivosPendentesState = [];
      limparUrlsTemporarias();
      refs.dlgAnotacao.close();
      await Promise.all([renderAnotacoes(), renderFavoritosPainel()]);
      await sincronizarEstadoSeguro();
      toast('Anotação salva.');
    } catch (e) { toast(e.message, true); }
  });
  refs.btnExcluirAnotacao?.addEventListener('click', async () => {
    const id = refs.anotacaoId.value;
    if (!id || !confirm(`Mover a anotação "${refs.anotacaoTitulo.value.trim()}" para a Lixeira? Os arquivos locais serão preservados durante 7 dias.`)) return;
    try {
      await excluirAnotacao(id);
      removerRascunho(CHAVE_RASCUNHO_ANOTACAO, id);
      notificarAlteracaoEntidade('anotacao', id);
      limparUrlsTemporarias();
      refs.dlgAnotacao.close();
      await Promise.all([renderAnotacoes(), renderFavoritosPainel()]);
      await sincronizarEstadoSeguro();
      toast('Anotação movida para a Lixeira.');
    } catch (e) { toast(e.message, true); }
  });

  refs.btnMenu.addEventListener('click', () => {
    const abriu = refs.sidebar.classList.toggle('aberta');
    refs.btnMenu.setAttribute('aria-expanded', abriu ? 'true' : 'false');
  });

  document.querySelectorAll('.nav-item[data-view]').forEach((botao) => {
    botao.addEventListener('click', () => selecionarView(botao.dataset.view).catch((e) => toast(e.message, true)));
  });

  refs.btnAbrirHorarios.addEventListener('click', () => {
    if (refs.painelHorarios.hidden) abrirPainelHorarios();
    else fecharPainelHorarios();
  });
  refs.btnAdicionarHorario.addEventListener('click', () => {
    try { adicionarHorarioSelecionado(refs.inputNovoHorario.value); }
    catch (e) { toast(e.message, true); }
  });
  refs.inputNovoHorario.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      try { adicionarHorarioSelecionado(refs.inputNovoHorario.value); }
      catch (e) { toast(e.message, true); }
    }
  });
  refs.painelHorarios.addEventListener('click', (ev) => {
    const botao = ev.target.closest('.atalho-horario');
    if (!botao) return;
    try { adicionarHorarioSelecionado(botao.dataset.horario); }
    catch (e) { toast(e.message, true); }
  });
  document.addEventListener('click', (ev) => {
    if (!refs.painelHorarios.hidden && !refs.painelHorarios.contains(ev.target) && !refs.btnAbrirHorarios.contains(ev.target)) {
      fecharPainelHorarios();
    }
    if (window.innerWidth <= 900 && refs.sidebar.classList.contains('aberta') && !refs.sidebar.contains(ev.target) && !refs.btnMenu.contains(ev.target)) {
      fecharSidebarMobile();
    }
  });

  refs.inputImagemComentario?.addEventListener('change', () => {
    try {
      adicionarImagensPendentesComentario(refs.inputImagemComentario.files);
      refs.inputImagemComentario.value = '';
    } catch (e) { toast(e.message, true); }
  });
  refs.comentarioTexto?.addEventListener('paste', (ev) => {
    const imagens = Array.from(ev.clipboardData?.files ?? []).filter((file) => String(file.type).startsWith('image/'));
    if (imagens.length) {
      adicionarImagensPendentesComentario(imagens);
      toast(`${imagens.length} imagem(ns) adicionada(s) ao comentário.`);
    }
  });
  refs.btnAdicionarComentario?.addEventListener('click', () => salvarNovoComentarioCase().catch((e) => toast(e.message, true)));

  for (const campo of [refs.protocolo, refs.titulo, refs.situacao, refs.prioridade, refs.resumo, refs.mensagem, refs.observacoes]) {
    campo?.addEventListener('input', agendarRascunhoCase);
    campo?.addEventListener('change', agendarRascunhoCase);
  }

  refs.formCase.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const caseId = refs.caseId.value || null;
      if (caseId && !(await verificarConflitoCaseAntesSalvar(caseId))) return;
      const dados = dadosCaseDoFormulario();
      const agendas = await agendasDoFormulario(caseId);
      let salvoId = caseId;
      let atualizado = null;
      if (!caseId) {
        salvoId = await criarCase({ ...dados, agendas });
        const completo = await obterCaseCompleto(salvoId);
        atualizado = completo?.case ?? null;
        removerRascunho(CHAVE_RASCUNHO_CASE, 'novo');
        toast('Case cadastrado com sucesso.');
      } else {
        atualizado = await editarCase(caseId, dados);
        await substituirAgendas(caseId, agendas);
        removerRascunho(CHAVE_RASCUNHO_CASE, caseId);
        toast('Case atualizado com sucesso.');
      }
      notificarAlteracaoEntidade('case', salvoId, atualizado?.atualizadoEm);
      refs.dlgCase.close();
      await atualizarTudo();
      await sincronizarEstadoSeguro();
      if (agendas.length > 0 && obterStatusNotificacao() !== 'granted') {
        toast('Case salvo. Ative as notificações para receber os lembretes do Chrome.');
      }
    } catch (e) {
      toast(e.message, true);
    }
  });

  $('btnExcluirCase').addEventListener('click', async () => {
    const id = refs.caseId.value;
    if (!id || !confirm('Mover este case para a Lixeira? Ele poderá ser restaurado por 7 dias.')) return;
    try {
      await moverCaseParaLixeira(id);
      removerRascunho(CHAVE_RASCUNHO_CASE, id);
      notificarAlteracaoEntidade('case', id);
      refs.dlgCase.close();
      toast('Case movido para a Lixeira.');
      await atualizarTudo();
      await sincronizarEstadoSeguro();
    } catch (e) {
      toast(e.message, true);
    }
  });

  $('btnCopiarMensagem').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(refs.mensagem.value);
      toast('Mensagem copiada.');
    } catch {
      toast('Não foi possível copiar. Verifique a permissão da área de transferência.', true);
    }
  });

  $('btnAplicarModelo').addEventListener('click', async () => {
    const id = refs.modeloAplicar.value;
    if (!id) return;
    const modelo = (await listarModelos()).find((m) => m.id === id);
    if (modelo) {
      refs.mensagem.value = modelo.conteudo;
      agendarRascunhoCase();
    }
  });

  refs.formModelo.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await salvarModelo({
        id: refs.modeloId.value || undefined,
        nome: refs.modeloNome.value,
        conteudo: refs.modeloConteudo.value,
        favorita: macroFavoritaState,
      });
      refs.dlgModelos.close();
      limparModelo();
      await Promise.all([renderModelos(), renderFavoritosPainel()]);
      await atualizarSelectModelos();
      await sincronizarEstadoSeguro();
      toast('Macro salva.');
    } catch (e) {
      toast(e.message, true);
    }
  });

  refs.btnNotificacao.addEventListener('click', () => tratarPermissaoNotificacao());
  refs.btnNotificacaoConfig.addEventListener('click', () => tratarPermissaoNotificacao());
  refs.btnAtivarNotificacoesBanner.addEventListener('click', () => tratarPermissaoNotificacao());

  refs.btnTemaClaro?.addEventListener('click', () => aplicarTema('light', { avisar: true }));
  refs.btnTemaEscuro?.addEventListener('click', () => aplicarTema('dark', { avisar: true }));

  refs.btnTestarAgente?.addEventListener('click', async () => {
    refs.btnTestarAgente.disabled = true;
    try {
      await enviarAlertaTesteAgente();
      toast('Alerta de teste enviado pelo agente do Windows.');
      await atualizarStatusAgente();
    } catch (e) {
      toast(e.message, true);
    } finally {
      refs.btnTestarAgente.disabled = false;
    }
  });

  refs.btnLimparAnexosOrfaos?.addEventListener('click', async () => {
    if (!confirm('Remover anexos locais que não possuem mais anotação ou comentário associado?')) return;
    try {
      const removidos = await limparAnexosOrfaos();
      toast(removidos ? `${removidos} anexo(s) órfão(s) removido(s).` : 'Nenhum anexo órfão encontrado.');
      await atualizarStatusArmazenamento();
      await atualizarStatusBackups();
    } catch (e) { toast(e.message, true); }
  });

  refs.btnBackupAnexos?.addEventListener('click', async () => {
    refs.btnBackupAnexos.disabled = true;
    try {
      const resultado = await salvarBackupAnexosSeparado();
      toast(`Backup separado concluído com ${Number(resultado.quantidade ?? 0)} anexo(s).`);
      await atualizarStatusBackups();
    } catch (e) { toast(e.message, true); }
    finally { refs.btnBackupAnexos.disabled = false; }
  });

  refs.btnRestaurarAnexos?.addEventListener('click', async () => {
    if (!confirm('Restaurar os anexos do backup separado mais recente? Arquivos com o mesmo identificador serão atualizados.')) return;
    refs.btnRestaurarAnexos.disabled = true;
    try {
      const resultado = await restaurarUltimoBackupAnexos();
      toast(`Restauração concluída: ${resultado.restaurados} anexo(s) restaurado(s)${resultado.ignorados ? ` e ${resultado.ignorados} ignorado(s)` : ''}.`);
      await Promise.all([atualizarStatusBackups(), atualizarStatusArmazenamento()]);
    } catch (e) { toast(e.message, true); }
    finally { refs.btnRestaurarAnexos.disabled = false; }
  });

  $('btnBackup').addEventListener('click', async () => {
    try {
      const resultado = await exportarBackup();
      toast(resultado.salvoNaPasta ? 'Backup manual salvo na pasta Backups\Manuais.' : 'Backup baixado pelo navegador.');
      await atualizarDiagnostico();
      await sincronizarEstadoSeguro();
      await atualizarStatusBackups();
    } catch (e) {
      toast(e.message, true);
    }
  });

  refs.btnBaixarBackup?.addEventListener('click', async () => {
    try {
      await baixarBackupManual();
      toast('Backup baixado pelo navegador.');
    } catch (e) { toast(e.message, true); }
  });

  refs.btnAbrirPastaBackups?.addEventListener('click', async () => {
    try {
      await abrirPastaBackups();
    } catch (e) { toast(e.message, true); }
  });

  refs.inputBackup.addEventListener('change', async () => {
    const file = refs.inputBackup.files?.[0];
    refs.inputBackup.value = '';
    if (!file) return;
    try {
      snapshotRestore = await lerBackupArquivo(file);
      refs.resumoRestore.textContent = `Backup validado: ${snapshotRestore.cases.length} case(s), ${snapshotRestore.ocorrencias.length} ocorrência(s) e ${snapshotRestore.historicos.length} evento(s) de histórico.`;
      refs.dlgRestore.showModal();
    } catch (e) {
      snapshotRestore = null;
      toast(e.message, true);
    }
  });

  $('btnCancelarRestore').addEventListener('click', () => {
    snapshotRestore = null;
    refs.dlgRestore.close();
  });
  $('btnMesclar').addEventListener('click', async () => {
    if (!snapshotRestore) return;
    try {
      await restaurarBackup(snapshotRestore, 'mesclar');
      refs.dlgRestore.close();
      snapshotRestore = null;
      toast('Backup mesclado com sucesso.');
      await atualizarTudo();
      await sincronizarEstadoSeguro();
    } catch (e) {
      toast(e.message, true);
    }
  });
  $('btnSubstituir').addEventListener('click', async () => {
    if (!snapshotRestore || !confirm('Substituir todos os dados locais pelos dados do backup?')) return;
    try {
      await restaurarBackup(snapshotRestore, 'substituir');
      refs.dlgRestore.close();
      snapshotRestore = null;
      toast('Base substituída pelo backup.');
      await atualizarTudo();
      await sincronizarEstadoSeguro();
    } catch (e) {
      toast(e.message, true);
    }
  });

  refs.btnNovaQuery?.addEventListener('click', limparQuery);
  refs.filtroQueries?.addEventListener('input', () => renderQueries().catch((e) => toast(e.message, true)));
  refs.formQuery?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await salvarQuerySql({
        id: refs.queryId.value || undefined,
        nome: refs.queryNome.value,
        descricao: refs.queryDescricao.value,
        query: refs.queryTexto.value,
        tags: tagsDoCampoQuery(),
        favorita: refs.queryFavorita.checked,
      });
      limparQuery();
      await Promise.all([renderQueries(), renderFavoritosPainel()]);
      await sincronizarEstadoSeguro();
      toast('Query SQL salva.');
    } catch (e) { toast(e.message, true); }
  });

  for (const ref of [refs.filtroTexto, refs.filtroSituacao, refs.filtroPrioridade, refs.filtroEstado, refs.filtroVencimento]) {
    ref.addEventListener('input', () => renderConteudoPrincipal().catch((e) => toast(e.message, true)));
    ref.addEventListener('change', () => renderConteudoPrincipal().catch((e) => toast(e.message, true)));
  }

  window.addEventListener('hashchange', async () => {
    const match = /^#case=(.+)$/.exec(location.hash);
    if (match) {
      try { await abrirCase(decodeURIComponent(match[1])); }
      catch (e) { toast(e.message, true); }
    }
  });
}

async function iniciar() {
  aplicarTema(obterTemaAtual(), { persistir: false });
  preencherSelect(refs.situacao, SITUACOES, 'Em análise');
  preencherSelect(refs.prioridade, PRIORIDADES, 'Normal');
  preencherSelect(refs.filtroSituacao, SITUACOES);
  preencherSelect(refs.filtroPrioridade, PRIORIDADES);
  refs.filtroPrioridade.append(el('option', { value: '__prioritarios__' }, 'Alta/Crítica'));
  definirHorariosSelecionados(HORARIOS_PADRAO);
  refs.versaoAplicacao.textContent = APP_VERSION;
  refs.versaoSidebar.textContent = APP_VERSION;
  vincularEventos();

  const classificados = await classificarResolvidosLegados();
  if (classificados > 0) console.info(`${classificados} case(s) resolvido(s) antigo(s) classificado(s) no Histórico.`);

  const removidos = await purgarResolvidosAntigos({ dias: 15 });
  if (removidos > 0) console.info(`${removidos} case(s) resolvido(s) removido(s) pela retenção de 15 dias.`);
  const removidosLixeira = await purgarLixeiraAntiga({ dias: 7 });
  if (removidosLixeira > 0) console.info(`${removidosLixeira} item(ns) removido(s) definitivamente da Lixeira.`);

  await selecionarView('painel', { resetarFiltros: false });
  await atualizarTudo();
  await sincronizarEstadoSeguro();
  await registrarServiceWorker();
  pararMotorLembretes = iniciarMotorLembretes(atualizarTudo);

  intervaloLimpezaAutomatica = window.setInterval(async () => {
    try {
      const [resolvidosRemovidos, lixeiraRemovida] = await Promise.all([
        purgarResolvidosAntigos({ dias: 15 }),
        purgarLixeiraAntiga({ dias: 7 }),
      ]);
      if (resolvidosRemovidos > 0 || lixeiraRemovida > 0) {
        await atualizarTudo();
        if (viewAtual === 'lixeira') await renderLixeira();
        await sincronizarEstadoSeguro();
      }
    } catch (erro) { console.warn('Falha na limpeza automática:', erro); }
  }, 60 * 60 * 1000);

  const match = /^#case=(.+)$/.exec(location.hash);
  if (match) await abrirCase(decodeURIComponent(match[1]));
}

iniciar().catch((e) => {
  console.error(e);
  toast(`Falha ao iniciar: ${e.message}`, true);
});
