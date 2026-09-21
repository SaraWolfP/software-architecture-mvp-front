/**
 * indicadores.js
 * Barra de indicadores econômicos no topo da aplicação.
 *
 * Os dados vêm da API, que por sua vez os busca no Banco Central. Quando a API
 * responde com `origem: "cache"`, a barra exibe um selo avisando que o BCB não
 * respondeu e o número exibido pode não ser o mais recente — é preferível um
 * dado carimbado a uma tela vazia.
 */

/** Indicadores carregados na última consulta, por nome. @type {Object<string, Object>} */
let indicadoresCarregados = {};

/** Instâncias dos sparklines, para destruir antes de recriar. @type {Object<string, Chart>} */
const sparklines = {};

/** Metadados de exibição de cada indicador. */
const APRESENTACAO_INDICADORES = {
  CDI: {
    rotulo: 'CDI',
    descricao: 'Acumulado no mês',
    icone: 'bi-graph-up-arrow',
    cor: '#00b4d8',
  },
  SELIC: {
    rotulo: 'Selic',
    // A série 4189 é a Selic acumulada no mês e anualizada na base 252 —
    // não é a meta definida pelo Copom, que é outra série (432).
    descricao: 'Anualizada, base 252',
    icone: 'bi-bank',
    cor: '#7048e8',
  },
  IPCA: {
    rotulo: 'IPCA',
    descricao: 'Inflação do mês',
    icone: 'bi-basket',
    cor: '#f9a825',
  },
};

/**
 * Formata uma taxa decimal como percentual brasileiro.
 *
 * @param {number} valor - Taxa em decimal (0.0098)
 * @param {number} [casas=2] - Casas decimais
 * @returns {string} Ex: "0,98%"
 */
function formatarPercentual(valor, casas = 2) {
  return `${(valor * 100).toFixed(casas).replace('.', ',')}%`;
}

/**
 * Converte 'YYYY-MM' em rótulo curto para o eixo do sparkline.
 *
 * @param {string} anoMes
 * @returns {string} Ex: "set/26"
 */
function formatarCompetenciaCurta(anoMes) {
  const [ano, mes] = anoMes.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
}

/**
 * Formata o carimbo ISO de atualização para exibição.
 *
 * @param {string} iso
 * @returns {string} Ex: "14/09 às 17:32"
 */
function formatarCarimbo(iso) {
  if (!iso) return '—';

  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';

  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');

  return `${dia}/${mes} às ${hora}:${minuto}`;
}

/**
 * Renderiza a barra completa de indicadores.
 *
 * @param {Array<Object>} indicadores - Lista devolvida pela API
 * @param {string} origem - 'bcb', 'cache', 'misto' ou 'indisponivel'
 */
