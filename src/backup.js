/**
 * Backup, restauração e sincronização com o servidor local.
 *
 * O JSON geral é validado antes de qualquer restauração. Anexos binários são
 * tratados separadamente para não inflar o backup textual e para respeitar os
 * limites de armazenamento do navegador.
 */

import {
  APP_VERSION,
  ESTADOS_OCORRENCIA,
  LIMITES_BACKUP,
  LIMITES_ANEXOS,
  PRIORIDADES,
  SCHEMA_VERSION,
  SITUACOES,
  STORES,
} from './constants.js';
import { executarTransacao, obter, obterTodos, reqComoPromise, salvar, snapshotCompleto, substituirSnapshot } from './db.js';
import { isoValido, normalizarProtocolo, objetoPlano, rejeitarChavesPerigosas } from './validation.js';

// -----------------------------------------------------------------------------
// Validação do formato de backup
// -----------------------------------------------------------------------------

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function validarString(valor, campo, max = LIMITES_BACKUP.textoLongo, obrigatorio = true) {
  exigir(typeof valor === 'string', `${campo} deve ser texto.`);
  exigir(!obrigatorio || valor.length > 0, `${campo} é obrigatório.`);
  exigir(valor.length <= max, `${campo} excede o limite permitido.`);
  return valor;
}

function validarId(valor, campo = 'id') {
  validarString(valor, campo, 100, true);
  return valor;
}

function validarData(valor, campo) {
  exigir(isoValido(valor), `${campo} possui data inválida.`);
  return valor;
}

function copiarCase(c) {
  exigir(objetoPlano(c), 'Registro de case inválido.');
  const protocolo = validarString(c.protocolo, 'protocolo', 500);
  const protocoloNormalizado = normalizarProtocolo(validarString(c.protocoloNormalizado, 'protocoloNormalizado', 500));
  exigir(protocoloNormalizado.startsWith('CS'), 'Backup contém protocolo que não inicia por CS.');
  exigir(normalizarProtocolo(protocolo) === protocoloNormalizado, 'Protocolo e protocolo normalizado estão inconsistentes.');
  exigir(SITUACOES.includes(c.situacao), 'Backup contém situação inválida.');
  exigir(PRIORIDADES.includes(c.prioridade), 'Backup contém prioridade inválida.');
  return {
    id: validarId(c.id),
    protocolo,
    protocoloNormalizado,
    titulo: validarString(c.titulo, 'titulo', 500),
    resumo: validarString(c.resumo ?? '', 'resumo', LIMITES_BACKUP.textoLongo, false),
    situacao: c.situacao,
    prioridade: c.prioridade,
    mensagem: validarString(c.mensagem ?? '', 'mensagem', LIMITES_BACKUP.textoLongo, false),
    observacoes: validarString(c.observacoes ?? '', 'observacoes', LIMITES_BACKUP.textoLongo, false),
    finalizadoEm: c.finalizadoEm == null ? null : validarData(c.finalizadoEm, 'finalizadoEm'),
    origemResolucao: c.origemResolucao === 'GMUD' ? 'GMUD' : (c.situacao === 'Resolvido' ? 'GERAL' : null),
    excluidoEm: c.excluidoEm == null ? null : validarData(c.excluidoEm, 'excluidoEm'),
    criadoEm: validarData(c.criadoEm, 'criadoEm'),
    atualizadoEm: validarData(c.atualizadoEm, 'atualizadoEm'),
  };
}

