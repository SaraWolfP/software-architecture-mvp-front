/**
 * amortizacoes.js
 * Formulário, tabela e cards de resumo das amortizações extraordinárias.
 *
 * O mesmo formulário cria (POST) e edita (PUT) uma amortização, alternando
 * conforme `amortizacaoEmEdicao`. Depois de qualquer escrita, o back-end já
 * devolveu o cronograma reconstruído, e o painel é recarregado por inteiro.
 */

/** ID da amortização em edição, ou null quando o formulário está criando. @type {number|null} */
let amortizacaoEmEdicao = null;

/* ── Resumo ─────────────────────────────────────────────────── */

/**
 * Calcula os valores de resumo combinando parcelas e amortizações extras.
 * As amortizações são desembolsos reais fora do cronograma e entram nos totais.
 *
 * @param {Array<{data_parcela: string, valor_parcela: number}>} parcelas
 * @param {Array<{data_amortizacao: string, valor_amortizado: number}>} amortizacoes
 * @returns {{
 *   totalAPagar: number,
 *   numeroParcelas: number,
 *   totalPago: number,
 *   numeroPagas: number
 * }}
 */
function calcularResumo(parcelas, amortizacoes = []) {
  const hoje = new Date();
  const competenciaAtual =
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const futuras = parcelas.filter((p) => p.data_parcela >= competenciaAtual);
  const passadas = parcelas.filter((p) => p.data_parcela < competenciaAtual);

  const extrasPagas = amortizacoes
    .filter((a) => a.data_amortizacao < competenciaAtual)
    .reduce((soma, a) => soma + a.valor_amortizado, 0);

  const extrasFuturas = amortizacoes
    .filter((a) => a.data_amortizacao >= competenciaAtual)
    .reduce((soma, a) => soma + a.valor_amortizado, 0);

  return {
    totalAPagar: futuras.reduce((soma, p) => soma + p.valor_parcela, 0) + extrasFuturas,
    numeroParcelas: futuras.length,
    totalPago: passadas.reduce((soma, p) => soma + p.valor_parcela, 0) + extrasPagas,
    numeroPagas: passadas.length,
  };
}

/**
 * Atualiza os quatro cards de resumo na interface.
 *
 * @param {Array<Object>} parcelas
 * @param {Array<Object>} [amortizacoes=[]]
 * @param {Object} [resumoApi={}] - Totais vindos de GET /parcelas/resumo
 */
function atualizarResumo(parcelas, amortizacoes = [], resumoApi = {}) {
  const { totalAPagar, numeroParcelas, totalPago, numeroPagas } =
    calcularResumo(parcelas, amortizacoes);

  const el = (id) => document.getElementById(id);
  const fmt = formatarReais;

  if (el('resumo-total')) el('resumo-total').textContent = fmt(totalAPagar);
  if (el('resumo-parcelas')) el('resumo-parcelas').textContent = numeroParcelas;

  if (el('resumo-parcelas-sub')) {
    const plural = numeroParcelas !== 1 ? 's' : '';
    el('resumo-parcelas-sub').textContent = `Mese${plural} restante${plural}`;
  }

  // O total de juros vem do back-end, que decompõe cada parcela no cálculo.
  if (el('resumo-juros')) {
    el('resumo-juros').textContent = fmt(resumoApi.total_juros ?? 0);
  }

  if (el('resumo-total-pago')) el('resumo-total-pago').textContent = fmt(totalPago);

  if (el('resumo-pago-sub')) {
    const plural = numeroPagas !== 1 ? 's' : '';
    el('resumo-pago-sub').textContent = `${numeroPagas} parcela${plural} paga${plural}`;
  }
}

/* ── Tabela de amortizações ─────────────────────────────────── */

/**
 * Renderiza a tabela de amortizações de um financiamento.
 *
 * @param {Array<Object>} amortizacoes
 * @param {number} finId
 */
