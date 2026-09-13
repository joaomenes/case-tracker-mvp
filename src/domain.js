/**
 * Camada de domínio do Case Tracker.
 *
 * Reúne regras de cases, agendas, ocorrências, histórico, macros, anotações,
 * queries e lixeira. Funções desta camada não manipulam a interface diretamente;
 * toda alteração persistente passa por transações IndexedDB.
 */

import {
  ESTADOS_OCORRENCIA,
  PESO_PRIORIDADE,
  SITUACOES_FINAIS,
  STORES,
} from './constants.js';
import {
  abrirBanco,
  executarTransacao,
  obter,
  obterTodos,
  obterTodosPorIndice,
  reqComoPromise,
  salvar,
} from './db.js';
import { ajustarParaDiasPermitidos, agoraIso, diaPermitido, proximaOcorrenciaDaAgenda, somarMinutos } from './time.js';
import { agendasPadrao, validarAgenda, validarDadosCase } from './validation.js';

const HORIZONTE_DIAS = 14;
const ESTADOS_TERMINAIS = new Set([ESTADOS_OCORRENCIA.CONFIRMADA, ESTADOS_OCORRENCIA.CANCELADA]);

// -----------------------------------------------------------------------------
// Cases, agendas e ocorrências
// -----------------------------------------------------------------------------

function novoId() {
  return crypto.randomUUID();
}

function criarHistorico(caseId, tipoEvento, dadosAnteriores, dadosNovos, ocorridoEm) {
  return {
    id: novoId(),
    caseId,
    tipoEvento,
    dadosAnteriores: dadosAnteriores ?? null,
    dadosNovos: dadosNovos ?? null,
    ocorridoEm,
  };
}

function diferencas(antes, depois, campos) {
  const a = {};
  const d = {};
  let mudou = false;
  for (const campo of campos) {
    if (JSON.stringify(antes?.[campo]) !== JSON.stringify(depois?.[campo])) {
      a[campo] = antes?.[campo] ?? null;
      d[campo] = depois?.[campo] ?? null;
      mudou = true;
    }
  }
  return mudou ? { antes: a, depois: d } : null;
}

function gerarOcorrencias(agenda, caseId, de, ate) {
  const saida = [];
  let cursor = de instanceof Date ? de : new Date(de);
  const limite = ate instanceof Date ? ate : new Date(ate);
  let seguranca = 0;

  while (seguranca < 1000) {
    seguranca += 1;
    const proxima = proximaOcorrenciaDaAgenda(agenda, cursor);
    if (proxima > limite) break;
    const iso = proxima.toISOString();
    saida.push({
      id: novoId(),
      caseId,
      agendaId: agenda.id,
      previstoPara: iso,
      estado: ESTADOS_OCORRENCIA.PENDENTE,
      adiadoPara: null,
      confirmadoEm: null,
      notificadaEm: null,
      motivoCancelamento: null,
      criadoEm: agoraIso(() => new Date(cursor.getTime())),
      atualizadoEm: agoraIso(() => new Date(cursor.getTime())),
    });
    cursor = proxima;
  }

  if (seguranca >= 1000) throw new Error('Limite de segurança atingido ao gerar ocorrências.');
  return saida;
}

function horizonteAPartir(data) {
  return new Date(data.getTime() + HORIZONTE_DIAS * 86_400_000);
}

export function caseAtivo(caseItem) {
  return Boolean(caseItem) && !caseItem.excluidoEm && !SITUACOES_FINAIS.has(caseItem.situacao);
}

export function ordenarCases(cases) {
  return [...cases].sort((a, b) => {
    const prioridade = (PESO_PRIORIDADE[b.prioridade] ?? 0) - (PESO_PRIORIDADE[a.prioridade] ?? 0);
    if (prioridade !== 0) return prioridade;
    return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm));
  });
}

export async function listarCases() {
  return ordenarCases((await obterTodos(STORES.CASES)).filter((c) => !c.excluidoEm));
}

export async function obterCaseCompleto(caseId) {
  const [caseItem, agendas, ocorrencias, historicos] = await Promise.all([
    obter(STORES.CASES, caseId),
    obterTodosPorIndice(STORES.AGENDAS, 'caseId', caseId),
    obterTodosPorIndice(STORES.OCORRENCIAS, 'caseId', caseId),
    obterTodosPorIndice(STORES.HISTORICOS, 'caseId', caseId),
  ]);
  if (!caseItem || caseItem.excluidoEm) return null;
  return {
    case: caseItem,
    agendas: agendas.sort((a, b) => a.horario.localeCompare(b.horario)),
    ocorrencias: ocorrencias.sort((a, b) => b.previstoPara.localeCompare(a.previstoPara)),
    historicos: historicos.sort((a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm)),
  };
}

