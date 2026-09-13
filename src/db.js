/**
 * Infraestrutura de persistência IndexedDB.
 *
 * Este módulo concentra abertura/migração do banco e primitivas transacionais.
 * As regras de negócio ficam em `domain.js`; aqui evitamos decisões de domínio
 * para que futuras migrações de armazenamento sejam mais simples.
 */

import { BACKUP_STORE_LIST, DB_NAME, DB_VERSION, STORES, STORE_LIST } from './constants.js';

let dbPromise;

export function reqComoPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha em operação IndexedDB.'));
  });
}

export function fimTransacao(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transação IndexedDB abortada.'));
    tx.onerror = () => reject(tx.error ?? new Error('Falha em transação IndexedDB.'));
  });
}

export function abrirBanco() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      const cases = db.objectStoreNames.contains(STORES.CASES)
        ? req.transaction.objectStore(STORES.CASES)
        : db.createObjectStore(STORES.CASES, { keyPath: 'id' });
      if (!cases.indexNames.contains('protocoloNormalizado')) {
        cases.createIndex('protocoloNormalizado', 'protocoloNormalizado', { unique: true });
      }
      if (!cases.indexNames.contains('situacao')) cases.createIndex('situacao', 'situacao');
      if (!cases.indexNames.contains('prioridade')) cases.createIndex('prioridade', 'prioridade');
      if (!cases.indexNames.contains('atualizadoEm')) cases.createIndex('atualizadoEm', 'atualizadoEm');
      if (!cases.indexNames.contains('excluidoEm')) cases.createIndex('excluidoEm', 'excluidoEm');

      const agendas = db.objectStoreNames.contains(STORES.AGENDAS)
        ? req.transaction.objectStore(STORES.AGENDAS)
        : db.createObjectStore(STORES.AGENDAS, { keyPath: 'id' });
      if (!agendas.indexNames.contains('caseId')) agendas.createIndex('caseId', 'caseId');
      if (!agendas.indexNames.contains('caseId_ativa')) agendas.createIndex('caseId_ativa', ['caseId', 'ativa']);

      const ocorrencias = db.objectStoreNames.contains(STORES.OCORRENCIAS)
        ? req.transaction.objectStore(STORES.OCORRENCIAS)
        : db.createObjectStore(STORES.OCORRENCIAS, { keyPath: 'id' });
      if (!ocorrencias.indexNames.contains('caseId')) ocorrencias.createIndex('caseId', 'caseId');
      if (!ocorrencias.indexNames.contains('agendaId')) ocorrencias.createIndex('agendaId', 'agendaId');
      if (!ocorrencias.indexNames.contains('estado')) ocorrencias.createIndex('estado', 'estado');
      if (!ocorrencias.indexNames.contains('previstoPara')) ocorrencias.createIndex('previstoPara', 'previstoPara');
      if (!ocorrencias.indexNames.contains('agenda_previsto')) {
        ocorrencias.createIndex('agenda_previsto', ['agendaId', 'previstoPara'], { unique: true });
      }

      const historicos = db.objectStoreNames.contains(STORES.HISTORICOS)
        ? req.transaction.objectStore(STORES.HISTORICOS)
        : db.createObjectStore(STORES.HISTORICOS, { keyPath: 'id' });
      if (!historicos.indexNames.contains('caseId')) historicos.createIndex('caseId', 'caseId');
      if (!historicos.indexNames.contains('ocorridoEm')) historicos.createIndex('ocorridoEm', 'ocorridoEm');

      const modelos = db.objectStoreNames.contains(STORES.MODELOS)
        ? req.transaction.objectStore(STORES.MODELOS)
        : db.createObjectStore(STORES.MODELOS, { keyPath: 'id' });
      if (!modelos.indexNames.contains('nome')) modelos.createIndex('nome', 'nome');
      if (!modelos.indexNames.contains('excluidoEm')) modelos.createIndex('excluidoEm', 'excluidoEm');

      const queries = db.objectStoreNames.contains(STORES.QUERIES)
        ? req.transaction.objectStore(STORES.QUERIES)
        : db.createObjectStore(STORES.QUERIES, { keyPath: 'id' });
      if (!queries.indexNames.contains('nome')) queries.createIndex('nome', 'nome');
      if (!queries.indexNames.contains('atualizadoEm')) queries.createIndex('atualizadoEm', 'atualizadoEm');
      if (!queries.indexNames.contains('excluidoEm')) queries.createIndex('excluidoEm', 'excluidoEm');
      if (!queries.indexNames.contains('favorita')) queries.createIndex('favorita', 'favorita');


      const anotacoes = db.objectStoreNames.contains(STORES.ANOTACOES)
        ? req.transaction.objectStore(STORES.ANOTACOES)
        : db.createObjectStore(STORES.ANOTACOES, { keyPath: 'id' });
      if (!anotacoes.indexNames.contains('atualizadoEm')) anotacoes.createIndex('atualizadoEm', 'atualizadoEm');
      if (!anotacoes.indexNames.contains('excluidoEm')) anotacoes.createIndex('excluidoEm', 'excluidoEm');

      const comentarios = db.objectStoreNames.contains(STORES.COMENTARIOS)
        ? req.transaction.objectStore(STORES.COMENTARIOS)
        : db.createObjectStore(STORES.COMENTARIOS, { keyPath: 'id' });
      if (!comentarios.indexNames.contains('caseId')) comentarios.createIndex('caseId', 'caseId');
      if (!comentarios.indexNames.contains('criadoEm')) comentarios.createIndex('criadoEm', 'criadoEm');

      const anexos = db.objectStoreNames.contains(STORES.ANEXOS)
        ? req.transaction.objectStore(STORES.ANEXOS)
        : db.createObjectStore(STORES.ANEXOS, { keyPath: 'id' });
      if (!anexos.indexNames.contains('ownerId')) anexos.createIndex('ownerId', 'ownerId');
      if (!anexos.indexNames.contains('ownerType_ownerId')) anexos.createIndex('ownerType_ownerId', ['ownerType', 'ownerId']);

      if (!db.objectStoreNames.contains(STORES.CONFIGURACOES)) {
        db.createObjectStore(STORES.CONFIGURACOES, { keyPath: 'chave' });
      }
      if (!db.objectStoreNames.contains(STORES.METADADOS)) {
        db.createObjectStore(STORES.METADADOS, { keyPath: 'chave' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Não foi possível abrir o IndexedDB.'));
    req.onblocked = () => reject(new Error('A atualização do banco foi bloqueada por outra aba aberta.'));
  });

  return dbPromise;
}