function renderizarBarraIndicadores(indicadores, origem) {
  const container = document.getElementById('faixa-indicadores');
  const selo = document.getElementById('indicadores-origem');
  if (!container) return;

  container.innerHTML = '';
  indicadoresCarregados = {};

  indicadores.forEach((indicador) => {
    const meta = APRESENTACAO_INDICADORES[indicador.nome];
    if (!meta) return;

    const coluna = document.createElement('div');
    coluna.className = 'col-12 col-md-4';

    if (indicador.erro) {
      coluna.innerHTML = `
        <div class="card indicador-card indicador-card-erro">
          <div class="card-body">
            <p class="indicador-rotulo">
              <i class="bi ${meta.icone} me-1"></i>${meta.rotulo}
            </p>
            <p class="indicador-valor text-muted">—</p>
            <p class="indicador-sub">Indisponível</p>
          </div>
        </div>
      `;
      container.appendChild(coluna);
      return;
    }

    indicadoresCarregados[indicador.nome] = indicador;

    const mensal = indicador.periodicidade === 'anual'
      ? `${formatarPercentual(indicador.taxa_mensal)} a.m. equivalente`
      : `Ref. ${formatarCompetenciaCurta(indicador.data_referencia)}`;

    coluna.innerHTML = `
      <div class="card indicador-card" style="--cor-indicador:${meta.cor}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <p class="indicador-rotulo">
                <i class="bi ${meta.icone} me-1"></i>${meta.rotulo}
              </p>
              <p class="indicador-valor">${formatarPercentual(indicador.valor)}</p>
              <p class="indicador-sub">${meta.descricao} · ${mensal}</p>
            </div>
            <div class="indicador-sparkline">
              <canvas id="spark-${indicador.nome}"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(coluna);
  });

  // Os canvas precisam existir no DOM antes de instanciar os charts.
  indicadores.forEach((indicador) => {
    if (!indicador.erro && indicador.historico) {
      desenharSparkline(indicador);
    }
  });

  if (selo) {
    // Servir do cache dentro do TTL é o funcionamento normal e não merece
    // alarde: o dado veio do Banco Central, só não foi relido agora. O aviso
    // fica reservado ao cache vencido, quando o BCB de fato não respondeu.
    const degradado = origem === 'cache_vencido';
    const carimbo = indicadores.find((i) => i.atualizado_em)?.atualizado_em;

    selo.className = `badge origem-badge ${degradado ? 'origem-cache' : 'origem-bcb'}`;
    selo.innerHTML = degradado
      ? `<i class="bi bi-database me-1"></i>Cache local · ${formatarCarimbo(carimbo)}`
      : `<i class="bi bi-broadcast me-1"></i>Banco Central · ${formatarCarimbo(carimbo)}`;
    selo.title = degradado
      ? 'O Banco Central não respondeu. Exibindo o último valor guardado localmente, '
        + 'que pode estar desatualizado.'
      : `Dados do Banco Central, lidos em ${formatarCarimbo(carimbo)}.`;
  }
}

/**
 * Desenha o mini-gráfico de 12 meses dentro do card de um indicador.
 *
 * @param {Object} indicador - Indicador com campo `historico`
 */
function desenharSparkline(indicador) {
  const canvas = document.getElementById(`spark-${indicador.nome}`);
  if (!canvas || typeof Chart === 'undefined') return;

  sparklines[indicador.nome]?.destroy();

  const meta = APRESENTACAO_INDICADORES[indicador.nome];
  const valores = indicador.historico.map((o) => o.valor * 100);
  const rotulos = indicador.historico.map((o) => formatarCompetenciaCurta(o.data_referencia));

  sparklines[indicador.nome] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: rotulos,
      datasets: [{
        data: valores,
        borderColor: meta.cor,
        backgroundColor: `${meta.cor}22`,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1b2a',
          displayColors: false,
          callbacks: {
            label: (item) => ` ${item.raw.toFixed(2).replace('.', ',')}%`,
          },
        },
      },
      scales: {
        x: { display: false },
        y: { display: false },
      },
    },
  });
}

/**
 * Carrega os indicadores da API e renderiza a barra.
 *
 * @param {boolean} [forcar=false] - Se true, pede à API para reler no BCB
 * @returns {Promise<void>}
 */
async function recarregarIndicadores(forcar = false) {
  const botao = document.getElementById('btn-atualizar-indicadores');
  const container = document.getElementById('faixa-indicadores');

  if (botao) {
    botao.disabled = true;
    botao.querySelector('i')?.classList.add('girando');
  }

  if (container && !container.children.length) {
    container.innerHTML = Array.from({ length: 3 }, () => `
      <div class="col-12 col-md-4">
        <div class="card indicador-card">
          <div class="card-body">
            <div class="skeleton skeleton-linha-curta"></div>
            <div class="skeleton skeleton-linha-grande"></div>
            <div class="skeleton skeleton-linha-curta"></div>
          </div>
        </div>
      </div>
    `).join('');
  }

  try {
    if (forcar) {
      await atualizarIndicadores();
      mostrarToast('Indicadores atualizados a partir do Banco Central.', 'success');
    }

    const { indicadores, origem } = await listarIndicadores();
    renderizarBarraIndicadores(indicadores, origem);

    if (origem === 'cache_vencido') {
      mostrarToast(
        'O Banco Central não respondeu. Exibindo os últimos valores guardados, '
        + 'que podem estar desatualizados.',
        'warning'
      );
    }
  } catch (erro) {
    if (container) {
      container.innerHTML = `
        <div class="col-12">
          <div class="alert alert-warning mb-0 py-2">
            <i class="bi bi-exclamation-triangle me-1"></i>
            Não foi possível carregar os indicadores: ${escHtml(erro.message)}
          </div>
        </div>
      `;
    }
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.querySelector('i')?.classList.remove('girando');
    }
  }
}

/**
 * Devolve a taxa mensal de um indicador já carregado, para exibição no formulário.
 *
 * @param {'CDI' | 'SELIC'} nome
 * @returns {number|null} Taxa mensal em decimal, ou null se não carregado
 */
function taxaMensalDe(nome) {
  return indicadoresCarregados[nome]?.taxa_mensal ?? null;
}

/**
 * Registra o botão de atualização manual da barra de indicadores.
 */
function registrarBotaoIndicadores() {
  const botao = document.getElementById('btn-atualizar-indicadores');
  botao?.addEventListener('click', () => recarregarIndicadores(true));
}
