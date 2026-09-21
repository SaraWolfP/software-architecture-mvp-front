/**
 * app.js
 * Ponto de entrada da aplicação: registra os handlers de todos os módulos
 * e executa a carga inicial.
 *
 * Carregado por último, depois de api.js, grafico.js, indicadores.js,
 * financiamentos.js, amortizacoes.js e simulacoes.js — a ordem das tags
 * <script> no index.html importa, já que os módulos compartilham funções
 * pelo escopo global.
 */

/* ── Toast global ───────────────────────────────────────────── */

/**
 * Exibe um toast de feedback no canto inferior direito.
 *
 * @param {string} mensagem - Texto a exibir
 * @param {'success'|'danger'|'warning'|'info'} [tipo='success']
 */
function mostrarToast(mensagem, tipo = 'success') {
  const toastEl = document.getElementById('app-toast');
  const msgEl = document.getElementById('toast-mensagem');
  if (!toastEl || !msgEl) return;

  toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-dark');
  toastEl.classList.add(`bg-${tipo}`);
  toastEl.classList.toggle('text-dark', tipo === 'warning');

  msgEl.textContent = mensagem;

  // Mensagens de erro ficam mais tempo na tela: costumam ser mais longas.
  const duracao = tipo === 'danger' ? 6000 : 3500;
  bootstrap.Toast.getOrCreateInstance(toastEl, { delay: duracao }).show();
}

/* ── Ajustes de ambiente ────────────────────────────────────── */

/**
 * Aponta o link do Swagger para o host correto.
 *
 * Servido por nginx, a API fica atrás do proxy em /api; aberto em
 * desenvolvimento, fica no Flask em 127.0.0.1:5000.
 */
function ajustarLinkSwagger() {
  const link = document.getElementById('link-swagger');
  if (!link) return;

  link.href = API_BASE.startsWith('http')
    ? `${API_BASE}/apidocs`
    : `${window.location.origin}/api/apidocs`;
}

/* ── Inicialização ──────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  // Estados iniciais: as tabelas só aparecem quando têm conteúdo.
  ['tabela-financiamentos', 'tabela-amortizacoes', 'tabela-simulacoes']
    .forEach((id) => {
      const tabela = document.getElementById(id);
      if (tabela) tabela.style.display = 'none';
    });

  ajustarLinkSwagger();

  // Troca os <input type="month"> pelos seletores de mês e ano. Precisa vir
  // antes dos handlers, que guardam referência aos campos.
  instalarSeletoresDeCompetencia();

  // Handlers de formulários e controles.
  registrarFormFinanciamento();
  registrarEdicaoFinanciamento();
  registrarControlesLista();
  registrarFormAmortizacao();
  registrarFormSimulacao();
  registrarBotaoIndicadores();
  registrarSwitchComposicao();

  // Carga inicial. Os indicadores vêm da componente externa e podem demorar,
  // então não bloqueiam a lista de financiamentos.
  await Promise.all([
    recarregarFinanciamentos(),
    recarregarIndicadores(),
  ]);
});
