/**
 * financiamentos.js
 * Cadastro, listagem paginada, seleção, edição e remoção de financiamentos.
 *
 * A listagem usa os parâmetros de consulta da API (filtro, ordenação e
 * paginação) em vez de trazer tudo e filtrar no navegador — quem decide o
 * recorte é o back-end.
 */

/* ── Estado do módulo ───────────────────────────────────────── */

/** ID do financiamento atualmente selecionado no painel. @type {number|null} */
let financiamentoSelecionadoId = null;

/** Dados do financiamento selecionado, usados pelo modal de edição. @type {Object|null} */
let financiamentoSelecionado = null;

/** Página corrente da listagem. @type {number} */
let paginaAtual = 1;

/** Metadados da última página carregada. @type {Object} */
let paginacaoAtual = { pagina: 1, total_paginas: 1, total: 0 };

/** Itens por página na listagem lateral. */
const ITENS_POR_PAGINA = 8;

/* ── Helpers de formatação ──────────────────────────────────── */

/**
 * Formata um número como moeda BRL abreviada, para caber nas colunas estreitas.
 *
 * @param {number} valor
 * @returns {string} Ex: "R$ 1,20M", "R$ 400k"
 */
function formatarMoedaTabela(valor) {
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(2).replace('.', ',')}M`;
  if (valor >= 1_000) return `R$ ${(valor / 1_000).toFixed(0)}k`;
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

/**
 * Escapa caracteres especiais HTML para prevenir XSS.
 *
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lê os filtros selecionados na interface.
 *
 * @returns {{modelo: string, ordenar_por: string, ordem: string}}
 */
function lerFiltros() {
  return {
    modelo: document.getElementById('filtro-modelo')?.value || '',
    ordenar_por: document.getElementById('filtro-ordenar')?.value || 'id',
    ordem: document.getElementById('filtro-ordem')?.value || 'asc',
  };
}

/* ── Renderização da tabela ─────────────────────────────────── */

/**
 * Renderiza a lista de financiamentos na tabela HTML.
 *
 * @param {Array<Object>} financiamentos
 */
function renderizarTabelaFinanciamentos(financiamentos) {
  const tbody = document.getElementById('tbody-financiamentos');
  const tabelaEl = document.getElementById('tabela-financiamentos');
  const vazioEl = document.getElementById('lista-financiamentos-vazia');
  const badgeEl = document.getElementById('badge-total-fin');

  tbody.innerHTML = '';

  const temDados = financiamentos.length > 0;
  vazioEl.style.display = temDados ? 'none' : '';
  tabelaEl.style.display = temDados ? '' : 'none';
  badgeEl.textContent = paginacaoAtual.total;

  financiamentos.forEach((fin) => {
    const tr = document.createElement('tr');
    tr.classList.add('financiamento-row');
    tr.dataset.id = fin.id;

    if (fin.id === financiamentoSelecionadoId) tr.classList.add('selecionado');

    const valorFinanciado = fin.valor_imovel - fin.entrada;
    const taxaPercentual = (fin.taxa_juros * 100).toFixed(2).replace('.', ',');

    tr.innerHTML = `
      <td>
        <span class="fw-semibold">${escHtml(fin.nome)}</span><br/>
        <small class="text-muted">${escHtml(fin.data_inicio)} · ${taxaPercentual}% a.m.</small>
      </td>
      <td>${formatarMoedaTabela(valorFinanciado)}</td>
      <td>
        <span class="badge modelo-badge" style="font-size:0.7rem">${escHtml(fin.modelo)}</span>
      </td>
      <td class="text-muted">${fin.prazo_meses}x</td>
      <td>
        <button class="btn-danger-sm btn-deletar-fin" data-id="${fin.id}"
                title="Deletar financiamento" aria-label="Deletar ${escHtml(fin.nome)}">
          <i class="bi bi-trash3"></i>
        </button>
      </td>
    `;

    tr.addEventListener('click', (evento) => {
      if (evento.target.closest('.btn-deletar-fin')) return;
      selecionarFinanciamento(fin.id);
    });

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-deletar-fin').forEach((btn) => {
    btn.addEventListener('click', (evento) => {
      evento.stopPropagation();
      confirmarDeletarFinanciamento(Number(btn.dataset.id));
    });
  });

  renderizarPaginacao();
}

/**
 * Atualiza o rodapé de paginação com base nos metadados da última resposta.
 */
function renderizarPaginacao() {
  const rodape = document.getElementById('paginacao-financiamentos');
  const info = document.getElementById('paginacao-info');
  const anterior = document.getElementById('btn-pagina-anterior');
  const proxima = document.getElementById('btn-pagina-proxima');
  if (!rodape) return;

  const { pagina, total_paginas: totalPaginas, total } = paginacaoAtual;

  rodape.classList.toggle('d-none', totalPaginas <= 1);
  info.textContent = `página ${pagina} de ${totalPaginas} · ${total} no total`;
  anterior.disabled = pagina <= 1;
  proxima.disabled = pagina >= totalPaginas;
}

/* ── Formulário de cadastro ─────────────────────────────────── */

/**
 * Lê e valida os campos do formulário de financiamento.
 *
 * @param {string} prefixo - 'fin' (cadastro) ou 'edit' (modal de edição)
 * @returns {{dados: Object|null, erro: string|null}}
 */
function lerFormularioContrato(prefixo) {
  const campo = (sufixo) => document.getElementById(`${prefixo}-${sufixo}`);

  const nome = campo('nome').value.trim();
  const valorImovel = parseFloat(campo('valor').value);
  const entrada = parseFloat(campo('entrada').value);
  const taxa = parseFloat(campo('taxa').value);
  const prazo = parseInt(campo('prazo').value, 10);
  const dataInicio = campo('data').value;
  const modelo = campo('modelo').value;

  if (!nome) return { dados: null, erro: 'Informe o nome do financiamento.' };
  if (Number.isNaN(valorImovel) || valorImovel <= 0) {
    return { dados: null, erro: 'Valor do imóvel inválido.' };
  }
  if (Number.isNaN(entrada) || entrada < 0) {
    return { dados: null, erro: 'Entrada inválida.' };
  }
  if (entrada >= valorImovel) {
    return { dados: null, erro: 'A entrada deve ser menor que o valor do imóvel.' };
  }
  if (Number.isNaN(taxa) || taxa <= 0) {
    return { dados: null, erro: 'Taxa de juros inválida.' };
  }
  if (Number.isNaN(prazo) || prazo < 1) {
    return { dados: null, erro: 'Prazo inválido.' };
  }
  if (!dataInicio) {
    return { dados: null, erro: 'Informe a data de início.' };
  }

  return {
    dados: {
      nome,
      valor_imovel: valorImovel,
      entrada,
      taxa_juros: taxa,
      prazo_meses: prazo,
      data_inicio: dataInicio,
      modelo,
    },
    erro: null,
  };
}

/**
 * Registra o handler de submit do formulário de novo financiamento.
 */
function registrarFormFinanciamento() {
  const form = document.getElementById('form-financiamento');
  const erroEl = document.getElementById('fin-erro');
  const btnEl = document.getElementById('btn-cadastrar');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erroEl.classList.add('d-none');

    const { dados, erro } = lerFormularioContrato('fin');
    if (erro) {
      erroEl.textContent = erro;
      erroEl.classList.remove('d-none');
      return;
    }

    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Cadastrando…';

    try {
      const criado = await criarFinanciamento(dados);
      form.reset();
      mostrarToast(
        `Financiamento cadastrado — ${criado.parcelas_geradas} parcelas calculadas.`,
        'success'
      );

      await recarregarFinanciamentos();
      await selecionarFinanciamento(criado.id);
    } catch (falha) {
      erroEl.textContent = falha.message;
      erroEl.classList.remove('d-none');
    } finally {
      btnEl.disabled = false;
      btnEl.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Cadastrar Financiamento';
    }
  });

  // Dica de mercado: compara a taxa digitada com a Selic vinda do Banco Central.
  const campoTaxa = document.getElementById('fin-taxa');
  const dica = document.getElementById('fin-taxa-dica');

  campoTaxa?.addEventListener('input', () => {
    const selicMensal = taxaMensalDe('SELIC');
    const digitada = parseFloat(campoTaxa.value) / 100;

    if (!selicMensal || Number.isNaN(digitada) || digitada <= 0) {
      dica.textContent = '';
      return;
    }

    const diferenca = ((digitada / selicMensal - 1) * 100).toFixed(0);
    dica.className = digitada > selicMensal ? 'form-text text-danger' : 'form-text text-success';
    dica.textContent = digitada > selicMensal
      ? `${diferenca}% acima da Selic (${formatarPercentual(selicMensal)} a.m.)`
      : `abaixo da Selic (${formatarPercentual(selicMensal)} a.m.)`;
  });
}

/* ── Edição via PUT ─────────────────────────────────────────── */

/**
 * Abre o modal de edição preenchido com o financiamento selecionado.
 */
function abrirModalEdicao() {
  if (!financiamentoSelecionado) return;

  const fin = financiamentoSelecionado;
  document.getElementById('edit-nome').value = fin.nome;
  document.getElementById('edit-valor').value = fin.valor_imovel;
  document.getElementById('edit-entrada').value = fin.entrada;
  document.getElementById('edit-taxa').value = (fin.taxa_juros * 100).toFixed(3);
  document.getElementById('edit-prazo').value = fin.prazo_meses;
  document.getElementById('edit-data').value = fin.data_inicio;
  document.getElementById('edit-modelo').value = fin.modelo;
  document.getElementById('edit-erro').classList.add('d-none');

  bootstrap.Modal.getOrCreateInstance(
    document.getElementById('modal-editar-financiamento')
  ).show();
}

/**
 * Registra o botão e o formulário de edição do financiamento.
 */
function registrarEdicaoFinanciamento() {
  document.getElementById('btn-editar-financiamento')
    ?.addEventListener('click', abrirModalEdicao);

  const form = document.getElementById('form-editar-financiamento');
  const erroEl = document.getElementById('edit-erro');
  const btnEl = document.getElementById('btn-salvar-edicao');

  form?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erroEl.classList.add('d-none');

    const { dados, erro } = lerFormularioContrato('edit');
    if (erro) {
      erroEl.textContent = erro;
      erroEl.classList.remove('d-none');
      return;
    }

    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Recalculando…';

    try {
      const resposta = await atualizarFinanciamento(financiamentoSelecionadoId, dados);

      bootstrap.Modal.getInstance(
        document.getElementById('modal-editar-financiamento')
      )?.hide();

      let mensagem = `Contrato atualizado — ${resposta.parcelas_geradas} parcelas recalculadas.`;
      if (resposta.amortizacoes_removidas) {
        mensagem += ` ${resposta.amortizacoes_removidas} amortização(ões) fora do novo prazo foram removidas.`;
      }
      mostrarToast(mensagem, 'success');

      await recarregarFinanciamentos();
      await selecionarFinanciamento(financiamentoSelecionadoId);
    } catch (falha) {
      erroEl.textContent = falha.message;
      erroEl.classList.remove('d-none');
    } finally {
      btnEl.disabled = false;
      btnEl.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar e recalcular';
    }
  });
}

/* ── Seleção de financiamento ───────────────────────────────── */

/**
 * Seleciona um financiamento e carrega todo o seu painel.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
async function selecionarFinanciamento(id) {
  financiamentoSelecionadoId = id;

  document.querySelectorAll('.financiamento-row').forEach((tr) => {
    tr.classList.toggle('selecionado', Number(tr.dataset.id) === id);
  });

  document.getElementById('painel-vazio').classList.add('d-none');
  const painel = document.getElementById('painel-financiamento');
  painel.classList.remove('d-none');
  painel.classList.remove('painel-ativo');
  void painel.offsetWidth;
  painel.classList.add('painel-ativo');

  destruirGrafico();
  limparPainelSimulacao();
  document.getElementById('grafico-loading').classList.remove('d-none');

  try {
    const [fin, parcelas, amortizacoes, resumo, simulacoes] = await Promise.all([
      buscarFinanciamento(id),
      listarParcelas(id),
      listarAmortizacoes(id),
      resumirParcelas(id),
      listarSimulacoes(id),
    ]);

    financiamentoSelecionado = fin;

    document.getElementById('painel-nome').textContent = fin.nome;
    document.getElementById('painel-modelo-badge').textContent = fin.modelo;
    document.getElementById('painel-resumo-contrato').textContent =
      ` ${formatarReais(fin.valor_imovel - fin.entrada)} · ` +
      `${(fin.taxa_juros * 100).toFixed(2).replace('.', ',')}% a.m. · ${fin.prazo_meses} meses`;

    document.getElementById('grafico-loading').classList.add('d-none');

    renderizarGrafico(parcelas);
    atualizarResumo(parcelas, amortizacoes, resumo);
    renderizarTabelaAmortizacoes(amortizacoes, id);
    renderizarTabelaSimulacoes(simulacoes, id);

    sugerirCompetenciaPadrao(parcelas);
  } catch (erro) {
    document.getElementById('grafico-loading').classList.add('d-none');
    mostrarToast(`Erro ao carregar financiamento: ${erro.message}`, 'danger');
  }
}

/**
 * Pré-preenche os campos de competência com um mês válido do contrato.
 * Evita o erro mais comum de primeiro uso: informar uma data fora da vigência.
 *
 * @param {Array<Object>} parcelas
 */
function sugerirCompetenciaPadrao(parcelas) {
  if (!parcelas.length) return;

  const meio = parcelas[Math.floor(parcelas.length / 3)].data_parcela;

  const campoAmortizacao = document.getElementById('amor-data');
  const campoSimulacao = document.getElementById('sim-data');

  if (campoAmortizacao && !campoAmortizacao.value) campoAmortizacao.value = meio;
  if (campoSimulacao && !campoSimulacao.value) campoSimulacao.value = meio;
}

/* ── Deleção ────────────────────────────────────────────────── */

/**
 * Pede confirmação e deleta o financiamento.
 *
 * @param {number} id
 */
async function confirmarDeletarFinanciamento(id) {
  const linha = document.querySelector(`.financiamento-row[data-id="${id}"]`);
  const nome = linha?.querySelector('.fw-semibold')?.textContent || `#${id}`;

  const confirmacao = confirm(
    `Deletar o financiamento "${nome}"?\n\n` +
    'Todas as parcelas, amortizações e simulações serão removidas.'
  );
  if (!confirmacao) return;

  try {
    await deletarFinanciamento(id);
    mostrarToast('Financiamento deletado com sucesso.', 'success');

    if (financiamentoSelecionadoId === id) {
      financiamentoSelecionadoId = null;
      financiamentoSelecionado = null;
      destruirGrafico();
      limparPainelSimulacao();
      document.getElementById('painel-financiamento').classList.add('d-none');
      document.getElementById('painel-vazio').classList.remove('d-none');
    }

    await recarregarFinanciamentos();
  } catch (erro) {
    mostrarToast(`Erro ao deletar: ${erro.message}`, 'danger');
  }
}

