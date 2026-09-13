/**
 * Validações de entrada e normalização de dados do domínio.
 *
 * A validação ocorre antes da persistência para evitar registros incompletos,
 * protocolos duplicáveis por caixa/espaço e agendas com dias inválidos.
 */

import {
  DIAS_UTEIS_PADRAO,
  HORARIOS_PADRAO,
  LIMITES_BACKUP,
  PRIORIDADES,
  SITUACOES,
} from './constants.js';
import { parseHorario } from './time.js';

export function normalizarProtocolo(valor) {
  return String(valor ?? '').trim().toUpperCase();
}

export function validarProtocolo(valor) {
  const normalizado = normalizarProtocolo(valor);
  if (!normalizado.startsWith('CS')) {
    throw new Error('O protocolo deve iniciar por CS.');
  }
  return normalizado;
}

export function textoLimitado(valor, limite, campo, { obrigatorio = false } = {}) {
  const texto = String(valor ?? '').trim();
  if (obrigatorio && !texto) throw new Error(`${campo} é obrigatório.`);
  if (texto.length > limite) throw new Error(`${campo} excede o limite de ${limite} caracteres.`);
  return texto;
}

export function validarAgenda(agenda) {
  const horario = String(agenda.horario ?? '');
  parseHorario(horario);
  const diasInformados = Array.isArray(agenda.diasSemana) ? [...new Set(agenda.diasSemana)] : [];
  if (diasInformados.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('A agenda contém dia inválido da semana.');
  }
  return {
    horario,
    diasSemana: (diasInformados.length ? diasInformados : [...DIAS_UTEIS_PADRAO]).sort((a, b) => a - b),
    ativa: agenda.ativa !== false,
  };
}

export function agendasPadrao() {
  return HORARIOS_PADRAO.map((horario) => ({ horario, diasSemana: [...DIAS_UTEIS_PADRAO], ativa: true }));
}

export function validarDadosCase(dados) {
  const protocoloNormalizado = validarProtocolo(dados.protocolo);
  const titulo = textoLimitado(dados.titulo, LIMITES_BACKUP.textoCurto, 'Título', { obrigatorio: true });
  const situacao = String(dados.situacao ?? '');
  const prioridade = String(dados.prioridade ?? '');
  if (!SITUACOES.includes(situacao)) throw new Error('Situação inválida.');
  if (!PRIORIDADES.includes(prioridade)) throw new Error('Prioridade inválida.');

  return {
    protocolo: protocoloNormalizado,
    protocoloNormalizado,
    titulo,
    resumo: textoLimitado(dados.resumo, LIMITES_BACKUP.textoLongo, 'Resumo'),
    situacao,
    prioridade,
    mensagem: textoLimitado(dados.mensagem, LIMITES_BACKUP.textoLongo, 'Mensagem'),
    observacoes: textoLimitado(dados.observacoes, LIMITES_BACKUP.textoLongo, 'Observações'),
  };
}

export function isoValido(valor) {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

export function objetoPlano(valor) {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const proto = Object.getPrototypeOf(valor);
  return proto === Object.prototype || proto === null;
}

const CHAVES_PERIGOSAS = new Set(['__proto__', 'prototype', 'constructor']);

export function rejeitarChavesPerigosas(valor, caminho = '$') {
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => rejeitarChavesPerigosas(item, `${caminho}[${i}]`));
    return;
  }
  if (!objetoPlano(valor)) return;
  for (const chave of Object.keys(valor)) {
    if (CHAVES_PERIGOSAS.has(chave)) throw new Error(`Chave não permitida no backup: ${caminho}.${chave}`);
    rejeitarChavesPerigosas(valor[chave], `${caminho}.${chave}`);
  }
}
