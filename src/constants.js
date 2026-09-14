/**
 * Constantes centrais do Case Tracker.
 *
 * Mantenha neste módulo somente valores compartilhados entre as camadas de
 * apresentação, domínio, persistência e infraestrutura do navegador. Regras
 * específicas do servidor local permanecem em `servidor-local.ps1`.
 */

export const APP_VERSION = '1.9.0-RC4.9';
export const SCHEMA_VERSION = 4;
export const DB_NAME = 'acompanhamento-cases-db';
export const DB_VERSION = 4;
export const TIME_ZONE = 'America/Sao_Paulo';

export const SITUACOES = Object.freeze([
  'Em análise',
  'Em desenvolvimento',
  'Em validação',
  'Aguardando deploy',
  'Aguardando GMUD',
  'Aguardando Financeiro',
  'Aguardando usuário',
  'Aguardando retorno interno',
  'Resolvido',
  'Cancelado',
]);

export const SITUACOES_FINAIS = new Set(['Resolvido', 'Cancelado']);

export const PRIORIDADES = Object.freeze(['Baixa', 'Normal', 'Alta', 'Crítica']);
export const PESO_PRIORIDADE = Object.freeze({ Baixa: 1, Normal: 2, Alta: 3, Crítica: 4 });

export const ESTADOS_OCORRENCIA = Object.freeze({
  PENDENTE: 'Pendente',
  ATRASADA: 'Atrasada',
  ADIADA: 'Adiada',
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
});

export const DIAS_UTEIS_PADRAO = Object.freeze([1, 2, 3, 4, 5]);
export const HORARIOS_PADRAO = Object.freeze(['10:00', '16:00']);

export const STORES = Object.freeze({
  CASES: 'cases',
  AGENDAS: 'agendas',
  OCORRENCIAS: 'ocorrencias',
  HISTORICOS: 'historicos',
  MODELOS: 'modelosMensagem',
  QUERIES: 'queriesSql',
  ANOTACOES: 'anotacoes',
  COMENTARIOS: 'comentariosCase',
  ANEXOS: 'anexos',
  CONFIGURACOES: 'configuracoes',
  METADADOS: 'metadados',
});

export const STORE_LIST = Object.freeze(Object.values(STORES));
export const BACKUP_STORE_LIST = Object.freeze(STORE_LIST.filter((store) => store !== STORES.ANEXOS));

export const LIMITES_BACKUP = Object.freeze({
  bytes: 12 * 1024 * 1024,
  cases: 5000,
  agendas: 20000,
  ocorrencias: 100000,
  historicos: 100000,
  modelos: 5000,
  queries: 5000,
  anotacoes: 10000,
  comentarios: 50000,
  configuracoes: 1000,
  metadados: 100,
  textoCurto: 500,
  textoLongo: 50000,
  querySql: 100000,
});

export const LIMITES_ANEXOS = Object.freeze({
  imagemBytes: 8 * 1024 * 1024,
  pdfBytes: 15 * 1024 * 1024,
  totalPorRegistroBytes: 25 * 1024 * 1024,
  quantidadePorRegistro: 12,
});