function copiarAgenda(a) {
  exigir(objetoPlano(a), 'Registro de agenda inválido.');
  exigir(/^\d{2}:\d{2}$/.test(a.horario), 'Agenda com horário inválido.');
  const [hora, minuto] = a.horario.split(':').map(Number);
  exigir(hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59, 'Agenda com horário fora da faixa permitida.');
  exigir(Array.isArray(a.diasSemana) && a.diasSemana.length > 0, 'Agenda sem dias da semana.');
  exigir(a.diasSemana.every((d) => Number.isInteger(d) && d >= 0 && d <= 6), 'Agenda com dia inválido.');
  return {
    id: validarId(a.id),
    caseId: validarId(a.caseId, 'caseId'),
    horario: a.horario,
    diasSemana: (() => {
      const diasValidos = [...new Set(a.diasSemana)].filter((d) => d >= 0 && d <= 6).sort((x, y) => x - y);
      return diasValidos.length ? diasValidos : [1, 2, 3, 4, 5];
    })(),
    ativa: a.ativa !== false,
    gerarApartirDe: validarData(a.gerarApartirDe ?? a.criadoEm, 'gerarApartirDe'),
    criadoEm: validarData(a.criadoEm, 'criadoEm'),
    atualizadoEm: validarData(a.atualizadoEm, 'atualizadoEm'),
  };
}

function copiarOcorrencia(o) {
  exigir(objetoPlano(o), 'Registro de ocorrência inválido.');
  exigir(Object.values(ESTADOS_OCORRENCIA).includes(o.estado), 'Ocorrência com estado inválido.');
  return {
    id: validarId(o.id),
    caseId: validarId(o.caseId, 'caseId'),
    agendaId: validarId(o.agendaId, 'agendaId'),
    previstoPara: validarData(o.previstoPara, 'previstoPara'),
    estado: o.estado,
    adiadoPara: o.adiadoPara == null ? null : validarData(o.adiadoPara, 'adiadoPara'),
    confirmadoEm: o.confirmadoEm == null ? null : validarData(o.confirmadoEm, 'confirmadoEm'),
    notificadaEm: o.notificadaEm == null ? null : validarData(o.notificadaEm, 'notificadaEm'),
    motivoCancelamento:
      o.motivoCancelamento == null ? null : validarString(o.motivoCancelamento, 'motivoCancelamento', 100),
    criadoEm: validarData(o.criadoEm, 'criadoEm'),
    atualizadoEm: validarData(o.atualizadoEm ?? o.criadoEm, 'atualizadoEm'),
  };
}

function copiarHistorico(h) {
  exigir(objetoPlano(h), 'Registro de histórico inválido.');
  return {
    id: validarId(h.id),
    caseId: validarId(h.caseId, 'caseId'),
    tipoEvento: validarString(h.tipoEvento, 'tipoEvento', 100),
    dadosAnteriores: h.dadosAnteriores ?? null,
    dadosNovos: h.dadosNovos ?? null,
    ocorridoEm: validarData(h.ocorridoEm, 'ocorridoEm'),
  };
}

function copiarModelo(m) {
  exigir(objetoPlano(m), 'Registro de modelo inválido.');
  return {
    id: validarId(m.id),
    nome: validarString(m.nome, 'nome', 500),
    conteudo: validarString(m.conteudo, 'conteudo', LIMITES_BACKUP.textoLongo),
    ativo: m.ativo !== false,
    favorita: m.favorita === true,
    excluidoEm: m.excluidoEm == null ? null : validarData(m.excluidoEm, 'excluidoEm'),
    criadoEm: validarData(m.criadoEm, 'criadoEm'),
    atualizadoEm: validarData(m.atualizadoEm, 'atualizadoEm'),
  };
}

function copiarQuery(q) {
  exigir(objetoPlano(q), 'Registro de query SQL inválido.');
  const tags = Array.isArray(q.tags)
    ? q.tags.map((x) => validarString(String(x), 'tag da query', 60)).slice(0, 12)
    : [];
  return {
    id: validarId(q.id),
    nome: validarString(q.nome, 'nome da query', 500),
    descricao: validarString(q.descricao ?? '', 'descrição da query', LIMITES_BACKUP.textoLongo, false),
    query: validarString(q.query, 'query SQL', LIMITES_BACKUP.querySql),
    tags,
    favorita: q.favorita === true,
    excluidoEm: q.excluidoEm == null ? null : validarData(q.excluidoEm, 'excluidoEm'),
    criadoEm: validarData(q.criadoEm, 'criadoEm'),
    atualizadoEm: validarData(q.atualizadoEm, 'atualizadoEm'),
  };
}