/* ── Recarga da lista ───────────────────────────────────────── */

/**
 * Busca a página corrente de financiamentos na API e renderiza a tabela.
 *
 * @returns {Promise<void>}
 */
async function recarregarFinanciamentos() {
  try {
    const resposta = await listarFinanciamentos({
      ...lerFiltros(),
      pagina: paginaAtual,
      por_pagina: ITENS_POR_PAGINA,
    });

    paginacaoAtual = resposta.paginacao;

    // A página pode ter ficado vazia depois de uma exclusão.
    if (!resposta.itens.length && paginaAtual > 1) {
      paginaAtual = Math.max(paginacaoAtual.total_paginas, 1);
      return recarregarFinanciamentos();
    }

    renderizarTabelaFinanciamentos(resposta.itens);
    return undefined;
  } catch (erro) {
    mostrarToast(`Erro ao carregar financiamentos: ${erro.message}`, 'danger');
    return undefined;
  }
}

/**
 * Registra os controles de filtro, ordenação e navegação de páginas.
 */
function registrarControlesLista() {
  ['filtro-modelo', 'filtro-ordenar', 'filtro-ordem'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      paginaAtual = 1;
      recarregarFinanciamentos();
    });
  });

  document.getElementById('btn-pagina-anterior')?.addEventListener('click', () => {
    if (paginaAtual > 1) {
      paginaAtual -= 1;
      recarregarFinanciamentos();
    }
  });

  document.getElementById('btn-pagina-proxima')?.addEventListener('click', () => {
    if (paginaAtual < paginacaoAtual.total_paginas) {
      paginaAtual += 1;
      recarregarFinanciamentos();
    }
  });
}
