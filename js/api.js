/**
 * api.js
 * Camada de comunicação com a API REST do back-end.
 * Todas as chamadas fetch estão centralizadas aqui — nenhum outro módulo
 * deve usar fetch diretamente.
 *
 * A interface nunca conversa com o Banco Central: quem busca, converte e
 * armazena em cache os indicadores é a API. Isso mantém a regra de que os
 * dados da componente externa são tratados dentro da aplicação, evita CORS
 * e faz o sistema continuar funcional quando o BCB está fora do ar.
 */

/**
 * Endereço base da API.
 *
 * Em container, o nginx repassa /api/ para o serviço da API pela rede interna
 * do Docker, então um caminho relativo funciona sem depender de porta publicada
 * no host. Fora do container (arquivo aberto direto ou servidor estático), cai
 * para o Flask em desenvolvimento.
 *
 * @type {string}
 */
const API_BASE = (() => {
  const servidoPorNginx = window.location.port === '' || window.location.port === '8080';
  return servidoPorNginx && window.location.protocol.startsWith('http')
    ? '/api'
    : 'http://127.0.0.1:5000';
})();

/**
 * Executa um fetch genérico e retorna o JSON da resposta.
 * Lança um Error com a mensagem do back-end em caso de falha HTTP.
 *
 * @param {string} endpoint - Caminho relativo (ex: '/financiamento/')
 * @param {RequestInit} [opcoes={}] - Opções do fetch (method, body, etc.)
 * @returns {Promise<any>} Dados JSON da resposta
 * @throws {Error} Com a mensagem de erro devolvida pela API
 */
async function apiFetch(endpoint, opcoes = {}) {
  const url = `${API_BASE}${endpoint}`;

  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  };

  let resposta;
  try {
    resposta = await fetch(url, config);
  } catch {
    throw new Error(
      'Não foi possível falar com a API. Verifique se o back-end está no ar.'
    );
  }

  // Tenta extrair o corpo como JSON para mensagens de erro descritivas
  let corpo = null;
  const contentType = resposta.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    corpo = await resposta.json();
  }

  if (!resposta.ok) {
    const mensagem =
      (corpo && (corpo.erro || corpo.message || corpo.msg)) ||
      `Erro ${resposta.status}: ${resposta.statusText}`;
    throw new Error(mensagem);
  }

  return corpo;
}

/**
 * Monta uma query string ignorando valores vazios, nulos ou indefinidos.
 *
 * @param {Object<string, any>} parametros
 * @returns {string} Query string iniciada por '?' ou string vazia
 */
function montarQuery(parametros = {}) {
  const busca = new URLSearchParams();

  Object.entries(parametros).forEach(([chave, valor]) => {
    if (valor !== null && valor !== undefined && valor !== '') {
      busca.append(chave, valor);
    }
  });

  const query = busca.toString();
  return query ? `?${query}` : '';
}

/* ─────────────────────────────────────────────────────────────
   FINANCIAMENTOS — GET, POST, PUT, DELETE
   ───────────────────────────────────────────────────────────── */

/**
 * Cria um novo financiamento via POST /financiamento/
 *
 * @param {{
 *   nome: string,
 *   valor_imovel: number,
 *   entrada: number,
 *   taxa_juros: number,
 *   prazo_meses: number,
 *   data_inicio: string,
 *   modelo: 'SAC' | 'PRICE'
 * }} dados
 * @returns {Promise<{id: number, parcelas_geradas: number, mensagem: string}>}
 */