export async function criarCase(dados, relogio = () => new Date()) {
  const validado = validarDadosCase(dados);
  const agora = relogio();
  const instante = agora.toISOString();
  const id = novoId();
  const definicoesAgenda = (dados.agendas ?? agendasPadrao()).map(validarAgenda);

  const caseItem = {
    id,
    ...validado,
    finalizadoEm: SITUACOES_FINAIS.has(validado.situacao) ? instante : null,
    origemResolucao: validado.situacao === 'Resolvido' ? 'GERAL' : null,
    criadoEm: instante,
    atualizadoEm: instante,
  };

  const agendas = definicoesAgenda.map((agenda) => ({
    id: novoId(),
    caseId: id,
    ...agenda,
    gerarApartirDe: instante,
    criadoEm: instante,
    atualizadoEm: instante,
  }));

  const ocorrencias = caseAtivo(caseItem)
    ? agendas.flatMap((agenda) => (agenda.ativa ? gerarOcorrencias(agenda, id, agora, horizonteAPartir(agora)) : []))
    : [];

  await executarTransacao(
    [STORES.CASES, STORES.AGENDAS, STORES.OCORRENCIAS, STORES.HISTORICOS],
    'readwrite',
    async (tx) => {
      const casesStore = tx.objectStore(STORES.CASES);
      const existente = await reqComoPromise(casesStore.index('protocoloNormalizado').get(validado.protocoloNormalizado));
      if (existente) throw new Error('Já existe um case com esse protocolo.');

      await reqComoPromise(casesStore.add(caseItem));
      for (const agenda of agendas) await reqComoPromise(tx.objectStore(STORES.AGENDAS).add(agenda));
      for (const ocorrencia of ocorrencias) await reqComoPromise(tx.objectStore(STORES.OCORRENCIAS).add(ocorrencia));
      await reqComoPromise(
        tx.objectStore(STORES.HISTORICOS).add(criarHistorico(id, 'CASE_CRIADO', null, caseItem, instante)),
      );
    },
  );

  return id;
}

export async function editarCase(caseId, alteracoes, relogio = () => new Date()) {
  const atual = await obter(STORES.CASES, caseId);
  if (!atual) throw new Error('Case não encontrado.');

  const validado = validarDadosCase({ ...atual, ...alteracoes });
  const instante = relogio().toISOString();
  const anteriorFinal = SITUACOES_FINAIS.has(atual.situacao);
  const novoFinal = SITUACOES_FINAIS.has(validado.situacao);
  const reabertura = anteriorFinal && !novoFinal;
  const finalizacao = !anteriorFinal && novoFinal;

  let origemResolucao = atual.origemResolucao ?? null;
  if (reabertura || validado.situacao !== 'Resolvido') {
    origemResolucao = null;
  } else if (finalizacao && validado.situacao === 'Resolvido') {
    origemResolucao = alteracoes.origemResolucao === 'GMUD' ? 'GMUD' : 'GERAL';
  }

  const atualizado = {
    ...atual,
    ...validado,
    finalizadoEm: novoFinal ? (atual.finalizadoEm ?? instante) : null,
    origemResolucao,
    atualizadoEm: instante,
  };
  const diff = diferencas(atual, atualizado, [
    'protocolo',
    'titulo',
    'resumo',
    'situacao',
    'prioridade',
    'mensagem',
    'observacoes',
    'finalizadoEm',
    'origemResolucao',
  ]);

  await executarTransacao(
    [STORES.CASES, STORES.AGENDAS, STORES.OCORRENCIAS, STORES.HISTORICOS],
    'readwrite',
    async (tx) => {
      const casesStore = tx.objectStore(STORES.CASES);
      const conflito = await reqComoPromise(casesStore.index('protocoloNormalizado').get(validado.protocoloNormalizado));
      if (conflito && conflito.id !== caseId) throw new Error('Já existe outro case com esse protocolo.');

      await reqComoPromise(casesStore.put(atualizado));

      const agendasStore = tx.objectStore(STORES.AGENDAS);
      const ocorrStore = tx.objectStore(STORES.OCORRENCIAS);
      const agendas = await reqComoPromise(agendasStore.index('caseId').getAll(caseId));
      const ocorrencias = await reqComoPromise(ocorrStore.index('caseId').getAll(caseId));

      if (finalizacao) {
        for (const ocorrencia of ocorrencias) {
          if (!ESTADOS_TERMINAIS.has(ocorrencia.estado)) {
            ocorrencia.estado = ESTADOS_OCORRENCIA.CANCELADA;
            ocorrencia.motivoCancelamento = 'CASE_FINALIZADO';
            ocorrencia.atualizadoEm = instante;
            await reqComoPromise(ocorrStore.put(ocorrencia));
          }
        }
      }

      if (reabertura) {
        for (const agenda of agendas) {
          agenda.gerarApartirDe = instante;
          agenda.atualizadoEm = instante;
          await reqComoPromise(agendasStore.put(agenda));
        }

        for (const ocorrencia of ocorrencias) {
          if (
            ocorrencia.estado === ESTADOS_OCORRENCIA.CANCELADA &&
            ocorrencia.motivoCancelamento === 'CASE_FINALIZADO' &&
            new Date(ocorrencia.previstoPara) > relogio()
          ) {
            const agenda = agendas.find((a) => a.id === ocorrencia.agendaId);
            if (agenda?.ativa) {
              ocorrencia.estado = ESTADOS_OCORRENCIA.PENDENTE;
              ocorrencia.motivoCancelamento = null;
              ocorrencia.notificadaEm = null;
              ocorrencia.atualizadoEm = instante;
              await reqComoPromise(ocorrStore.put(ocorrencia));
            }
          }
        }
      }

      const evento = finalizacao ? 'CASE_FINALIZADO' : reabertura ? 'CASE_REABERTO' : 'CASE_EDITADO';
      if (diff || finalizacao || reabertura) {
        await reqComoPromise(
          tx.objectStore(STORES.HISTORICOS).add(
            criarHistorico(caseId, evento, diff?.antes ?? { situacao: atual.situacao }, diff?.depois ?? { situacao: atualizado.situacao }, instante),
          ),
        );
      }
    },
  );

  if (reabertura) await reconciliarCase(caseId, relogio);
  return atualizado;
}

