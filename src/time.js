/**
 * Utilitários de data, hora e recorrência.
 *
 * Todas as regras de agenda são calculadas no fuso `America/Sao_Paulo` e
 * aceitam tanto recorrência de segunda a sexta quanto de todos os dias.
 */

import { TIME_ZONE } from './constants.js';

const formatterCache = new Map();

function formatter(timeZone = TIME_ZONE) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(
      timeZone,
      new Intl.DateTimeFormat('pt-BR', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formatterCache.get(timeZone);
}

export function agoraIso(relogio = () => new Date()) {
  return relogio().toISOString();
}

export function partesNoFuso(data, timeZone = TIME_ZONE) {
  const valores = {};
  for (const parte of formatter(timeZone).formatToParts(data)) {
    if (parte.type !== 'literal') valores[parte.type] = Number(parte.value);
  }
  return {
    ano: valores.year,
    mes: valores.month,
    dia: valores.day,
    hora: valores.hour,
    minuto: valores.minute,
    segundo: valores.second,
  };
}

function offsetMs(data, timeZone = TIME_ZONE) {
  const p = partesNoFuso(data, timeZone);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - data.getTime();
}

export function horarioLocalParaUtc({ ano, mes, dia, hora, minuto }, timeZone = TIME_ZONE) {
  const alvoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, 0, 0);
  let estimativa = alvoUtc;

  // Duas a três iterações convergem mesmo em mudanças de offset.
  for (let i = 0; i < 3; i += 1) {
    estimativa = alvoUtc - offsetMs(new Date(estimativa), timeZone);
  }

  const resultado = new Date(estimativa);
  const volta = partesNoFuso(resultado, timeZone);
  const valido =
    volta.ano === ano &&
    volta.mes === mes &&
    volta.dia === dia &&
    volta.hora === hora &&
    volta.minuto === minuto;

  if (!valido) {
    throw new RangeError('O horário local informado não existe no fuso configurado.');
  }

  return resultado;
}

export function parseHorario(horario) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(horario));
  if (!match) throw new TypeError('Horário inválido. Use HH:mm.');
  const hora = Number(match[1]);
  const minuto = Number(match[2]);
  if (hora > 23 || minuto > 59) throw new RangeError('Horário fora da faixa permitida.');
  return { hora, minuto };
}

export function diaSemana({ ano, mes, dia }) {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export function adicionarDiasCalendario({ ano, mes, dia }, quantidade) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + quantidade);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

export function normalizarDiasPermitidos(diasSemana) {
  const validos = [...new Set((Array.isArray(diasSemana) ? diasSemana : [])
    .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6))].sort((a, b) => a - b);
  return validos.length ? validos : [1, 2, 3, 4, 5];
}

export function diaPermitido(data, diasSemana, timeZone = TIME_ZONE) {
  const base = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(base.getTime())) return false;
  return normalizarDiasPermitidos(diasSemana).includes(diaSemana(partesNoFuso(base, timeZone)));
}

export function ajustarParaDiasPermitidos(data, diasSemana, timeZone = TIME_ZONE) {
  const base = data instanceof Date ? new Date(data.getTime()) : new Date(data);
  if (Number.isNaN(base.getTime())) throw new TypeError('Data inválida.');
  const permitidos = normalizarDiasPermitidos(diasSemana);
  if (permitidos.includes(diaSemana(partesNoFuso(base, timeZone)))) return base;

  const local = partesNoFuso(base, timeZone);
  let calendario = { ano: local.ano, mes: local.mes, dia: local.dia };
  do {
    calendario = adicionarDiasCalendario(calendario, 1);
  } while (!permitidos.includes(diaSemana(calendario)));
  return horarioLocalParaUtc({ ...calendario, hora: local.hora, minuto: local.minuto }, timeZone);
}

export function proximaOcorrenciaDaAgenda(agenda, depoisDe, { inclusive = false } = {}) {
  const base = depoisDe instanceof Date ? depoisDe : new Date(depoisDe);
  if (Number.isNaN(base.getTime())) throw new TypeError('Data-base inválida.');

  const { hora, minuto } = parseHorario(agenda.horario);
  const diasValidos = new Set(normalizarDiasPermitidos(agenda.diasSemana));
  const inicioLocal = partesNoFuso(base);
  let calendario = { ano: inicioLocal.ano, mes: inicioLocal.mes, dia: inicioLocal.dia };

  for (let salto = 0; salto <= 370; salto += 1) {
    if (salto > 0) calendario = adicionarDiasCalendario(calendario, 1);
    if (!diasValidos.has(diaSemana(calendario))) continue;

    const candidato = horarioLocalParaUtc({ ...calendario, hora, minuto });
    const comparacao = candidato.getTime() - base.getTime();
    if ((inclusive && comparacao >= 0) || (!inclusive && comparacao > 0)) return candidato;
  }

  throw new Error('Não foi possível localizar uma próxima ocorrência em até 370 dias.');
}

export function formatarDataHora(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return 'Data inválida';

  // A formatação é montada manualmente para evitar sufixos inesperados
  // do Intl em diferentes versões do Chromium/Windows. Como proteção
  // adicional, qualquer marcador textual nulo é removido do resultado.
  const p = partesNoFuso(data);
  const dd = String(p.dia ?? '').padStart(2, '0');
  const mm = String(p.mes ?? '').padStart(2, '0');
  const yyyy = String(p.ano ?? '');
  const hh = String(p.hora ?? '').padStart(2, '0');
  const min = String(p.minuto ?? '').padStart(2, '0');
  const resultado = `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
  return resultado.replace(/(?:null|undefined)+$/gi, '').trim();
}

export function somarMinutos(isoOuData, minutos) {
  const data = isoOuData instanceof Date ? isoOuData : new Date(isoOuData);
  if (Number.isNaN(data.getTime())) throw new TypeError('Data inválida.');
  return new Date(data.getTime() + minutos * 60_000);
}

export function inicioDoDiaNoFuso(data = new Date()) {
  const p = partesNoFuso(data);
  return horarioLocalParaUtc({ ano: p.ano, mes: p.mes, dia: p.dia, hora: 0, minuto: 0 });
}

export function fimDoDiaNoFuso(data = new Date()) {
  const inicio = inicioDoDiaNoFuso(data);
  const p = partesNoFuso(inicio);
  const amanha = adicionarDiasCalendario({ ano: p.ano, mes: p.mes, dia: p.dia }, 1);
  return new Date(horarioLocalParaUtc({ ...amanha, hora: 0, minuto: 0 }).getTime() - 1);
}

export function datetimeLocalNoFusoParaIso(valor) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(valor ?? ''));
  if (!match) throw new Error('Data/hora inválida. Use AAAA-MM-DDTHH:mm.');
  return horarioLocalParaUtc({
    ano: Number(match[1]),
    mes: Number(match[2]),
    dia: Number(match[3]),
    hora: Number(match[4]),
    minuto: Number(match[5]),
  }).toISOString();
}