function criarFinanciamento(dados) {
  return apiFetch('/financiamento/', {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

/**
 * Lista financiamentos via GET /financiamento/ com filtro, ordenação e paginação.
 *
 * @param {{
 *   modelo?: 'SAC' | 'PRICE',
 *   ordenar_por?: string,
 *   ordem?: 'asc' | 'desc',
 *   pagina?: number,
 *   por_pagina?: number
 * }} [opcoes={}]
 * @returns {Promise<{itens: Array, paginacao: Object}>}
 */
function listarFinanciamentos(opcoes = {}) {
  return apiFetch(`/financiamento/${montarQuery(opcoes)}`);
}

/**
 * Busca um financiamento por ID via GET /financiamento/<id>
 *
 * @param {number} id
 * @returns {Promise<Object>} Dados do financiamento
 */
function buscarFinanciamento(id) {
  return apiFetch(`/financiamento/${id}`);
}

/**
 * Atualiza um financiamento via PUT /financiamento/<id>
 * O back-end reconstrói todo o cronograma de parcelas.
 *
 * @param {number} id
 * @param {Object} dados - Mesmos campos aceitos na criação
 * @returns {Promise<Object>}
 */
function atualizarFinanciamento(id, dados) {
  return apiFetch(`/financiamento/${id}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  });
}

/**
 * Deleta um financiamento via DELETE /financiamento/<id>
 * Remove em cascata parcelas, amortizações e simulações.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
function deletarFinanciamento(id) {
  return apiFetch(`/financiamento/${id}`, { method: 'DELETE' });
}

/* ─────────────────────────────────────────────────────────────
   PARCELAS — somente leitura
   ───────────────────────────────────────────────────────────── */

/**
 * Lista as parcelas de um financiamento via GET /financiamento/<id>/parcelas
 *
 * @param {number} finId
 * @param {{ano?: number, agrupar?: 'ano'}} [opcoes={}]
 * @returns {Promise<Array>} Parcelas com numero, data, valor, juros, amortização e saldo
 */
function listarParcelas(finId, opcoes = {}) {
  return apiFetch(`/financiamento/${finId}/parcelas${montarQuery(opcoes)}`);
}

/**
 * Busca os totais consolidados do cronograma.
 *
 * @param {number} finId
 * @returns {Promise<Object>} Totais de juros, amortização e desembolso
 */
function resumirParcelas(finId) {
  return apiFetch(`/financiamento/${finId}/parcelas/resumo`);
}

/* ─────────────────────────────────────────────────────────────
   AMORTIZAÇÕES — GET, POST, PUT, DELETE
   ───────────────────────────────────────────────────────────── */

/**
 * Cria uma amortização extra via POST /financiamento/<id>/amortizacoes
 * O back-end recalcula e persiste as parcelas automaticamente.
 *
 * @param {number} finId
 * @param {{
 *   valor_amortizado: number,
 *   data_amortizacao: string,
 *   tipo: 'PARCELA' | 'PRAZO'
 * }} dados
 * @returns {Promise<Object>}
 */
function criarAmortizacao(finId, dados) {
  return apiFetch(`/financiamento/${finId}/amortizacoes`, {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

/**
 * Lista as amortizações de um financiamento.
 *
 * @param {number} finId
 * @param {{tipo?: 'PARCELA' | 'PRAZO'}} [opcoes={}]
 * @returns {Promise<Array>}
 */
function listarAmortizacoes(finId, opcoes = {}) {
  return apiFetch(`/financiamento/${finId}/amortizacoes${montarQuery(opcoes)}`);
}

/**
 * Atualiza uma amortização via PUT /financiamento/<finId>/amortizacoes/<amorId>
 * O back-end reconstrói o cronograma com o novo valor.
 *
 * @param {number} finId
 * @param {number} amorId
 * @param {Object} dados
 * @returns {Promise<Object>}
 */
function atualizarAmortizacao(finId, amorId, dados) {
  return apiFetch(`/financiamento/${finId}/amortizacoes/${amorId}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  });
}

/**
 * Deleta uma amortização via DELETE /financiamento/<finId>/amortizacoes/<amorId>
 *
 * @param {number} finId
 * @param {number} amorId
 * @returns {Promise<Object>}
 */
function deletarAmortizacao(finId, amorId) {
  return apiFetch(`/financiamento/${finId}/amortizacoes/${amorId}`, {
    method: 'DELETE',
  });
}

/* ─────────────────────────────────────────────────────────────
   INDICADORES — dados da componente externa (Banco Central)
   ───────────────────────────────────────────────────────────── */

/**
 * Busca CDI, Selic e IPCA via GET /indicadores/
 * A API decide entre consultar o BCB ou servir do cache local; o campo
 * `origem` da resposta informa qual dos dois foi usado.
 *
 * @param {number} [ultimos=12] - Tamanho do histórico de cada indicador
 * @returns {Promise<{indicadores: Array, origem: string}>}
 */
function listarIndicadores(ultimos = 12) {
  return apiFetch(`/indicadores/${montarQuery({ ultimos })}`);
}


/**
 * Força a releitura das séries no BCB via POST /indicadores/atualizar
 *
 * @returns {Promise<Object>}
 */
function atualizarIndicadores() {
  return apiFetch('/indicadores/atualizar', { method: 'POST' });
}

/* ─────────────────────────────────────────────────────────────
   SIMULAÇÕES — GET, POST, PUT, DELETE
   ───────────────────────────────────────────────────────────── */

/**
 * Roda e salva uma simulação "amortizar vs. investir".
 *
 * @param {number} finId
 * @param {{
 *   valor_aporte: number,
 *   data_aporte: string,
 *   indicador?: 'CDI' | 'SELIC',
 *   percentual_indicador?: number,
 *   tipo_amortizacao?: 'PARCELA' | 'PRAZO'
 * }} dados
 * @returns {Promise<Object>} Resultado com veredito e os dois montantes
 */
function criarSimulacao(finId, dados) {
  return apiFetch(`/financiamento/${finId}/simulacoes`, {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

/**
 * Lista as simulações salvas de um financiamento.
 *
 * @param {number} finId
 * @param {{veredito?: string}} [opcoes={}]
 * @returns {Promise<Array>}
 */
function listarSimulacoes(finId, opcoes = {}) {
  return apiFetch(`/financiamento/${finId}/simulacoes${montarQuery(opcoes)}`);
}

/**
 * Recalcula uma simulação salva via PUT.
 *
 * @param {number} finId
 * @param {number} simId
 * @param {Object} dados
 * @returns {Promise<Object>}
 */
function atualizarSimulacao(finId, simId, dados) {
  return apiFetch(`/financiamento/${finId}/simulacoes/${simId}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  });
}

/**
 * Remove uma simulação salva via DELETE.
 *
 * @param {number} finId
 * @param {number} simId
 * @returns {Promise<Object>}
 */
function deletarSimulacao(finId, simId) {
  return apiFetch(`/financiamento/${finId}/simulacoes/${simId}`, {
    method: 'DELETE',
  });
}