function renderizarTabelaAmortizacoes(amortizacoes, finId) {
  const tbody = document.getElementById('tbody-amortizacoes');
  const tabela = document.getElementById('tabela-amortizacoes');
  const vazio = document.getElementById('lista-amor-vazia');
  const badge = document.getElementById('badge-total-amor');
  if (!tbody) return;

  tbody.innerHTML = '';

  const temDados = amortizacoes.length > 0;
  vazio.style.display = temDados ? 'none' : '';
  tabela.style.display = temDados ? '' : 'none';
  badge.textContent = amortizacoes.length;

  const ordenadas = [...amortizacoes].sort((a, b) =>
    a.data_amortizacao.localeCompare(b.data_amortizacao)
  );

  ordenadas.forEach((amor) => {
    const tr = document.createElement('tr');

    const estiloTipo = amor.tipo === 'PARCELA'
      ? 'style="background:#e8fff0;color:#25a847;"'
      : 'style="background:#fff3e0;color:#e65100;"';

    tr.innerHTML = `
      <td>${escHtml(amor.data_amortizacao)}</td>
      <td class="fw-semibold">${formatarReais(amor.valor_amortizado)}</td>
      <td>
        <span class="badge" ${estiloTipo}>
          ${amor.tipo === 'PARCELA' ? '↓ Parcela' : '↓ Prazo'}
        </span>
      </td>
      <td class="text-end">
        <button class="btn-acao-sm btn-editar-amor" data-id="${amor.id}"
                title="Editar amortização" aria-label="Editar amortização de ${escHtml(amor.data_amortizacao)}">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-danger-sm btn-deletar-amor"
                data-fin-id="${finId}" data-amor-id="${amor.id}"
                title="Deletar amortização" aria-label="Deletar amortização de ${escHtml(amor.data_amortizacao)}">
          <i class="bi bi-trash3"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-editar-amor').forEach((btn) => {
    btn.addEventListener('click', () => {
      const amor = ordenadas.find((a) => a.id === Number(btn.dataset.id));
      if (amor) prepararEdicaoAmortizacao(amor);
    });
  });

  tbody.querySelectorAll('.btn-deletar-amor').forEach((btn) => {
    btn.addEventListener('click', () => {
      confirmarDeletarAmortizacao(Number(btn.dataset.finId), Number(btn.dataset.amorId));
    });
  });
}

/* ── Edição via PUT ─────────────────────────────────────────── */

/**
 * Preenche o formulário com uma amortização existente, para edição.
 *
 * @param {Object} amor
 */
function prepararEdicaoAmortizacao(amor) {
  amortizacaoEmEdicao = amor.id;

  document.getElementById('amor-valor').value = amor.valor_amortizado;
  document.getElementById('amor-data').value = amor.data_amortizacao;
  document.getElementById('amor-tipo').value = amor.tipo;

  document.getElementById('header-form-amortizacao').innerHTML =
    '<i class="bi bi-pencil-square me-2"></i>Editar Amortização';

  const botao = document.getElementById('btn-amortizar');
  botao.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar alterações';
  botao.classList.replace('btn-success', 'btn-warning');

  document.getElementById('btn-cancelar-edicao-amor')?.classList.remove('d-none');
  document.getElementById('form-amortizacao')?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
}

/**
 * Devolve o formulário de amortização ao modo de criação.
 */
function cancelarEdicaoAmortizacao() {
  amortizacaoEmEdicao = null;

  document.getElementById('form-amortizacao')?.reset();
  document.getElementById('header-form-amortizacao').innerHTML =
    '<i class="bi bi-plus-circle-fill me-2"></i>Nova Amortização';

  const botao = document.getElementById('btn-amortizar');
  botao.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Adicionar Amortização';
  botao.classList.replace('btn-warning', 'btn-success');

  document.getElementById('btn-cancelar-edicao-amor')?.classList.add('d-none');
  document.getElementById('amor-erro')?.classList.add('d-none');
}

/* ── Formulário ─────────────────────────────────────────────── */

/**
 * Registra o handler do formulário de amortização (POST e PUT).
 */
function registrarFormAmortizacao() {
  const form = document.getElementById('form-amortizacao');
  const erroEl = document.getElementById('amor-erro');
  const btnEl = document.getElementById('btn-amortizar');

  document.getElementById('btn-cancelar-edicao-amor')
    ?.addEventListener('click', cancelarEdicaoAmortizacao);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erroEl.classList.add('d-none');

    const mostrarErro = (mensagem) => {
      erroEl.textContent = mensagem;
      erroEl.classList.remove('d-none');
    };

    if (!financiamentoSelecionadoId) {
      mostrarErro('Nenhum financiamento selecionado.');
      return;
    }

    const valor = parseFloat(document.getElementById('amor-valor').value);
    const data = document.getElementById('amor-data').value;
    const tipo = document.getElementById('amor-tipo').value;

    if (Number.isNaN(valor) || valor <= 0) {
      mostrarErro('Informe um valor válido.');
      return;
    }
    if (!data) {
      mostrarErro('Informe a competência da amortização.');
      return;
    }

    const rotuloOriginal = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Recalculando…';

    const corpo = {
      valor_amortizado: valor,
      data_amortizacao: data,
      tipo,
    };

    try {
      const resposta = amortizacaoEmEdicao
        ? await atualizarAmortizacao(financiamentoSelecionadoId, amortizacaoEmEdicao, corpo)
        : await criarAmortizacao(financiamentoSelecionadoId, corpo);

      const acao = amortizacaoEmEdicao ? 'atualizada' : 'registrada';
      cancelarEdicaoAmortizacao();

      mostrarToast(
        `Amortização ${acao} — cronograma agora tem ${resposta.parcelas_geradas} parcelas.`,
        'success'
      );

      await recarregarPainelPosAmortizacao(financiamentoSelecionadoId);
    } catch (falha) {
      mostrarErro(falha.message);
      btnEl.innerHTML = rotuloOriginal;
    } finally {
      btnEl.disabled = false;
    }
  });
}

/* ── Deleção ────────────────────────────────────────────────── */

/**
 * Pede confirmação e remove uma amortização.
 *
 * @param {number} finId
 * @param {number} amorId
 */
async function confirmarDeletarAmortizacao(finId, amorId) {
  if (!confirm('Remover esta amortização?\nAs parcelas serão recalculadas.')) return;

  try {
    const resposta = await deletarAmortizacao(finId, amorId);

    if (amortizacaoEmEdicao === amorId) cancelarEdicaoAmortizacao();

    mostrarToast(
      `Amortização removida — cronograma voltou a ${resposta.parcelas_geradas} parcelas.`,
      'success'
    );

    await recarregarPainelPosAmortizacao(finId);
  } catch (erro) {
    mostrarToast(`Erro ao deletar amortização: ${erro.message}`, 'danger');
  }
}

/* ── Recarga do painel ──────────────────────────────────────── */

/**
 * Recarrega parcelas, amortizações, resumo e simulações de um financiamento.
 *
 * @param {number} finId
 * @returns {Promise<void>}
 */
async function recarregarPainelPosAmortizacao(finId) {
  try {
    const [parcelas, amortizacoes, resumo, simulacoes] = await Promise.all([
      listarParcelas(finId),
      listarAmortizacoes(finId),
      resumirParcelas(finId),
      listarSimulacoes(finId),
    ]);

    renderizarGrafico(parcelas);
    atualizarResumo(parcelas, amortizacoes, resumo);
    renderizarTabelaAmortizacoes(amortizacoes, finId);
    renderizarTabelaSimulacoes(simulacoes, finId);
  } catch (erro) {
    mostrarToast(`Erro ao atualizar painel: ${erro.message}`, 'danger');
  }
}