export async function substituirAgendas(caseId, definicoes, relogio = () => new Date()) {
  const caseItem = await obter(STORES.CASES, caseId);
  if (!caseItem) throw new Error('Case não encontrado.');
  const instante = relogio().toISOString();
  const novas = (definicoes ?? []).map((item) => ({ id: item.id ?? novoId(), ...validarAgenda(item) }));

  await executarTransacao(
    [STORES.AGENDAS, STORES.OCORRENCIAS, STORES.HISTORICOS],
    'readwrite',
    async (tx) => {
      const agendasStore = tx.objectStore(STORES.AGENDAS);
      const ocorrStore = tx.objectStore(STORES.OCORRENCIAS);
      const antigas = await reqComoPromise(agendasStore.index('caseId').getAll(caseId));
      const porId = new Map(antigas.map((a) => [a.id, a]));
      const idsNovos = new Set(novas.map((a) => a.id));

      for (const antiga of antigas) {
        if (!idsNovos.has(antiga.id)) {
          antiga.ativa = false;
          antiga.atualizadoEm = instante;
          await reqComoPromise(agendasStore.put(antiga));
          const ocorrencias = await reqComoPromise(ocorrStore.index('agendaId').getAll(antiga.id));
          for (const ocorrencia of ocorrencias) {
            if (!ESTADOS_TERMINAIS.has(ocorrencia.estado)) {
              ocorrencia.estado = ESTADOS_OCORRENCIA.CANCELADA;
              ocorrencia.motivoCancelamento = 'AGENDA_DESATIVADA';
              ocorrencia.atualizadoEm = instante;
              await reqComoPromise(ocorrStore.put(ocorrencia));
            }
          }
        }
      }

      for (const nova of novas) {
        const antiga = porId.get(nova.id);
        const mudouRegra =
          antiga &&
          (antiga.horario !== nova.horario || JSON.stringify(antiga.diasSemana) !== JSON.stringify(nova.diasSemana));
        const registro = {
          ...(antiga ?? {}),
          ...nova,
          caseId,
          gerarApartirDe: mudouRegra || !antiga ? instante : antiga.gerarApartirDe,
          criadoEm: antiga?.criadoEm ?? instante,
          atualizadoEm: instante,
        };
        await reqComoPromise(agendasStore.put(registro));

        if (mudouRegra || nova.ativa === false) {
          const ocorrencias = await reqComoPromise(ocorrStore.index('agendaId').getAll(nova.id));
          for (const ocorrencia of ocorrencias) {
            if (!ESTADOS_TERMINAIS.has(ocorrencia.estado)) {
              ocorrencia.estado = ESTADOS_OCORRENCIA.CANCELADA;
              ocorrencia.motivoCancelamento = mudouRegra ? 'AGENDA_ALTERADA' : 'AGENDA_DESATIVADA';
              ocorrencia.atualizadoEm = instante;
              await reqComoPromise(ocorrStore.put(ocorrencia));
            }
          }
        }
      }

      await reqComoPromise(
        tx.objectStore(STORES.HISTORICOS).add(
          criarHistorico(caseId, 'AGENDA_ALTERADA', antigas, novas, instante),
        ),
      );
    },
  );

  if (caseAtivo(caseItem)) await reconciliarCase(caseId, relogio);
}

export async function reconciliarCase(caseId, relogio = () => new Date()) {
  const caseItem = await obter(STORES.CASES, caseId);
  if (!caseAtivo(caseItem)) return [];

  const agendas = (await obterTodosPorIndice(STORES.AGENDAS, 'caseId', caseId)).filter((a) => a.ativa);
  const agora = relogio();
  const limite = horizonteAPartir(agora);
  const criadas = [];

  for (const agenda of agendas) {
    const existentes = await obterTodosPorIndice(STORES.OCORRENCIAS, 'agendaId', agenda.id);
    const validas = existentes.filter(
      (o) => o.estado !== ESTADOS_OCORRENCIA.CANCELADA && new Date(o.previstoPara) >= new Date(agenda.gerarApartirDe),
    );
    const ultima = validas.reduce(
      (maior, o) => (new Date(o.previstoPara) > maior ? new Date(o.previstoPara) : maior),
      new Date(agenda.gerarApartirDe),
    );

    const candidatas = gerarOcorrencias(agenda, caseId, ultima, limite);
    if (candidatas.length === 0) continue;

    await executarTransacao([STORES.OCORRENCIAS], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.OCORRENCIAS);
      const indice = store.index('agenda_previsto');
      for (const ocorrencia of candidatas) {
        const existente = await reqComoPromise(indice.get([ocorrencia.agendaId, ocorrencia.previstoPara]));
        if (!existente) {
          await reqComoPromise(store.add(ocorrencia));
          criadas.push(ocorrencia);
        }
      }
    });
  }

  return criadas;
}

export async function reconciliarTodos(relogio = () => new Date()) {
  const cases = (await obterTodos(STORES.CASES)).filter(caseAtivo);
  for (const item of cases) await reconciliarCase(item.id, relogio);
}

export function vencimentoEfetivo(ocorrencia) {
  return ocorrencia.adiadoPara ?? ocorrencia.previstoPara;
}