function copiarAnotacao(a) {
  exigir(objetoPlano(a), 'Registro de anotação inválido.');
  const palavras = Array.isArray(a.palavrasChave)
    ? a.palavrasChave.map((x) => validarString(String(x), 'palavra-chave', 100)).slice(0, 20)
    : [];
  return {
    id: validarId(a.id),
    titulo: validarString(a.titulo, 'título da anotação', 500),
    conteudo: validarString(a.conteudo ?? '', 'conteúdo da anotação', LIMITES_BACKUP.textoLongo, false),
    palavrasChave: palavras,
    favorita: a.favorita === true,
    excluidoEm: a.excluidoEm == null ? null : validarData(a.excluidoEm, 'excluidoEm'),
    criadoEm: validarData(a.criadoEm, 'criadoEm'),
    atualizadoEm: validarData(a.atualizadoEm, 'atualizadoEm'),
  };
}

function copiarComentario(c) {
  exigir(objetoPlano(c), 'Registro de comentário inválido.');
  return {
    id: validarId(c.id),
    caseId: validarId(c.caseId, 'caseId'),
    texto: validarString(c.texto ?? '', 'texto do comentário', 30000, false),
    criadoEm: validarData(c.criadoEm, 'criadoEm'),
    atualizadoEm: validarData(c.atualizadoEm ?? c.criadoEm, 'atualizadoEm'),
  };
}

function copiarKV(v, tipo) {
  exigir(objetoPlano(v), `Registro de ${tipo} inválido.`);
  return {
    chave: validarString(v.chave, 'chave', 200),
    valor: v.valor ?? null,
    atualizadoEm: validarData(v.atualizadoEm, 'atualizadoEm'),
  };
}

function garantirUnicos(lista, seletor, nome) {
  const vistos = new Set();
  for (const item of lista) {
    const chave = seletor(item);
    exigir(!vistos.has(chave), `${nome} duplicado no backup: ${chave}`);
    vistos.add(chave);
  }
}

