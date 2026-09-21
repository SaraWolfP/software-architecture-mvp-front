/**
 * simulacoes.js
 * Painel "Amortizar ou Investir?" — a funcionalidade que conecta o contrato
 * local aos dados de mercado do Banco Central.
 *
 * O usuário informa quanto tem disponível e quando; a API compara as duas
 * estratégias e devolve os montantes finais, o veredito e os parâmetros
 * congelados. Aqui a resposta vira um card de veredito, um gráfico de barras
 * comparativo e uma linha do histórico de simulações salvas.
 */

/** Instância do gráfico comparativo. @type {Chart|null} */
let graficoComparativo = null;

/** ID da simulação em edição, ou null quando o formulário está criando. @type {number|null} */
let simulacaoEmEdicao = null;

/** Cores e rótulos de cada veredito possível. */
const APRESENTACAO_VEREDITO = {
  AMORTIZAR: {
    titulo: 'Vale mais a pena amortizar',
    icone: 'bi-house-check-fill',
    classe: 'veredito-amortizar',
  },
  INVESTIR: {
    titulo: 'Vale mais a pena investir',
    icone: 'bi-piggy-bank-fill',
    classe: 'veredito-investir',
  },
  EMPATE: {
    titulo: 'Tecnicamente empatado',
    icone: 'bi-scales',
    classe: 'veredito-empate',
  },
};

/**
 * Formata um número como moeda brasileira.
 *
 * @param {number} valor
 * @returns {string}
 */
function formatarReais(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Renderiza o card de veredito e o gráfico comparativo.
 *
 * @param {Object} resultado - Resposta da API de simulação
 */
function renderizarResultadoSimulacao(resultado) {
  const painel = document.getElementById('resultado-simulacao');
  const vazio = document.getElementById('simulacao-sem-resultado');
  if (!painel) return;

  vazio?.classList.add('d-none');
  painel.classList.remove('d-none');

  const meta = APRESENTACAO_VEREDITO[resultado.veredito] || APRESENTACAO_VEREDITO.EMPATE;

  const cardVeredito = document.getElementById('card-veredito');
  cardVeredito.className = `card veredito-card ${meta.classe}`;
  cardVeredito.innerHTML = `
    <div class="card-body">
      <div class="d-flex align-items-center gap-3 mb-2">
        <i class="bi ${meta.icone} veredito-icone"></i>
        <div>
          <h3 class="veredito-titulo mb-0">${meta.titulo}</h3>
          <span class="veredito-diferenca">Diferença de ${formatarReais(resultado.diferenca)}</span>
        </div>
      </div>
      <p class="veredito-mensagem mb-0">${escHtml(resultado.mensagem)}</p>
    </div>
  `;

  const detalhes = document.getElementById('simulacao-detalhes');
  if (detalhes) {
    detalhes.innerHTML = `
      <div class="detalhe-item">
        <span class="detalhe-rotulo">Juros evitados</span>
        <span class="detalhe-valor">${formatarReais(resultado.juros_evitados)}</span>
      </div>
      <div class="detalhe-item">
        <span class="detalhe-rotulo">Horizonte</span>
        <span class="detalhe-valor">${resultado.meses_restantes} meses</span>
      </div>
      <div class="detalhe-item">
        <span class="detalhe-rotulo">Taxa usada</span>
        <span class="detalhe-valor">
          ${formatarPercentual(resultado.taxa_mensal)} a.m.
          <small class="text-muted">(${resultado.indicador || '—'})</small>
        </span>
      </div>
      <div class="detalhe-item">
        <span class="detalhe-rotulo">IR no resgate</span>
        <span class="detalhe-valor">${formatarPercentual(resultado.aliquota_ir, 1)}</span>
      </div>
      <div class="detalhe-item">
        <span class="detalhe-rotulo">Prazo do contrato</span>
        <span class="detalhe-valor">
          ${resultado.prazo_original}
          ${resultado.prazo_com_aporte < resultado.prazo_original
            ? `→ <strong>${resultado.prazo_com_aporte}</strong> parcelas`
            : 'parcelas (mantido)'}
        </span>
      </div>
    `;
  }

  desenharGraficoComparativo(resultado);
}

/**
 * Desenha o gráfico de barras que confronta os dois montantes finais.
 *
 * @param {Object} resultado
 */
function desenharGraficoComparativo(resultado) {
  const canvas = document.getElementById('grafico-comparativo');
  if (!canvas || typeof Chart === 'undefined') return;

  graficoComparativo?.destroy();

  const vencedorAmortizar = resultado.veredito === 'AMORTIZAR';

  graficoComparativo = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Amortizar a dívida', `Investir (${resultado.indicador || 'CDI'})`],
      datasets: [{
        label: 'Montante ao fim do contrato',
        data: [resultado.montante_amortizar, resultado.montante_investir],
        backgroundColor: [
          vencedorAmortizar ? 'rgba(37,168,71,0.75)' : 'rgba(107,122,144,0.45)',
          vencedorAmortizar ? 'rgba(107,122,144,0.45)' : 'rgba(0,150,183,0.75)',
        ],
        borderColor: [
          vencedorAmortizar ? '#25a847' : '#6b7a90',
          vencedorAmortizar ? '#6b7a90' : '#0096b7',
        ],
        borderWidth: 2,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1b2a',
          displayColors: false,
          callbacks: { label: (item) => ` ${formatarReais(item.raw)}` },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(214,224,238,0.6)' },
          ticks: { callback: formatarEixoY, color: '#6b7a90', font: { size: 10 } },
        },
        y: { grid: { display: false }, ticks: { color: '#33415c' } },
      },
    },
  });
}