export async function avaliarOcorrencias(relogio = () => new Date()) {
  const agora = relogio();
  const instante = agora.toISOString();
  const cases = new Map((await obterTodos(STORES.CASES)).map((c) => [c.id, c]));
  const agendas = new Map((await obterTodos(STORES.AGENDAS)).map((a) => [a.id, a]));
  const todas = (await Promise.all([
    obterTodosPorIndice(STORES.OCORRENCIAS, 'estado', ESTADOS_OCORRENCIA.PENDENTE),
    obterTodosPorIndice(STORES.OCORRENCIAS, 'estado', ESTADOS_OCORRENCIA.ATRASADA),
    obterTodosPorIndice(STORES.OCORRENCIAS, 'estado', ESTADOS_OCORRENCIA.ADIADA),
  ])).flat();
  const alteradas = [];
  const notificaveis = [];

  for (const ocorrencia of todas) {
    if (ESTADOS_TERMINAIS.has(ocorrencia.estado)) continue;
    const caseItem = cases.get(ocorrencia.caseId);
    if (!caseAtivo(caseItem)) continue;

    const vencimento = new Date(vencimentoEfetivo(ocorrencia));
    if (Number.isNaN(vencimento.getTime())) continue;

    let mudou = false;
    if (ocorrencia.estado === ESTADOS_OCORRENCIA.ADIADA && agora >= vencimento) {
      ocorrencia.estado = agora > vencimento ? ESTADOS_OCORRENCIA.ATRASADA : ESTADOS_OCORRENCIA.PENDENTE;
      mudou = true;
    } else if (ocorrencia.estado === ESTADOS_OCORRENCIA.PENDENTE && agora > vencimento) {
      ocorrencia.estado = ESTADOS_OCORRENCIA.ATRASADA;
      mudou = true;
    }

    if (mudou) {
      ocorrencia.atualizadoEm = instante;
      alteradas.push(ocorrencia);
    }

    const agenda = agendas.get(ocorrencia.agendaId);
    const podeNotificarHoje = diaPermitido(agora, agenda?.diasSemana);
    if (podeNotificarHoje && agora >= vencimento && !ocorrencia.notificadaEm) {
      notificaveis.push({ ocorrencia, case: caseItem });
    }
  }

  if (alteradas.length) {
    await executarTransacao([STORES.OCORRENCIAS], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORES.OCORRENCIAS);
      for (const item of alteradas) await reqComoPromise(store.put(item));
    });
  }

  return notificaveis;
}

export async function confirmarOcorrencia(ocorrenciaId, relogio = () => new Date()) {
  const instante = relogio().toISOString();
  let caseId;
  await executarTransacao([STORES.OCORRENCIAS, STORES.HISTORICOS], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.OCORRENCIAS);
    const ocorrencia = await reqComoPromise(store.get(ocorrenciaId));
    if (!ocorrencia) throw new Error('Ocorrência não encontrada.');
    if (ESTADOS_TERMINAIS.has(ocorrencia.estado)) throw new Error('A ocorrência já está encerrada.');
    caseId = ocorrencia.caseId;
    const antes = { ...ocorrencia };
    ocorrencia.estado = ESTADOS_OCORRENCIA.CONFIRMADA;
    ocorrencia.confirmadoEm = instante;
    ocorrencia.atualizadoEm = instante;
    await reqComoPromise(store.put(ocorrencia));
    await reqComoPromise(
      tx.objectStore(STORES.HISTORICOS).add(
        criarHistorico(caseId, 'OCORRENCIA_CONFIRMADA', antes, ocorrencia, instante),
      ),
    );
  });
  await reconciliarCase(caseId, relogio);
}

export async function adiarOcorrencia(ocorrenciaId, { minutos, para }, relogio = () => new Date()) {
  const agora = relogio();
  const solicitado = para ? new Date(para) : somarMinutos(agora, Number(minutos));
  if (Number.isNaN(solicitado.getTime()) || solicitado <= agora) {
    throw new Error('O novo horário do adiamento deve estar no futuro.');
  }
  const ocorrenciaAtual = await obter(STORES.OCORRENCIAS, ocorrenciaId);
  if (!ocorrenciaAtual) throw new Error('Ocorrência não encontrada.');
  const agenda = await obter(STORES.AGENDAS, ocorrenciaAtual.agendaId);
  const novoHorario = ajustarParaDiasPermitidos(solicitado, agenda?.diasSemana);
  if (novoHorario <= agora) {
    throw new Error('O novo horário do adiamento deve estar no futuro.');
  }
  const instante = agora.toISOString();

  await executarTransacao([STORES.OCORRENCIAS, STORES.HISTORICOS], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.OCORRENCIAS);
    const ocorrencia = await reqComoPromise(store.get(ocorrenciaId));
    if (!ocorrencia) throw new Error('Ocorrência não encontrada.');
    if (ESTADOS_TERMINAIS.has(ocorrencia.estado)) throw new Error('A ocorrência já está encerrada.');
    const antes = { ...ocorrencia };
    ocorrencia.estado = ESTADOS_OCORRENCIA.ADIADA;
    ocorrencia.adiadoPara = novoHorario.toISOString();
    ocorrencia.notificadaEm = null;
    ocorrencia.atualizadoEm = instante;
    await reqComoPromise(store.put(ocorrencia));
    await reqComoPromise(
      tx.objectStore(STORES.HISTORICOS).add(
        criarHistorico(ocorrencia.caseId, 'OCORRENCIA_ADIADA', antes, ocorrencia, instante),
      ),
    );
  });
}

export async function marcarNotificada(ocorrenciaId, relogio = () => new Date()) {
  const ocorrencia = await obter(STORES.OCORRENCIAS, ocorrenciaId);
  if (!ocorrencia || ocorrencia.notificadaEm) return;
  ocorrencia.notificadaEm = relogio().toISOString();
  ocorrencia.atualizadoEm = ocorrencia.notificadaEm;
  await salvar(STORES.OCORRENCIAS, ocorrencia);
}