export function validarBackupObjeto(obj) {
  rejeitarChavesPerigosas(obj);
  exigir(objetoPlano(obj), 'Backup deve ser um objeto JSON.');
  exigir([1, 2, 3, SCHEMA_VERSION].includes(obj.schemaVersion), `Versão de backup incompatível. Versões aceitas: 1, 2, 3 e ${SCHEMA_VERSION}.`);
  exigir(isoValido(obj.geradoEm), 'Data de geração do backup inválida.');
  exigir(objetoPlano(obj.dados), 'Seção dados ausente no backup.');

  const dados = obj.dados;
  const obrigatoriosLegados = [STORES.CASES, STORES.AGENDAS, STORES.OCORRENCIAS, STORES.HISTORICOS, STORES.MODELOS, STORES.CONFIGURACOES, STORES.METADADOS];
  for (const store of obrigatoriosLegados) exigir(Array.isArray(dados[store]), `Seção obrigatória ausente ou inválida: ${store}.`);
  const snapshot = {
    [STORES.CASES]: (dados[STORES.CASES] ?? []).map(copiarCase),
    [STORES.AGENDAS]: (dados[STORES.AGENDAS] ?? []).map(copiarAgenda),
    [STORES.OCORRENCIAS]: (dados[STORES.OCORRENCIAS] ?? []).map(copiarOcorrencia),
    [STORES.HISTORICOS]: (dados[STORES.HISTORICOS] ?? []).map(copiarHistorico),
    [STORES.MODELOS]: (dados[STORES.MODELOS] ?? []).map(copiarModelo),
    [STORES.QUERIES]: (dados[STORES.QUERIES] ?? []).map(copiarQuery),
    [STORES.ANOTACOES]: (dados[STORES.ANOTACOES] ?? []).map(copiarAnotacao),
    [STORES.COMENTARIOS]: (dados[STORES.COMENTARIOS] ?? []).map(copiarComentario),
    [STORES.CONFIGURACOES]: (dados[STORES.CONFIGURACOES] ?? []).map((x) => copiarKV(x, 'configuração')),
    [STORES.METADADOS]: (dados[STORES.METADADOS] ?? []).map((x) => copiarKV(x, 'metadado')),
  };

  exigir(snapshot[STORES.CASES].length <= LIMITES_BACKUP.cases, 'Backup excede o limite de cases.');
  exigir(snapshot[STORES.AGENDAS].length <= LIMITES_BACKUP.agendas, 'Backup excede o limite de agendas.');
  exigir(snapshot[STORES.OCORRENCIAS].length <= LIMITES_BACKUP.ocorrencias, 'Backup excede o limite de ocorrências.');
  exigir(snapshot[STORES.HISTORICOS].length <= LIMITES_BACKUP.historicos, 'Backup excede o limite de históricos.');
  exigir(snapshot[STORES.MODELOS].length <= LIMITES_BACKUP.modelos, 'Backup excede o limite de modelos.');
  exigir(snapshot[STORES.QUERIES].length <= LIMITES_BACKUP.queries, 'Backup excede o limite de queries SQL.');
  exigir(snapshot[STORES.ANOTACOES].length <= LIMITES_BACKUP.anotacoes, 'Backup excede o limite de anotações.');
  exigir(snapshot[STORES.COMENTARIOS].length <= LIMITES_BACKUP.comentarios, 'Backup excede o limite de comentários.');

  for (const [store, lista] of Object.entries(snapshot)) garantirUnicos(lista, (x) => x.id ?? x.chave, `Identificador em ${store}`);
  garantirUnicos(snapshot[STORES.CASES], (x) => x.protocoloNormalizado, 'Protocolo');
  garantirUnicos(snapshot[STORES.OCORRENCIAS], (x) => `${x.agendaId}|${x.previstoPara}`, 'Ocorrência de agenda/horário');

  const caseIds = new Set(snapshot[STORES.CASES].map((x) => x.id));
  const agendaIds = new Set(snapshot[STORES.AGENDAS].map((x) => x.id));
  const agendaCase = new Map(snapshot[STORES.AGENDAS].map((x) => [x.id, x.caseId]));
  for (const a of snapshot[STORES.AGENDAS]) exigir(caseIds.has(a.caseId), `Agenda ${a.id} aponta para case inexistente.`);
  for (const o of snapshot[STORES.OCORRENCIAS]) {
    exigir(caseIds.has(o.caseId), `Ocorrência ${o.id} aponta para case inexistente.`);
    exigir(agendaIds.has(o.agendaId), `Ocorrência ${o.id} aponta para agenda inexistente.`);
    exigir(agendaCase.get(o.agendaId) === o.caseId, `Ocorrência ${o.id} relaciona agenda e case incompatíveis.`);
    if (o.estado === ESTADOS_OCORRENCIA.CONFIRMADA) exigir(o.confirmadoEm != null, `Ocorrência ${o.id} confirmada sem data de confirmação.`);
  }
  for (const h of snapshot[STORES.HISTORICOS]) exigir(caseIds.has(h.caseId), `Histórico ${h.id} aponta para case inexistente.`);
  for (const c of snapshot[STORES.COMENTARIOS]) exigir(caseIds.has(c.caseId), `Comentário ${c.id} aponta para case inexistente.`);

  return snapshot;
}

export async function gerarBackupObjeto() {
  const dados = await snapshotCompleto();
  const geradoEm = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    geradoEm,
    dados,
  };
}

