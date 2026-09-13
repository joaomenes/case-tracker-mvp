/**
 * Orquestração das notificações no navegador.
 *
 * Quando o agente local do Windows está ativo ele assume os alertas em segundo
 * plano; caso contrário, este módulo usa Service Worker + Notifications API.
 */

import { avaliarOcorrencias, marcarNotificada, reconciliarTodos } from './domain.js';
import { obterStatusAgenteLocal } from './backup.js';

let emExecucao = false;
let intervaloId = null;

export async function solicitarPermissaoNotificacao() {
  if (!('Notification' in window)) throw new Error('Este navegador não oferece suporte à Notifications API.');
  return Notification.requestPermission();
}

async function registroServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
}

async function exibirNotificacao(item) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const registro = await registroServiceWorker();
  if (!registro) return false;
  await registro.showNotification(`Case ${item.case.protocolo}`, {
    body: `${item.case.prioridade} • atualização pendente`,
    tag: `case-occ-${item.ocorrencia.id}`,
    renotify: false,
    data: { url: `./#case=${encodeURIComponent(item.case.id)}` },
  });
  await marcarNotificada(item.ocorrencia.id);
  return true;
}

export async function cicloLembretes(onAtualizacao) {
  if (emExecucao) return;
  emExecucao = true;
  try {
    await reconciliarTodos();
    try {
      const agente = await obterStatusAgenteLocal();
      if (agente?.ativo) {
        await onAtualizacao?.();
        return;
      }
    } catch {
      // Sem agente local disponível: mantém o comportamento padrão pelo navegador.
    }
    const notificaveis = await avaliarOcorrencias();
    for (const item of notificaveis) {
      try {
        await exibirNotificacao(item);
      } catch (erro) {
        console.warn('Falha ao exibir notificação:', erro);
      }
    }
    await onAtualizacao?.();
  } finally {
    emExecucao = false;
  }
}

export function iniciarMotorLembretes(onAtualizacao) {
  const executar = () => cicloLembretes(onAtualizacao).catch((erro) => console.error('Falha no ciclo de lembretes:', erro));
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === 'visible') executar();
  };
  executar();
  intervaloId = window.setInterval(executar, 60_000);
  window.addEventListener('focus', executar);
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  return () => {
    if (intervaloId) window.clearInterval(intervaloId);
    intervaloId = null;
    window.removeEventListener('focus', executar);
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
  };
}