export async function excluirCase(caseId) {
  await executarTransacao(
    [STORES.CASES, STORES.AGENDAS, STORES.OCORRENCIAS, STORES.HISTORICOS, STORES.COMENTARIOS, STORES.ANEXOS],
    'readwrite',
    async (tx) => {
      const caseItem = await reqComoPromise(tx.objectStore(STORES.CASES).get(caseId));
      if (!caseItem) return;
      const agendas = await reqComoPromise(tx.objectStore(STORES.AGENDAS).index('caseId').getAll(caseId));
      const ocorrencias = await reqComoPromise(tx.objectStore(STORES.OCORRENCIAS).index('caseId').getAll(caseId));
      const historicos = await reqComoPromise(tx.objectStore(STORES.HISTORICOS).index('caseId').getAll(caseId));
      const comentarios = await reqComoPromise(tx.objectStore(STORES.COMENTARIOS).index('caseId').getAll(caseId));
      const anexosStore = tx.objectStore(STORES.ANEXOS);
      for (const comentario of comentarios) {
        const anexos = await reqComoPromise(anexosStore.index('ownerType_ownerId').getAll(['caseComment', comentario.id]));
        for (const anexo of anexos) await reqComoPromise(anexosStore.delete(anexo.id));
        await reqComoPromise(tx.objectStore(STORES.COMENTARIOS).delete(comentario.id));
      }
      for (const item of agendas) await reqComoPromise(tx.objectStore(STORES.AGENDAS).delete(item.id));
      for (const item of ocorrencias) await reqComoPromise(tx.objectStore(STORES.OCORRENCIAS).delete(item.id));
      for (const item of historicos) await reqComoPromise(tx.objectStore(STORES.HISTORICOS).delete(item.id));
      await reqComoPromise(tx.objectStore(STORES.CASES).delete(caseId));
    },
  );
}

export async function listarOcorrenciasAbertas() {
  const cases = new Map((await obterTodos(STORES.CASES)).map((c) => [c.id, c]));
  const todas = (await Promise.all([
    obterTodosPorIndice(STORES.OCORRENCIAS, 'estado', ESTADOS_OCORRENCIA.PENDENTE),
    obterTodosPorIndice(STORES.OCORRENCIAS, 'estado', ESTADOS_OCORRENCIA.ATRASADA),
    obterTodosPorIndice(STORES.OCORRENCIAS, 'estado', ESTADOS_OCORRENCIA.ADIADA),
  ])).flat();
  const agora = new Date();
  return todas
    .filter((o) => caseAtivo(cases.get(o.caseId)))
    .map((o) => {
      const item = { ...o, case: cases.get(o.caseId) };
      const vencimento = new Date(vencimentoEfetivo(item));
      if (item.estado === ESTADOS_OCORRENCIA.ATRASADA && !Number.isNaN(vencimento.getTime()) && agora < vencimento) {
        item.estado = item.adiadoPara ? ESTADOS_OCORRENCIA.ADIADA : ESTADOS_OCORRENCIA.PENDENTE;
      }
      return item;
    })
    .sort((a, b) => vencimentoEfetivo(a).localeCompare(vencimentoEfetivo(b)));
}

// -----------------------------------------------------------------------------
// Macros de mensagem
// -----------------------------------------------------------------------------

export async function salvarModelo({ id, nome, conteudo, favorita }, relogio = () => new Date()) {
  const instante = relogio().toISOString();
  const atual = id ? await obter(STORES.MODELOS, id) : null;
  const registro = {
    id: id ?? novoId(),
    nome: String(nome ?? '').trim(),
    conteudo: String(conteudo ?? ''),
    ativo: true,
    favorita: favorita == null ? atual?.favorita === true : Boolean(favorita),
    excluidoEm: null,
    criadoEm: atual?.criadoEm ?? instante,
    atualizadoEm: instante,
  };
  if (!registro.nome) throw new Error('O nome do modelo é obrigatório.');
  if (!registro.conteudo) throw new Error('O conteúdo do modelo é obrigatório.');
  await salvar(STORES.MODELOS, registro);
  return registro.id;
}