function baixarJson(conteudo, nomeArquivo) {
  const json = JSON.stringify(conteudo, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// -----------------------------------------------------------------------------
// Comunicação autenticada com o servidor local
// -----------------------------------------------------------------------------

async function obterTokenServidorLocal() {
  if (location.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(location.hostname)) return null;
  // O token pertence à instância atual do servidor local e nunca pode vir do cache.
  // O parâmetro único também neutraliza caches antigos de Service Workers já instalados.
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const resposta = await fetch(`/__session?nonce=${encodeURIComponent(nonce)}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  });
  if (!resposta.ok) throw new Error('Não foi possível validar a sessão do Case Tracker.');
  const dados = await resposta.json();
  if (!dados?.token) throw new Error('Sessão local inválida.');
  return dados.token;
}

function paraBase64Utf8(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(binario);
}

async function postarBase64(endpoint, objeto) {
  const token = await obterTokenServidorLocal();
  if (!token) return null;
  const json = JSON.stringify(objeto);
  const resposta = await fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'text/plain;charset=us-ascii',
      'X-Case-Tracker-Token': token,
    },
    body: paraBase64Utf8(json),
  });
  if (!resposta.ok) throw new Error(await resposta.text() || 'Falha no servidor local.');
  return resposta;
}

export async function exportarBackup() {
  const conteudo = await gerarBackupObjeto();
  const geradoEm = conteudo.geradoEm;
  let salvoNaPasta = false;

  try {
    const resposta = await postarBase64('/__backup_manual', conteudo);
    salvoNaPasta = Boolean(resposta?.ok);
  } catch (erro) {
    console.warn('Não foi possível salvar o backup na pasta local:', erro);
  }

  if (!salvoNaPasta) {
    baixarJson(conteudo, `backup-cases-${geradoEm.replace(/[:.]/g, '-')}.json`);
  }

  await salvar(STORES.METADADOS, {
    chave: 'ultimoBackupEm',
    valor: geradoEm,
    atualizadoEm: geradoEm,
  });
  return { geradoEm, salvoNaPasta };
}

export async function baixarBackupManual() {
  const conteudo = await gerarBackupObjeto();
  baixarJson(conteudo, `backup-cases-${conteudo.geradoEm.replace(/[:.]/g, '-')}.json`);
}

export async function sincronizarEstadoComServidor() {
  const conteudo = await gerarBackupObjeto();
  const modelos = conteudo.dados[STORES.MODELOS] ?? [];
  const anotacoesAtuais = conteudo.dados[STORES.ANOTACOES] ?? [];
  const macros = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    geradoEm: conteudo.geradoEm,
    modelosMensagem: modelos,
  };
  const anotacoes = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    geradoEm: conteudo.geradoEm,
    anotacoes: anotacoesAtuais,
  };
  await postarBase64('/__sync_estado', { backup: conteudo, macros, anotacoes });
  return conteudo.geradoEm;
}

export async function abrirPastaBackups() {
  const token = await obterTokenServidorLocal();
  if (!token) throw new Error('A pasta automática de backups só está disponível quando o sistema é iniciado pelo atalho.');
  const resposta = await fetch('/__abrir_backups', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'X-Case-Tracker-Token': token },
  });
  if (!resposta.ok) throw new Error('Não foi possível abrir a pasta de backups.');
}

export async function obterStatusBackupsLocais() {
  const token = await obterTokenServidorLocal();
  if (!token) return null;
  const resposta = await fetch('/__backup_status', {
    cache: 'no-store',
    headers: { 'X-Case-Tracker-Token': token },
  });
  if (!resposta.ok) return null;
  return resposta.json();
}

export async function obterStatusAgenteLocal() {
  const token = await obterTokenServidorLocal();
  if (!token) return null;
  const resposta = await fetch('/__agent_status', {
    cache: 'no-store',
    headers: { 'X-Case-Tracker-Token': token },
  });
  if (!resposta.ok) return null;
  return resposta.json();
}

export async function enviarAlertaTesteAgente() {
  const token = await obterTokenServidorLocal();
  if (!token) throw new Error('O agente local só está disponível quando o Case Tracker é iniciado pelo atalho.');
  const resposta = await fetch('/__test_notification', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'X-Case-Tracker-Token': token },
  });
  if (!resposta.ok) throw new Error('O Windows não conseguiu exibir o alerta de teste.');
  return resposta.json();
}

// -----------------------------------------------------------------------------
// Backup e restauração de anexos binários
// -----------------------------------------------------------------------------

function blobParaBase64(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binario = '';
    const bloco = 0x8000;
    for (let i = 0; i < bytes.length; i += bloco) {
      binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
    }
    return btoa(binario);
  });
}

function base64ParaBlob(base64, mimeType) {
  const binario = atob(String(base64 ?? ''));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function anexoPermitido(item) {
  if (!item || !item.id || !item.ownerId || !['note', 'caseComment'].includes(item.ownerType)) return false;
  const tipo = String(item.mimeType ?? '').toLowerCase();
  const limite = tipo === 'application/pdf'
    ? LIMITES_ANEXOS.pdfBytes
    : tipo.startsWith('image/') ? LIMITES_ANEXOS.imagemBytes : 0;
  return Boolean(limite && Number(item.tamanho) > 0 && Number(item.tamanho) <= limite);
}

export async function obterResumoAnexosLocais() {
  const anexos = await obterTodos(STORES.ANEXOS);
  return {
    quantidade: anexos.length,
    totalBytes: anexos.reduce((soma, item) => soma + Number(item.tamanho ?? item.blob?.size ?? 0), 0),
  };
}

export async function salvarBackupAnexosSeparado() {
  const anexos = await obterTodos(STORES.ANEXOS);
  const totalBytes = anexos.reduce((soma, item) => soma + Number(item.tamanho ?? item.blob?.size ?? 0), 0);
  const inicioResposta = await postarBase64('/__backup_anexos_iniciar', { quantidade: anexos.length, totalBytes });
  const inicio = await inicioResposta.json();
  if (!inicio?.backupId) throw new Error('O servidor não iniciou o backup de anexos.');

  for (const anexo of anexos) {
    if (!(anexo.blob instanceof Blob) || !anexoPermitido(anexo)) continue;
    const dadosBase64 = await blobParaBase64(anexo.blob);
    const item = {
      id: anexo.id,
      ownerType: anexo.ownerType,
      ownerId: anexo.ownerId,
      nome: String(anexo.nome ?? 'anexo'),
      mimeType: String(anexo.mimeType ?? anexo.blob.type ?? 'application/octet-stream'),
      tamanho: Number(anexo.tamanho ?? anexo.blob.size),
      criadoEm: anexo.criadoEm ?? new Date().toISOString(),
    };
    await postarBase64('/__backup_anexo_item', { backupId: inicio.backupId, item, dadosBase64 });
  }

  const finalResposta = await postarBase64('/__backup_anexos_finalizar', { backupId: inicio.backupId });
  return finalResposta.json();
}

async function ownerExisteParaAnexo(item) {
  if (item.ownerType === 'note') return Boolean(await obter(STORES.ANOTACOES, item.ownerId));
  if (item.ownerType === 'caseComment') return Boolean(await obter(STORES.COMENTARIOS, item.ownerId));
  return false;
}

export async function restaurarUltimoBackupAnexos() {
  const manifestResposta = await postarBase64('/__restaurar_anexos_manifest', {});
  const manifest = await manifestResposta.json();
  const itens = Array.isArray(manifest?.itens) ? manifest.itens : [];
  let restaurados = 0;
  let ignorados = 0;

  for (const itemManifesto of itens) {
    if (!anexoPermitido(itemManifesto) || !(await ownerExisteParaAnexo(itemManifesto))) {
      ignorados += 1;
      continue;
    }
    const resposta = await postarBase64('/__restaurar_anexo_item', { backupId: manifest.backupId, id: itemManifesto.id });
    const pacote = await resposta.json();
    const item = pacote?.item;
    if (!anexoPermitido(item) || !pacote?.dadosBase64) {
      ignorados += 1;
      continue;
    }
    const blob = base64ParaBlob(pacote.dadosBase64, item.mimeType);
    if (blob.size !== Number(item.tamanho)) {
      ignorados += 1;
      continue;
    }
    await executarTransacao([STORES.ANEXOS], 'readwrite', (tx) => reqComoPromise(tx.objectStore(STORES.ANEXOS).put({
      id: item.id,
      ownerType: item.ownerType,
      ownerId: item.ownerId,
      nome: item.nome,
      mimeType: item.mimeType,
      tamanho: item.tamanho,
      blob,
      criadoEm: item.criadoEm,
    })));
    restaurados += 1;
  }

  return { restaurados, ignorados, total: itens.length, backupId: manifest.backupId };
}

export async function lerBackupArquivo(file) {
  exigir(file instanceof File, 'Selecione um arquivo de backup.');
  exigir(file.size > 0, 'O arquivo está vazio.');
  exigir(file.size <= LIMITES_BACKUP.bytes, 'O arquivo excede o limite de tamanho permitido.');
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('O arquivo não contém JSON válido.');
  }
  return validarBackupObjeto(parsed);
}

// -----------------------------------------------------------------------------
// Mesclagem e restauração transacional
// -----------------------------------------------------------------------------

function maisRecente(a, b, campo = 'atualizadoEm') {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b[campo] ?? b.ocorridoEm ?? 0) > Date.parse(a[campo] ?? a.ocorridoEm ?? 0) ? b : a;
}

function mapa(lista, chave = 'id') {
  return new Map(lista.map((x) => [x[chave], x]));
}

export function mesclarSnapshots(local, importado) {
  const resultado = structuredClone(local);
  const localCasesId = mapa(resultado[STORES.CASES]);
  const localCasesProt = new Map(resultado[STORES.CASES].map((c) => [c.protocoloNormalizado, c]));
  const remapCase = new Map();

  for (const inc of importado[STORES.CASES]) {
    const porId = localCasesId.get(inc.id);
    const porProt = localCasesProt.get(inc.protocoloNormalizado);
    if (porId && porProt && porId.id !== porProt.id) {
      throw new Error(`Conflito ambíguo ao mesclar o protocolo ${inc.protocoloNormalizado}.`);
    }
    const alvo = porId ?? porProt;
    if (alvo) {
      const escolhido = maisRecente(alvo, inc);
      const mesclado = { ...escolhido, id: alvo.id, protocoloNormalizado: alvo.protocoloNormalizado, protocolo: alvo.protocolo };
      const idx = resultado[STORES.CASES].findIndex((x) => x.id === alvo.id);
      resultado[STORES.CASES][idx] = mesclado;
      localCasesId.set(alvo.id, mesclado);
      localCasesProt.set(alvo.protocoloNormalizado, mesclado);
      remapCase.set(inc.id, alvo.id);
    } else {
      resultado[STORES.CASES].push(inc);
      localCasesId.set(inc.id, inc);
      localCasesProt.set(inc.protocoloNormalizado, inc);
      remapCase.set(inc.id, inc.id);
    }
  }

  const agendaMap = mapa(resultado[STORES.AGENDAS]);
  const remapAgenda = new Map();
  for (const original of importado[STORES.AGENDAS]) {
    const inc = { ...original, caseId: remapCase.get(original.caseId) ?? original.caseId };
    const atual = agendaMap.get(inc.id);
    if (atual && atual.caseId !== inc.caseId) throw new Error(`Conflito de agenda ${inc.id} entre cases diferentes.`);
    const escolhido = maisRecente(atual, inc);
    if (atual) resultado[STORES.AGENDAS][resultado[STORES.AGENDAS].findIndex((x) => x.id === inc.id)] = escolhido;
    else resultado[STORES.AGENDAS].push(escolhido);
    agendaMap.set(inc.id, escolhido);
    remapAgenda.set(original.id, escolhido.id);
  }

  const ocorrMap = mapa(resultado[STORES.OCORRENCIAS]);
  const agendaHorario = new Map(resultado[STORES.OCORRENCIAS].map((o) => [`${o.agendaId}|${o.previstoPara}`, o]));
  for (const original of importado[STORES.OCORRENCIAS]) {
    const inc = {
      ...original,
      caseId: remapCase.get(original.caseId) ?? original.caseId,
      agendaId: remapAgenda.get(original.agendaId) ?? original.agendaId,
    };
    const porId = ocorrMap.get(inc.id);
    const porHorario = agendaHorario.get(`${inc.agendaId}|${inc.previstoPara}`);
    if (porId && porHorario && porId.id !== porHorario.id) throw new Error(`Conflito ambíguo na ocorrência ${inc.id}.`);
    const alvo = porId ?? porHorario;
    if (alvo && (alvo.caseId !== inc.caseId || alvo.agendaId !== inc.agendaId)) throw new Error(`Conflito de referência na ocorrência ${inc.id}.`);
    const escolhido = maisRecente(alvo, inc);
    if (alvo) {
      const idx = resultado[STORES.OCORRENCIAS].findIndex((x) => x.id === alvo.id);
      resultado[STORES.OCORRENCIAS][idx] = { ...escolhido, id: alvo.id };
    } else resultado[STORES.OCORRENCIAS].push(inc);
  }

  const histMap = mapa(resultado[STORES.HISTORICOS]);
  for (const original of importado[STORES.HISTORICOS]) {
    const inc = { ...original, caseId: remapCase.get(original.caseId) ?? original.caseId };
    if (!histMap.has(inc.id)) {
      resultado[STORES.HISTORICOS].push(inc);
      histMap.set(inc.id, inc);
    }
  }

  const modMap = mapa(resultado[STORES.MODELOS]);
  for (const inc of importado[STORES.MODELOS]) {
    const atual = modMap.get(inc.id);
    const escolhido = maisRecente(atual, inc);
    if (atual) resultado[STORES.MODELOS][resultado[STORES.MODELOS].findIndex((x) => x.id === inc.id)] = escolhido;
    else resultado[STORES.MODELOS].push(escolhido);
    modMap.set(inc.id, escolhido);
  }

  const queryMap = mapa(resultado[STORES.QUERIES]);
  for (const inc of importado[STORES.QUERIES]) {
    const atual = queryMap.get(inc.id);
    const escolhido = maisRecente(atual, inc);
    if (atual) resultado[STORES.QUERIES][resultado[STORES.QUERIES].findIndex((x) => x.id === inc.id)] = escolhido;
    else resultado[STORES.QUERIES].push(escolhido);
    queryMap.set(inc.id, escolhido);
  }

  const notaMap = mapa(resultado[STORES.ANOTACOES]);
  for (const inc of importado[STORES.ANOTACOES]) {
    const atual = notaMap.get(inc.id);
    const escolhido = maisRecente(atual, inc);
    if (atual) resultado[STORES.ANOTACOES][resultado[STORES.ANOTACOES].findIndex((x) => x.id === inc.id)] = escolhido;
    else resultado[STORES.ANOTACOES].push(escolhido);
    notaMap.set(inc.id, escolhido);
  }

  const comentarioMap = mapa(resultado[STORES.COMENTARIOS]);
  for (const original of importado[STORES.COMENTARIOS]) {
    const inc = { ...original, caseId: remapCase.get(original.caseId) ?? original.caseId };
    const atual = comentarioMap.get(inc.id);
    const escolhido = maisRecente(atual, inc);
    if (atual) resultado[STORES.COMENTARIOS][resultado[STORES.COMENTARIOS].findIndex((x) => x.id === inc.id)] = escolhido;
    else resultado[STORES.COMENTARIOS].push(escolhido);
    comentarioMap.set(inc.id, escolhido);
  }

  for (const store of [STORES.CONFIGURACOES, STORES.METADADOS]) {
    const kv = mapa(resultado[store], 'chave');
    for (const inc of importado[store]) {
      const atual = kv.get(inc.chave);
      const escolhido = maisRecente(atual, inc);
      if (atual) resultado[store][resultado[store].findIndex((x) => x.chave === inc.chave)] = escolhido;
      else resultado[store].push(escolhido);
      kv.set(inc.chave, escolhido);
    }
  }

  // Revalida integridade e unicidade antes da transação de escrita.
  return validarBackupObjeto({ schemaVersion: SCHEMA_VERSION, geradoEm: new Date().toISOString(), dados: resultado });
}

export async function restaurarBackup(snapshotImportado, modo) {
  if (modo === 'substituir') {
    await substituirSnapshot(snapshotImportado);
    return;
  }
  if (modo !== 'mesclar') throw new Error('Modo de restauração inválido.');
  const local = await snapshotCompleto();
  const mesclado = mesclarSnapshots(local, snapshotImportado);
  await substituirSnapshot(mesclado);
}