/**
 * Renderiza a tabela de simulações salvas.
 *
 * @param {Array<Object>} simulacoes
 * @param {number} finId
 */
function renderizarTabelaSimulacoes(simulacoes, finId) {
  const tbody = document.getElementById('tbody-simulacoes');
  const tabela = document.getElementById('tabela-simulacoes');
  const vazio = document.getElementById('lista-simulacoes-vazia');
  const badge = document.getElementById('badge-total-sim');
  if (!tbody) return;

  tbody.innerHTML = '';

  const temDados = simulacoes.length > 0;
  vazio.style.display = temDados ? 'none' : '';
  tabela.style.display = temDados ? '' : 'none';
  badge.textContent = simulacoes.length;

  simulacoes.forEach((sim) => {
    const meta = APRESENTACAO_VEREDITO[sim.veredito] || APRESENTACAO_VEREDITO.EMPATE;
    const tr = document.createElement('tr');

    if (sim.obsoleta) tr.classList.add('simulacao-obsoleta');

    tr.innerHTML = `
      <td>
        <span class="fw-semibold">${formatarReais(sim.valor_aporte)}</span><br/>
        <small class="text-muted">${escHtml(sim.data_aporte)} · ${escHtml(sim.indicador)}</small>
      </td>
      <td>
        <span class="badge badge-veredito ${meta.classe}">${escHtml(sim.veredito)}</span>
        ${sim.obsoleta
          ? '<br/><small class="text-warning" title="O contrato mudou depois desta simulação.">Desatualizada</small>'
          : ''}
      </td>
      <td class="text-end">${formatarReais(sim.diferenca)}</td>
      <td class="text-end">
        <button class="btn-acao-sm btn-editar-sim" data-id="${sim.id}"
                title="Recalcular esta simulação" aria-label="Editar simulação">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-danger-sm btn-deletar-sim" data-id="${sim.id}"
                title="Remover simulação" aria-label="Remover simulação">
          <i class="bi bi-trash3"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-editar-sim').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sim = simulacoes.find((s) => s.id === Number(btn.dataset.id));
      if (sim) prepararEdicaoSimulacao(sim);
    });
  });

  tbody.querySelectorAll('.btn-deletar-sim').forEach((btn) => {
    btn.addEventListener('click', () => {
      confirmarDeletarSimulacao(finId, Number(btn.dataset.id));
    });
  });
}

/**
 * Preenche o formulário com os dados de uma simulação salva, para edição via PUT.
 *
 * @param {Object} sim
 */
function prepararEdicaoSimulacao(sim) {
  simulacaoEmEdicao = sim.id;

  document.getElementById('sim-aporte').value = sim.valor_aporte;
  document.getElementById('sim-data').value = sim.data_aporte;
  document.getElementById('sim-indicador').value = sim.indicador;
  document.getElementById('sim-percentual').value = Math.round(sim.percentual_indicador * 100);

  const botao = document.getElementById('btn-simular');
  botao.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Recalcular simulação';
  botao.classList.replace('btn-primary', 'btn-warning');

  document.getElementById('btn-cancelar-edicao-sim')?.classList.remove('d-none');
  document.getElementById('form-simulacao')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Devolve o formulário de simulação ao modo de criação.
 */
function cancelarEdicaoSimulacao() {
  simulacaoEmEdicao = null;

  const botao = document.getElementById('btn-simular');
  botao.innerHTML = '<i class="bi bi-calculator me-1"></i>Comparar estratégias';
  botao.classList.replace('btn-warning', 'btn-primary');

  document.getElementById('btn-cancelar-edicao-sim')?.classList.add('d-none');
  document.getElementById('form-simulacao')?.reset();
  document.getElementById('sim-percentual').value = 100;
}

/**
 * Registra o handler do formulário de simulação.
 * O mesmo formulário cria (POST) e recalcula (PUT), conforme `simulacaoEmEdicao`.
 */
function registrarFormSimulacao() {
  const form = document.getElementById('form-simulacao');
  const erroEl = document.getElementById('sim-erro');
  const botao = document.getElementById('btn-simular');
  if (!form) return;

  document.getElementById('btn-cancelar-edicao-sim')
    ?.addEventListener('click', cancelarEdicaoSimulacao);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erroEl.classList.add('d-none');

    if (!financiamentoSelecionadoId) {
      erroEl.textContent = 'Selecione um financiamento primeiro.';
      erroEl.classList.remove('d-none');
      return;
    }

    const aporte = parseFloat(document.getElementById('sim-aporte').value);
    const data = document.getElementById('sim-data').value;
    const indicador = document.getElementById('sim-indicador').value;
    const percentual = parseFloat(document.getElementById('sim-percentual').value);

    if (Number.isNaN(aporte) || aporte <= 0) {
      erroEl.textContent = 'Informe um valor de aporte válido.';
      erroEl.classList.remove('d-none');
      return;
    }
    if (!data) {
      erroEl.textContent = 'Informe a competência do aporte.';
      erroEl.classList.remove('d-none');
      return;
    }

    const rotuloOriginal = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Comparando…';

    const corpo = {
      valor_aporte: aporte,
      data_aporte: data,
      indicador,
      percentual_indicador: Number.isNaN(percentual) ? 100 : percentual,
      tipo_amortizacao: document.getElementById('sim-tipo').value,
    };

    try {
      const resultado = simulacaoEmEdicao
        ? await atualizarSimulacao(financiamentoSelecionadoId, simulacaoEmEdicao, corpo)
        : await criarSimulacao(financiamentoSelecionadoId, corpo);

      renderizarResultadoSimulacao(resultado);
      mostrarToast(
        simulacaoEmEdicao ? 'Simulação recalculada.' : 'Simulação concluída e salva.',
        'success'
      );

      cancelarEdicaoSimulacao();
      await recarregarSimulacoes(financiamentoSelecionadoId);
    } catch (erro) {
      erroEl.textContent = erro.message;
      erroEl.classList.remove('d-none');
      botao.innerHTML = rotuloOriginal;
    } finally {
      botao.disabled = false;
      if (!simulacaoEmEdicao) {
        botao.innerHTML = '<i class="bi bi-calculator me-1"></i>Comparar estratégias';
      }
    }
  });
}

/**
 * Pede confirmação e remove uma simulação salva.
 *
 * @param {number} finId
 * @param {number} simId
 */
async function confirmarDeletarSimulacao(finId, simId) {
  if (!confirm('Remover esta simulação do histórico?')) return;

  try {
    await deletarSimulacao(finId, simId);
    mostrarToast('Simulação removida.', 'success');
    await recarregarSimulacoes(finId);
  } catch (erro) {
    mostrarToast(`Erro ao remover: ${erro.message}`, 'danger');
  }
}

/**
 * Recarrega a tabela de simulações de um financiamento.
 *
 * @param {number} finId
 * @returns {Promise<void>}
 */
async function recarregarSimulacoes(finId) {
  try {
    const simulacoes = await listarSimulacoes(finId);
    renderizarTabelaSimulacoes(simulacoes, finId);
  } catch (erro) {
    mostrarToast(`Erro ao carregar simulações: ${erro.message}`, 'danger');
  }
}

/**
 * Limpa o painel de simulação ao trocar de financiamento.
 */
function limparPainelSimulacao() {
  graficoComparativo?.destroy();
  graficoComparativo = null;
  simulacaoEmEdicao = null;

  document.getElementById('resultado-simulacao')?.classList.add('d-none');
  document.getElementById('simulacao-sem-resultado')?.classList.remove('d-none');
}