export async function listarModelos() {
  return (await obterTodos(STORES.MODELOS))
    .filter((m) => m.ativo !== false && !m.excluidoEm)
    .sort((a, b) => {
      const favorita = Number(b.favorita === true) - Number(a.favorita === true);
      if (favorita !== 0) return favorita;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

export async function obterModelo(id) {
  const modelo = await obter(STORES.MODELOS, id);
  return modelo && !modelo.excluidoEm ? modelo : null;
}

export async function definirModeloFavorito(id, favorita, relogio = () => new Date()) {
  const modelo = await obter(STORES.MODELOS, id);
  if (!modelo || modelo.ativo === false || modelo.excluidoEm) throw new Error('Macro não encontrada.');
  modelo.favorita = Boolean(favorita);
  modelo.atualizadoEm = relogio().toISOString();
  await salvar(STORES.MODELOS, modelo);
  return modelo;
}

export async function excluirModelo(id, relogio = () => new Date()) {
  const modelo = await obter(STORES.MODELOS, id);
  if (!modelo || modelo.excluidoEm) return;
  const instante = relogio().toISOString();
  modelo.excluidoEm = instante;
  modelo.atualizadoEm = instante;
  await salvar(STORES.MODELOS, modelo);
}



export async function marcarCaseResolvido(caseId, { origem = 'GERAL', relogio = () => new Date() } = {}) {
  const atual = await obter(STORES.CASES, caseId);
  if (!atual) throw new Error('Case não encontrado.');
  if (atual.situacao === 'Resolvido') return atual;
  const origemNormalizada = origem === 'GMUD' ? 'GMUD' : 'GERAL';
  return editarCase(caseId, { situacao: 'Resolvido', origemResolucao: origemNormalizada }, relogio);
}

export async function reabrirCaseResolvido(caseId, situacao = 'Em análise', relogio = () => new Date()) {
  if (SITUACOES_FINAIS.has(situacao)) throw new Error('Selecione uma situação ativa para reabrir o case.');
  return editarCase(caseId, { situacao }, relogio);
}

export async function classificarResolvidosLegados() {
  const cases = (await obterTodos(STORES.CASES)).filter((c) => !c.excluidoEm && c.situacao === 'Resolvido' && !c.origemResolucao);
  let atualizados = 0;

  for (const caseItem of cases) {
    const historicos = await obterTodosPorIndice(STORES.HISTORICOS, 'caseId', caseItem.id);
    const finalizacao = historicos
      .filter((h) => h.tipoEvento === 'CASE_FINALIZADO')
      .sort((a, b) => String(b.ocorridoEm).localeCompare(String(a.ocorridoEm)))[0];
    const situacaoAnterior = finalizacao?.dadosAnteriores?.situacao ?? null;
    caseItem.origemResolucao = situacaoAnterior === 'Aguardando GMUD' ? 'GMUD' : 'GERAL';
    await salvar(STORES.CASES, caseItem);
    atualizados += 1;
  }

  return atualizados;
}

export async function purgarResolvidosAntigos({ dias = 15, relogio = () => new Date() } = {}) {
  const agora = relogio();
  const limite = agora.getTime() - dias * 86_400_000;
  const cases = await obterTodos(STORES.CASES);
  const antigos = cases.filter((c) => {
    if (c.excluidoEm || c.situacao !== 'Resolvido') return false;
    const referencia = Date.parse(c.finalizadoEm ?? c.atualizadoEm ?? c.criadoEm ?? '');
    return Number.isFinite(referencia) && referencia <= limite;
  });

  for (const item of antigos) await excluirCase(item.id);
  return antigos.length;
}

// -----------------------------------------------------------------------------
// Biblioteca de Queries SQL
// -----------------------------------------------------------------------------

function normalizarTagsQuery(tags) {
  const origem = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  const unicas = [];
  const vistos = new Set();
  for (const tag of origem) {
    const valor = String(tag ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const chave = valor.toLocaleLowerCase('pt-BR');
    if (!valor || vistos.has(chave)) continue;
    vistos.add(chave);
    unicas.push(valor);
    if (unicas.length >= 12) break;
  }
  return unicas;
}

export async function salvarQuerySql({ id, nome, descricao, query, tags, favorita }, relogio = () => new Date()) {
  const instante = relogio().toISOString();
  const atual = id ? await obter(STORES.QUERIES, id) : null;
  const registro = {
    id: id ?? novoId(),
    nome: String(nome ?? '').trim(),
    descricao: String(descricao ?? '').trim(),
    query: String(query ?? '').trim(),
    tags: normalizarTagsQuery(tags ?? atual?.tags ?? []),
    favorita: favorita == null ? atual?.favorita === true : Boolean(favorita),
    excluidoEm: null,
    criadoEm: atual?.criadoEm ?? instante,
    atualizadoEm: instante,
  };
  if (!registro.nome) throw new Error('O nome da query é obrigatório.');
  if (registro.nome.length > 500) throw new Error('O nome da query é muito longo.');
  if (registro.descricao.length > 20000) throw new Error('A descrição da query é muito longa.');
  if (!registro.query) throw new Error('A query SQL é obrigatória.');
  if (registro.query.length > 100000) throw new Error('A query SQL excede o limite permitido.');
  await salvar(STORES.QUERIES, registro);
  return registro.id;
}

export async function listarQueriesSql() {
  return (await obterTodos(STORES.QUERIES))
    .filter((q) => !q.excluidoEm)
    .sort((a, b) => {
      const favorita = Number(b.favorita === true) - Number(a.favorita === true);
      if (favorita !== 0) return favorita;
      return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm));
    });
}

export async function obterQuerySql(id) {
  const query = await obter(STORES.QUERIES, id);
  return query && !query.excluidoEm ? query : null;
}

export async function definirQueryFavorita(id, favorita, relogio = () => new Date()) {
  const query = await obter(STORES.QUERIES, id);
  if (!query || query.excluidoEm) throw new Error('Query não encontrada.');
  query.favorita = Boolean(favorita);
  query.atualizadoEm = relogio().toISOString();
  await salvar(STORES.QUERIES, query);
  return query;
}

export async function excluirQuerySql(id, relogio = () => new Date()) {
  const query = await obter(STORES.QUERIES, id);
  if (!query || query.excluidoEm) return;
  const instante = relogio().toISOString();
  query.excluidoEm = instante;
  query.atualizadoEm = instante;
  await salvar(STORES.QUERIES, query);
}



// -----------------------------------------------------------------------------
// Anotações e comentários
// -----------------------------------------------------------------------------

export async function salvarAnotacao({ id, titulo, conteudo, favorita }, relogio = () => new Date()) {
  const instante = relogio().toISOString();
  const atual = id ? await obter(STORES.ANOTACOES, id) : null;
  const registro = {
    id: id ?? novoId(),
    titulo: String(titulo ?? '').trim(),
    conteudo: String(conteudo ?? ''),
    // Mantemos palavrasChave apenas para compatibilidade com backups antigos.
    // Novas anotações não exigem mais cadastro manual de tags.
    palavrasChave: Array.isArray(atual?.palavrasChave) ? atual.palavrasChave : [],
    favorita: favorita == null ? atual?.favorita === true : Boolean(favorita),
    excluidoEm: null,
    criadoEm: atual?.criadoEm ?? instante,
    atualizadoEm: instante,
  };
  if (!registro.titulo) throw new Error('O título da anotação é obrigatório.');
  if (registro.titulo.length > 500) throw new Error('O título da anotação é muito longo.');
  if (registro.conteudo.length > 50000) throw new Error('A anotação excede o limite de texto permitido.');
  await salvar(STORES.ANOTACOES, registro);
  return registro.id;
}

export async function listarAnotacoes() {
  return (await obterTodos(STORES.ANOTACOES))
    .filter((a) => !a.excluidoEm)
    .sort((a, b) => {
      const favorita = Number(b.favorita === true) - Number(a.favorita === true);
      if (favorita !== 0) return favorita;
      return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm));
    });
}

