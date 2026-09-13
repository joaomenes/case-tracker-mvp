/** Aplica o tema salvo antes do carregamento da aplicação para evitar flash visual. */
(function () {
  'use strict';
  const CHAVE_TEMA = 'case-tracker-theme';
  let tema = 'light';
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (salvo === 'dark' || salvo === 'light') tema = salvo;
  } catch {
    // A interface continua em tema claro quando o armazenamento não está disponível.
  }
  document.documentElement.dataset.theme = tema;
})();
