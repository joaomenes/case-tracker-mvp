/**
 * Persistência e validação de anexos locais.
 *
 * Imagens/PDFs vivem no IndexedDB e não entram nos JSONs de backup geral.
 * O backup binário separado é coordenado por `backup.js` e pelo servidor local.
 */

import { LIMITES_ANEXOS, STORES } from './constants.js';
import { executarTransacao, obterTodos, obterTodosPorIndice, reqComoPromise } from './db.js';

const OWNER_TYPES = new Set(['caseComment', 'note']);

function novoId() {
  return crypto.randomUUID();
}

function validarOwner(ownerType, ownerId) {
  if (!OWNER_TYPES.has(ownerType)) throw new Error('Tipo de anexo inválido.');
  if (!ownerId) throw new Error('Registro de destino do anexo não informado.');
}

function limitePorTipo(tipo) {
  if (tipo === 'application/pdf') return LIMITES_ANEXOS.pdfBytes;
  if (tipo.startsWith('image/')) return LIMITES_ANEXOS.imagemBytes;
  return 0;
}

export function validarArquivoAnexo(file, { aceitarPdf = false } = {}) {
  if (!(file instanceof Blob)) throw new Error('Arquivo inválido.');
  const tipo = String(file.type ?? '').toLowerCase();
  const permitido = tipo.startsWith('image/') || (aceitarPdf && tipo === 'application/pdf');
  if (!permitido) throw new Error(aceitarPdf ? 'São aceitas apenas imagens e arquivos PDF.' : 'São aceitas apenas imagens.');
  const limite = limitePorTipo(tipo);
  if (!limite || file.size <= 0 || file.size > limite) {
    const mb = Math.round(limite / 1024 / 1024);
    throw new Error(`O arquivo excede o limite de ${mb} MB permitido para esse tipo.`);
  }
  return true;
}

export async function listarAnexos(ownerType, ownerId) {
  validarOwner(ownerType, ownerId);
  const itens = await obterTodosPorIndice(STORES.ANEXOS, 'ownerType_ownerId', [ownerType, ownerId]);
  return itens.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
}

export async function adicionarAnexos(ownerType, ownerId, files, { aceitarPdf = false, relogio = () => new Date() } = {}) {
  validarOwner(ownerType, ownerId);
  const novos = Array.from(files ?? []);
  if (!novos.length) return [];

  for (const file of novos) validarArquivoAnexo(file, { aceitarPdf });
  const existentes = await listarAnexos(ownerType, ownerId);
  if (existentes.length + novos.length > LIMITES_ANEXOS.quantidadePorRegistro) {
    throw new Error(`Limite de ${LIMITES_ANEXOS.quantidadePorRegistro} anexos por registro excedido.`);
  }
  const total = existentes.reduce((s, a) => s + Number(a.tamanho ?? 0), 0) + novos.reduce((s, f) => s + f.size, 0);
  if (total > LIMITES_ANEXOS.totalPorRegistroBytes) throw new Error('Os anexos deste registro excedem o limite total de 25 MB.');

  const instante = relogio().toISOString();
  const registros = novos.map((file) => ({
    id: novoId(),
    ownerType,
    ownerId,
    nome: String(file.name ?? `imagem-${Date.now()}`),
    mimeType: String(file.type ?? 'application/octet-stream'),
    tamanho: file.size,
    blob: file,
    criadoEm: instante,
  }));

  await executarTransacao([STORES.ANEXOS], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.ANEXOS);
    for (const registro of registros) await reqComoPromise(store.add(registro));
  });
  return registros;
}

export async function excluirAnexo(id) {
  return executarTransacao([STORES.ANEXOS], 'readwrite', (tx) => reqComoPromise(tx.objectStore(STORES.ANEXOS).delete(id)));
}

export async function limparAnexosOrfaos() {
  const [anexos, anotacoes, comentarios] = await Promise.all([
    obterTodos(STORES.ANEXOS),
    obterTodos(STORES.ANOTACOES),
    obterTodos(STORES.COMENTARIOS),
  ]);
  const notas = new Set(anotacoes.map((item) => item.id));
  const comentariosIds = new Set(comentarios.map((item) => item.id));
  const orfaos = anexos.filter((item) => {
    if (item.ownerType === 'note') return !notas.has(item.ownerId);
    if (item.ownerType === 'caseComment') return !comentariosIds.has(item.ownerId);
    return true;
  });
  if (!orfaos.length) return 0;
  await executarTransacao([STORES.ANEXOS], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.ANEXOS);
    for (const item of orfaos) await reqComoPromise(store.delete(item.id));
  });
  return orfaos.length;
}