export async function definirAnotacaoFavorita(id, favorita, relogio = () => new Date()) {
  const anotacao = await obter(STORES.ANOTACOES, id);
  if (!anotacao || anotacao.excluidoEm) throw new Error('Anotação não encontrada.');
  anotacao.favorita = Boolean(favorita);
  anotacao.atualizadoEm = relogio().toISOString();
  await salvar(STORES.ANOTACOES, anotacao);
  return anotacao;
}

export async function obterAnotacao(id) {
  const anotacao = await obter(STORES.ANOTACOES, id);
  return anotacao && !anotacao.excluidoEm ? anotacao : null;
}

export async function excluirAnotacao(id, relogio = () => new Date()) {
  const anotacao = await obter(STORES.ANOTACOES, id);
  if (!anotacao || anotacao.excluidoEm) return;
  const instante = relogio().toISOString();
  anotacao.excluidoEm = instante;
  anotacao.atualizadoEm = instante;
  await salvar(STORES.ANOTACOES, anotacao);
}

export async function adicionarComentarioCase({ caseId, texto }, relogio = () => new Date()) {
  const caseItem = await obter(STORES.CASES, caseId);
  if (!caseItem) throw new Error('Case não encontrado.');
  const instante = relogio().toISOString();
  const registro = {
    id: novoId(),
    caseId,
    texto: String(texto ?? '').trim(),
    criadoEm: instante,
    atualizadoEm: instante,
  };
  if (registro.texto.length > 30000) throw new Error('O comentário excede o limite de texto permitido.');
  await salvar(STORES.COMENTARIOS, registro);
  return registro.id;
}

