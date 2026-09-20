/**
 * grafico.js
 * Renderização, atualização e filtragem do gráfico de parcelas (Chart.js v4).
 *
 * Dois modos de visualização:
 *   simples      uma barra por parcela, colorida por passado / presente / futuro.
 *   composição   barra empilhada separando juros e amortização — deixa visível
 *                por que amortizar cedo economiza tanto, já que no começo do
 *                contrato quase toda a parcela é juro.
 *
 * Mantém uma única instância do chart para que as mudanças sejam animadas em
 * vez de recriar o canvas a cada atualização.
 */

/** Instância ativa do Chart.js. @type {Chart|null} */
let instanciaGrafico = null;

/** Lista completa de parcelas ordenada por data. @type {Array} */
let parcelasTodas = [];

/** Subconjunto exibido no gráfico, usado também pelo tooltip. @type {Array} */
let parcelasAtuais = [];

/** Ano selecionado no filtro, ou null para "todos". @type {string|null} */
let anoSelecionado = null;

/** Quando true, separa juros e amortização em barras empilhadas. @type {boolean} */
let modoComposicao = false;

/* ── Formatadores ────────────────────────────────────────────── */

/**
 * Formata um valor numérico para o eixo do gráfico de forma legível.
 *
 * @param {number} valor
 * @returns {string} Ex: "R$ 1,2k"
 */
function formatarEixoY(valor) {
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `R$ ${(valor / 1_000).toFixed(1)}k`;
  return `R$ ${valor.toFixed(0)}`;
}

/**
 * Formata "YYYY-MM" para exibição abreviada.
 *
 * @param {string} anoMes - Ex: "2026-03"
 * @returns {string} Ex: "Mar/26"
 */
function formatarMesAno(anoMes) {
  const [ano, mes] = anoMes.split('-');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
}

/**
 * Determina a cor de uma barra conforme a parcela seja passada, atual ou futura.
 *
 * @param {string} dataParcela - "YYYY-MM"
 * @returns {{bg: string, border: string}}
 */
function corDaParcela(dataParcela) {
  const hoje = new Date();
  const competenciaAtual =
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  if (dataParcela < competenciaAtual) {
    return { bg: 'rgba(107,122,144,0.45)', border: 'rgba(107,122,144,0.7)' };
  }
  if (dataParcela === competenciaAtual) {
    return { bg: 'rgba(249,168,37,0.8)', border: 'rgba(249,168,37,1)' };
  }
  return { bg: 'rgba(0,180,216,0.65)', border: 'rgba(0,150,183,1)' };
}

/* ── Construção dos datasets ─────────────────────────────────── */

/**
 * Monta os datasets do Chart.js conforme o modo de visualização ativo.
 *
 * @param {Array<Object>} lista - Parcelas a exibir
 * @returns {Array<Object>} Datasets prontos para o Chart.js
 */
function montarDatasets(lista) {
  if (modoComposicao) {
    return [
      {
        label: 'Juros',
        data: lista.map((p) => p.juros),
        backgroundColor: 'rgba(214,69,80,0.7)',
        borderColor: 'rgba(214,69,80,1)',
        borderWidth: 1,
        borderRadius: 2,
        stack: 'parcela',
      },
      {
        label: 'Amortização',
        data: lista.map((p) => p.amortizacao),
        backgroundColor: 'rgba(37,168,71,0.7)',
        borderColor: 'rgba(37,168,71,1)',
        borderWidth: 1,
        borderRadius: 2,
        stack: 'parcela',
      },
    ];
  }

  const cores = lista.map((p) => corDaParcela(p.data_parcela));

  return [{
    label: 'Valor da Parcela',
    data: lista.map((p) => p.valor_parcela),
    backgroundColor: cores.map((c) => c.bg),
    borderColor: cores.map((c) => c.border),
    borderWidth: 1.5,
    borderRadius: 4,
    borderSkipped: false,
  }];
}

/* ── Filtros por ano ─────────────────────────────────────────── */

/**
 * Renderiza o seletor de ano acima do gráfico.
 * Fica oculto quando o cronograma cabe em um único ano.
 */
function renderizarFiltrosAno() {
  const container = document.getElementById('filtros-ano');
  const wrapper = document.getElementById('filtros-ano-wrapper');
  if (!container) return;

  container.innerHTML = '';

  const anos = [...new Set(parcelasTodas.map((p) => p.data_parcela.slice(0, 4)))].sort();

  if (anos.length <= 1) {
    wrapper.style.display = 'none';
    return;
  }
  wrapper.style.display = '';

  const label = document.createElement('label');
  label.htmlFor = 'select-filtro-ano';
  label.textContent = 'Filtrar por ano:';
  label.className = 'filtro-ano-label';

  const select = document.createElement('select');
  select.id = 'select-filtro-ano';
  select.className = 'form-select form-select-sm filtro-ano-select';

  const opcaoTodos = document.createElement('option');
  opcaoTodos.value = '';
  opcaoTodos.textContent = 'Todos os anos';
  select.appendChild(opcaoTodos);

  anos.forEach((ano) => {
    const opcao = document.createElement('option');
    opcao.value = ano;
    opcao.textContent = ano;
    if (ano === anoSelecionado) opcao.selected = true;
    select.appendChild(opcao);
  });

  select.addEventListener('change', () => {
    anoSelecionado = select.value || null;
    aplicarFiltroAno();
  });

  container.appendChild(label);
  container.appendChild(select);
}