export async function executarTransacao(stores, modo, executora) {
  const db = await abrirBanco();
  const tx = db.transaction(stores, modo);
  const resultado = await executora(tx);
  await fimTransacao(tx);
  return resultado;
}

export async function obter(store, chave) {
  return executarTransacao([store], 'readonly', (tx) => reqComoPromise(tx.objectStore(store).get(chave)));
}

export async function obterTodos(store) {
  return executarTransacao([store], 'readonly', (tx) => reqComoPromise(tx.objectStore(store).getAll()));
}

export async function obterTodosPorIndice(store, indice, consulta) {
  return executarTransacao([store], 'readonly', (tx) =>
    reqComoPromise(tx.objectStore(store).index(indice).getAll(consulta)),
  );
}

export async function salvar(store, registro) {
  return executarTransacao([store], 'readwrite', (tx) => reqComoPromise(tx.objectStore(store).put(registro)));
}


export async function snapshotCompleto() {
  const db = await abrirBanco();
  const tx = db.transaction(BACKUP_STORE_LIST, 'readonly');
  const resultado = {};

  await Promise.all(
    BACKUP_STORE_LIST.map(async (store) => {
      resultado[store] = await reqComoPromise(tx.objectStore(store).getAll());
    }),
  );
  await fimTransacao(tx);
  return resultado;
}

export async function substituirSnapshot(snapshot) {
  return executarTransacao(STORE_LIST, 'readwrite', async (tx) => {
    for (const store of STORE_LIST) {
      await reqComoPromise(tx.objectStore(store).clear());
      if (store === STORES.ANEXOS) continue;
      for (const item of snapshot[store] ?? []) {
        await reqComoPromise(tx.objectStore(store).add(item));
      }
    }
  });
}