export async function listarComentariosCase(caseId) {
  return (await obterTodosPorIndice(STORES.COMENTARIOS, 'caseId', caseId))
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

export async function excluirComentarioCase(id) {
  const comentario = await obter(STORES.COMENTARIOS, id);
  if (!comentario) return;
  return executarTransacao([STORES.COMENTARIOS, STORES.ANEXOS], 'readwrite', async (tx) => {
    const anexosStore = tx.objectStore(STORES.ANEXOS);
    const anexos = await reqComoPromise(anexosStore.index('ownerType_ownerId').getAll(['caseComment', id]));
    for (const anexo of anexos) await reqComoPromise(anexosStore.delete(anexo.id));
    await reqComoPromise(tx.objectStore(STORES.COMENTARIOS).delete(id));
  });
}


// -----------------------------------------------------------------------------
// Lixeira e retenção
// -----------------------------------------------------------------------------

export async function moverCaseParaLixeira(caseId, relogio = () => new Date()) {
  const caseItem = await obter(STORES.CASES, caseId);
  if (!caseItem || caseItem.excluidoEm) return caseItem ?? null;
  const instante = relogio().toISOString();
  caseItem.excluidoEm = instante;
  caseItem.atualizadoEm = instante;

  // Um case na Lixeira deixa de participar da agenda. Cancelamos somente
  // ocorrências ainda abertas; ocorrências confirmadas e canceladas permanecem
  // preservadas como histórico operacional.
  await executarTransacao([STORES.CASES, STORES.OCORRENCIAS, STORES.HISTORICOS], 'readwrite', async (tx) => {
    await reqComoPromise(tx.objectStore(STORES.CASES).put(caseItem));
    const ocorrenciasStore = tx.objectStore(STORES.OCORRENCIAS);
    const ocorrencias = await reqComoPromise(ocorrenciasStore.index('caseId').getAll(caseId));
    for (const ocorrencia of ocorrencias) {
      if (!ESTADOS_TERMINAIS.has(ocorrencia.estado)) {
        ocorrencia.estado = ESTADOS_OCORRENCIA.CANCELADA;
        ocorrencia.motivoCancelamento = 'CASE_LIXEIRA';
        ocorrencia.atualizadoEm = instante;
        await reqComoPromise(ocorrenciasStore.put(ocorrencia));
      }
    }
    await reqComoPromise(tx.objectStore(STORES.HISTORICOS).add(
      criarHistorico(caseId, 'CASE_MOVIDO_LIXEIRA', null, { excluidoEm: instante }, instante),
    ));
  });
  return caseItem;
}

export async function listarItensLixeira() {
  const [cases, modelos, anotacoes, queries] = await Promise.all([
    obterTodos(STORES.CASES),
    obterTodos(STORES.MODELOS),
    obterTodos(STORES.ANOTACOES),
    obterTodos(STORES.QUERIES),
  ]);
  const itens = [];
  for (const item of cases.filter((x) => x.excluidoEm)) itens.push({ tipo: 'case', id: item.id, titulo: `${item.protocolo} — ${item.titulo}`, excluidoEm: item.excluidoEm });
  for (const item of modelos.filter((x) => x.excluidoEm)) itens.push({ tipo: 'macro', id: item.id, titulo: item.nome, excluidoEm: item.excluidoEm });
  for (const item of anotacoes.filter((x) => x.excluidoEm)) itens.push({ tipo: 'anotacao', id: item.id, titulo: item.titulo, excluidoEm: item.excluidoEm });
  for (const item of queries.filter((x) => x.excluidoEm)) itens.push({ tipo: 'query', id: item.id, titulo: item.nome, excluidoEm: item.excluidoEm });
  return itens.sort((a, b) => String(b.excluidoEm).localeCompare(String(a.excluidoEm)));
}

export async function restaurarItemLixeira(tipo, id, relogio = () => new Date()) {
  const agora = relogio();
  const instante = agora.toISOString();
  const store = tipo === 'case' ? STORES.CASES : tipo === 'macro' ? STORES.MODELOS : tipo === 'anotacao' ? STORES.ANOTACOES : tipo === 'query' ? STORES.QUERIES : null;
  if (!store) throw new Error('Tipo de item inválido para restauração.');
  const item = await obter(store, id);
  if (!item || !item.excluidoEm) throw new Error('Item não encontrado na Lixeira.');

  item.excluidoEm = null;
  item.atualizadoEm = instante;
  if (tipo === 'macro') item.ativo = true;

  if (tipo !== 'case') {
    await salvar(store, item);
    return item;
  }

  // Ao restaurar um case ativo, não ressuscitamos lembretes que venceram
  // enquanto ele estava excluído. A agenda volta a contar a partir de agora.
  await executarTransacao([STORES.CASES, STORES.AGENDAS, STORES.HISTORICOS], 'readwrite', async (tx) => {
    await reqComoPromise(tx.objectStore(STORES.CASES).put(item));
    const agendasStore = tx.objectStore(STORES.AGENDAS);
    const agendas = await reqComoPromise(agendasStore.index('caseId').getAll(id));
    if (!SITUACOES_FINAIS.has(item.situacao)) {
      for (const agenda of agendas) {
        if (!agenda.ativa) continue;
        agenda.gerarApartirDe = instante;
        agenda.atualizadoEm = instante;
        await reqComoPromise(agendasStore.put(agenda));
      }
    }
    await reqComoPromise(tx.objectStore(STORES.HISTORICOS).add(
      criarHistorico(id, 'CASE_RESTAURADO_LIXEIRA', null, { restauradoEm: instante }, instante),
    ));
  });

  if (!SITUACOES_FINAIS.has(item.situacao)) await reconciliarCase(id, () => agora);
  return item;
}

async function excluirModeloDefinitivo(id) {
  await executarTransacao([STORES.MODELOS], 'readwrite', (tx) => reqComoPromise(tx.objectStore(STORES.MODELOS).delete(id)));
}

async function excluirQueryDefinitivo(id) {
  await executarTransacao([STORES.QUERIES], 'readwrite', (tx) => reqComoPromise(tx.objectStore(STORES.QUERIES).delete(id)));
}

async function excluirAnotacaoDefinitivo(id) {
  return executarTransacao([STORES.ANOTACOES, STORES.ANEXOS], 'readwrite', async (tx) => {
    const anotacao = await reqComoPromise(tx.objectStore(STORES.ANOTACOES).get(id));
    if (!anotacao) return;
    const anexosStore = tx.objectStore(STORES.ANEXOS);
    const anexos = await reqComoPromise(anexosStore.index('ownerType_ownerId').getAll(['note', id]));
    for (const anexo of anexos) await reqComoPromise(anexosStore.delete(anexo.id));
    await reqComoPromise(tx.objectStore(STORES.ANOTACOES).delete(id));
  });
}

export async function excluirItemLixeiraDefinitivamente(tipo, id) {
  if (tipo === 'case') return excluirCase(id);
  if (tipo === 'macro') return excluirModeloDefinitivo(id);
  if (tipo === 'anotacao') return excluirAnotacaoDefinitivo(id);
  if (tipo === 'query') return excluirQueryDefinitivo(id);
  throw new Error('Tipo de item inválido para exclusão definitiva.');
}

export async function purgarLixeiraAntiga({ dias = 7, relogio = () => new Date() } = {}) {
  const agora = relogio().getTime();
  const limite = agora - dias * 86_400_000;
  const itens = await listarItensLixeira();
  const antigos = itens.filter((item) => {
    const data = Date.parse(item.excluidoEm ?? '');
    return Number.isFinite(data) && data <= limite;
  });
  for (const item of antigos) await excluirItemLixeiraDefinitivamente(item.tipo, item.id);
  return antigos.length;
}

export async function diagnosticoLocal() {
  let indexedDBDisponivel = false;
  let ultimoBackup = null;

  try {
    await abrirBanco();
    indexedDBDisponivel = true;
    ultimoBackup = await obter(STORES.METADADOS, 'ultimoBackupEm');
  } catch (erro) {
    console.warn('IndexedDB indisponível:', erro);
  }

  return {
    indexedDBDisponivel,
    notificacoes: 'Notification' in window ? Notification.permission : 'indisponível',
    ultimoBackupEm: ultimoBackup?.valor ?? null,
  };
}