/**
 * Aplica o filtro de ano selecionado e atualiza o gráfico.
 */
function aplicarFiltroAno() {
  const lista = anoSelecionado
    ? parcelasTodas.filter((p) => p.data_parcela.startsWith(anoSelecionado))
    : parcelasTodas;

  atualizarDadosGrafico(lista);
}

/* ── Renderização ────────────────────────────────────────────── */

/**
 * Atualiza os dados do chart com um subconjunto de parcelas.
 *
 * @param {Array<Object>} lista
 */
function atualizarDadosGrafico(lista) {
  parcelasAtuais = lista;

  const infoEl = document.getElementById('grafico-info-parcelas');
  if (infoEl) {
    const total = parcelasTodas.length;
    infoEl.textContent = anoSelecionado
      ? `${lista.length} parcela${lista.length !== 1 ? 's' : ''} de ${total}`
      : `${total} parcela${total !== 1 ? 's' : ''}`;
  }

  if (!instanciaGrafico) return;

  instanciaGrafico.data.labels = lista.map((p) => formatarMesAno(p.data_parcela));
  instanciaGrafico.data.datasets = montarDatasets(lista);
  instanciaGrafico.options.scales.x.stacked = modoComposicao;
  instanciaGrafico.options.scales.y.stacked = modoComposicao;
  instanciaGrafico.options.plugins.legend.display = modoComposicao;
  instanciaGrafico.update('active');
}

/**
 * Renderiza (ou atualiza) o gráfico com o cronograma de parcelas.
 *
 * @param {Array<{numero_parcela: number, data_parcela: string, valor_parcela: number,
 *                juros: number, amortizacao: number, saldo_devedor: number}>} parcelas
 */
function renderizarGrafico(parcelas) {
  const canvas = document.getElementById('grafico-parcelas');
  if (!canvas) return;

  parcelasTodas = [...parcelas].sort((a, b) =>
    a.data_parcela.localeCompare(b.data_parcela)
  );

  anoSelecionado = null;
  renderizarFiltrosAno();
  parcelasAtuais = parcelasTodas;

  if (instanciaGrafico) {
    atualizarDadosGrafico(parcelasTodas);
    return;
  }

  const infoEl = document.getElementById('grafico-info-parcelas');
  if (infoEl) {
    infoEl.textContent = `${parcelas.length} parcela${parcelas.length !== 1 ? 's' : ''}`;
  }

  instanciaGrafico = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: parcelasAtuais.map((p) => formatarMesAno(p.data_parcela)),
      datasets: montarDatasets(parcelasAtuais),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeInOutQuart' },
      plugins: {
        legend: {
          display: modoComposicao,
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 }, color: '#33415c' },
        },
        tooltip: {
          backgroundColor: '#0d1b2a',
          titleColor: '#00b4d8',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            // parcelasAtuais é mutável e sempre reflete o filtro corrente.
            title(itens) {
              const parcela = parcelasAtuais[itens[0].dataIndex];
              return parcela
                ? `Parcela ${parcela.numero_parcela} — ${formatarMesAno(parcela.data_parcela)}`
                : '';
            },
            label(item) {
              const prefixo = modoComposicao ? `${item.dataset.label}: ` : '';
              return ` ${prefixo}${formatarReais(item.raw)}`;
            },
            footer(itens) {
              const parcela = parcelasAtuais[itens[0].dataIndex];
              if (!parcela) return '';
              return `Saldo devedor: ${formatarReais(parcela.saldo_devedor)}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: modoComposicao,
          grid: { display: false },
          ticks: {
            color: '#6b7a90',
            font: { size: 10 },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 24,
          },
        },
        y: {
          stacked: modoComposicao,
          beginAtZero: true,
          grid: { color: 'rgba(214,224,238,0.6)' },
          ticks: { color: '#6b7a90', font: { size: 10 }, callback: formatarEixoY },
        },
      },
    },
  });
}

/**
 * Registra o interruptor que alterna entre modo simples e composição.
 */
function registrarSwitchComposicao() {
  document.getElementById('switch-composicao')?.addEventListener('change', (evento) => {
    modoComposicao = evento.target.checked;
    aplicarFiltroAno();
  });
}

/**
 * Destrói a instância do gráfico e limpa o estado de filtro.
 */
function destruirGrafico() {
  instanciaGrafico?.destroy();
  instanciaGrafico = null;

  parcelasTodas = [];
  parcelasAtuais = [];
  anoSelecionado = null;

  const infoEl = document.getElementById('grafico-info-parcelas');
  const filtrosEl = document.getElementById('filtros-ano');
  const wrapperEl = document.getElementById('filtros-ano-wrapper');

  if (infoEl) infoEl.textContent = '';
  if (filtrosEl) filtrosEl.innerHTML = '';
  if (wrapperEl) wrapperEl.style.display = 'none';
}
