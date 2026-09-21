/**
 * competencia.js
 * Seletor de competência (mês e ano) usado em todos os campos de data.
 *
 * Substitui o `<input type="month">` nativo por dois `<select>`. Três motivos:
 *
 *   1. O texto do campo nativo é desenhado pelo navegador, no locale do
 *      sistema, e não pode ser ajustado por CSS nem por JavaScript.
 *   2. O Firefox não implementa o seletor de `type="month"` — o campo vira
 *      uma caixa de texto simples, sem calendário e sem validação visual.
 *   3. Com dois selects, o usuário não consegue digitar uma competência
 *      inválida; as opções já vêm limitadas à faixa aceita.
 *
 * A API continua recebendo e devolvendo o formato 'AAAA-MM' — a conversão
 * acontece toda aqui dentro, de modo que o resto do front não muda.
 */

/** Nomes dos meses, na ordem, já capitalizados para exibição. */
const NOMES_DOS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Quantos anos antes do atual a lista começa. */
const ANOS_PARA_TRAS = 5;

/** Quantos anos depois do atual a lista termina — cobre um contrato de 50 anos. */
const ANOS_PARA_FRENTE = 50;

/**
 * Converte uma competência 'AAAA-MM' em suas partes numéricas.
 *
 * @param {string} competencia - Ex: '2026-09'
 * @returns {{ano: number, mes: number}|null} null se o formato não for válido
 */
function partesDaCompetencia(competencia) {
  const encontrado = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
  if (!encontrado) return null;

  const ano = Number(encontrado[1]);
  const mes = Number(encontrado[2]);

  if (mes < 1 || mes > 12) return null;
  return { ano, mes };
}

/**
 * Monta a competência 'AAAA-MM' a partir do ano e do mês.
 *
 * @param {number|string} ano
 * @param {number|string} mes
 * @returns {string} Ex: '2026-09', ou string vazia se algo faltar
 */
function montarCompetencia(ano, mes) {
  if (!ano || !mes) return '';
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

/**
 * Substitui um `<input type="month">` por um par de selects de mês e ano.
 *
 * O elemento original é preservado como `<input type="hidden">` com o mesmo
 * id, para que todo o código que já faz `getElementById(id).value` continue
 * lendo a competência no formato 'AAAA-MM' sem qualquer alteração.
 *
 * @param {string} id - Id do campo a substituir
 */
function instalarSeletorDeCompetencia(id) {
  const original = document.getElementById(id);
  if (!original || original.dataset.competenciaInstalada) return;

  const obrigatorio = original.required;

  const oculto = document.createElement('input');
  oculto.type = 'hidden';
  oculto.id = id;
  oculto.dataset.competenciaInstalada = 'sim';

  const grupo = document.createElement('div');
  grupo.className = 'competencia-grupo';

  const selectMes = document.createElement('select');
  selectMes.className = 'form-select competencia-mes';
  selectMes.id = `${id}-mes`;
  selectMes.setAttribute('aria-label', 'Mês');
  if (obrigatorio) selectMes.required = true;

  const selectAno = document.createElement('select');
  selectAno.className = 'form-select competencia-ano';
  selectAno.id = `${id}-ano`;
  selectAno.setAttribute('aria-label', 'Ano');
  if (obrigatorio) selectAno.required = true;

  // O terceiro e o quarto argumentos são defaultSelected e selected: sem o
  // terceiro, um form.reset() deixaria o select preso na última escolha.
  const vazioMes = new Option('Mês', '', true, true);
  vazioMes.disabled = true;
  selectMes.appendChild(vazioMes);

  NOMES_DOS_MESES.forEach((nome, indice) => {
    selectMes.appendChild(new Option(nome, String(indice + 1)));
  });

  const vazioAno = new Option('Ano', '', true, true);
  vazioAno.disabled = true;
  selectAno.appendChild(vazioAno);

  const anoAtual = new Date().getFullYear();
  for (let ano = anoAtual - ANOS_PARA_TRAS; ano <= anoAtual + ANOS_PARA_FRENTE; ano += 1) {
    selectAno.appendChild(new Option(String(ano), String(ano)));
  }

  /** Reflete a escolha nos dois selects de volta para o campo oculto. */
  const sincronizar = () => {
    oculto.value = montarCompetencia(selectAno.value, selectMes.value);
    oculto.dispatchEvent(new Event('change', { bubbles: true }));
  };

  selectMes.addEventListener('change', sincronizar);
  selectAno.addEventListener('change', sincronizar);

  grupo.appendChild(selectMes);
  grupo.appendChild(selectAno);

  original.replaceWith(grupo);
  grupo.parentNode.insertBefore(oculto, grupo);
}

/**
 * Preenche um seletor de competência programaticamente.
 *
 * Usada ao abrir o modal de edição e ao sugerir uma competência padrão —
 * atribuir direto no campo oculto não moveria os selects.
 *
 * @param {string} id - Id do campo
 * @param {string} competencia - Ex: '2027-06'; string vazia limpa a seleção
 */
function definirCompetencia(id, competencia) {
  const oculto = document.getElementById(id);
  const selectMes = document.getElementById(`${id}-mes`);
  const selectAno = document.getElementById(`${id}-ano`);
  if (!oculto || !selectMes || !selectAno) return;

  const partes = partesDaCompetencia(competencia);

  if (!partes) {
    selectMes.value = '';
    selectAno.value = '';
    oculto.value = '';
    return;
  }

  // Um contrato antigo pode cair fora da faixa padrão de anos.
  if (!Array.from(selectAno.options).some((o) => o.value === String(partes.ano))) {
    selectAno.appendChild(new Option(String(partes.ano), String(partes.ano)));
    Array.from(selectAno.options)
      .filter((o) => o.value)
      .sort((a, b) => Number(a.value) - Number(b.value))
      .forEach((o) => selectAno.appendChild(o));
  }

  selectMes.value = String(partes.mes);
  selectAno.value = String(partes.ano);
  oculto.value = montarCompetencia(partes.ano, partes.mes);
}

/**
 * Lê a competência escolhida.
 *
 * @param {string} id - Id do campo
 * @returns {string} Competência 'AAAA-MM', ou string vazia se incompleta
 */
function obterCompetencia(id) {
  return document.getElementById(id)?.value || '';
}

/**
 * Instala o seletor em todos os campos de competência da página.
 */
function instalarSeletoresDeCompetencia() {
  ['fin-data', 'edit-data', 'amor-data', 'sim-data']
    .forEach(instalarSeletorDeCompetencia);
}
