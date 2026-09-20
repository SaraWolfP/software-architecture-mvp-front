#!/usr/bin/env bash
#
# baixar-vendor.sh
# Baixa Bootstrap, Bootstrap Icons e Chart.js para a pasta vendor/.
#
# A aplicação não carrega nada de CDN em tempo de execução: um container que
# depende de CDN não é autocontido e a interface abre quebrada se a rede do
# usuário bloquear o domínio. Rode este script uma vez após clonar o repositório.
#
# Uso:
#   ./scripts/baixar-vendor.sh
#
set -euo pipefail

BOOTSTRAP_VERSAO="5.3.3"
ICONES_VERSAO="1.11.3"
CHARTJS_VERSAO="4.4.3"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="${RAIZ}/vendor"
FONTES="${VENDOR}/fonts"

mkdir -p "${FONTES}"

baixar() {
  local url="$1"
  local destino="$2"

  echo "  → $(basename "${destino}")"
  if ! curl -fsSL --retry 3 --max-time 60 "${url}" -o "${destino}"; then
    echo "ERRO: falha ao baixar ${url}" >&2
    exit 1
  fi
}

echo "Baixando bibliotecas para vendor/ ..."

BS="https://cdn.jsdelivr.net/npm/bootstrap@${BOOTSTRAP_VERSAO}/dist"
baixar "${BS}/css/bootstrap.min.css"        "${VENDOR}/bootstrap.min.css"
baixar "${BS}/js/bootstrap.bundle.min.js"   "${VENDOR}/bootstrap.bundle.min.js"

ICO="https://cdn.jsdelivr.net/npm/bootstrap-icons@${ICONES_VERSAO}/font"
baixar "${ICO}/bootstrap-icons.min.css"          "${VENDOR}/bootstrap-icons.min.css"
baixar "${ICO}/fonts/bootstrap-icons.woff2"      "${FONTES}/bootstrap-icons.woff2"
baixar "${ICO}/fonts/bootstrap-icons.woff"       "${FONTES}/bootstrap-icons.woff"

baixar "https://cdn.jsdelivr.net/npm/chart.js@${CHARTJS_VERSAO}/dist/chart.umd.min.js" \
       "${VENDOR}/chart.umd.min.js"

# O CSS dos ícones referencia as fontes com um sufixo de cache-busting
# (?#iefix&v=1.11.3) que não existe no arquivo baixado. Remover o sufixo
# faz os ícones carregarem a partir de vendor/fonts/.
if sed --version >/dev/null 2>&1; then
  sed -i 's|?#iefix&v=[0-9.]*||g; s|?v=[0-9.]*||g' "${VENDOR}/bootstrap-icons.min.css"
else
  # BSD sed (macOS) exige o argumento de sufixo em -i
  sed -i '' 's|?#iefix&v=[0-9.]*||g; s|?v=[0-9.]*||g' "${VENDOR}/bootstrap-icons.min.css"
fi

echo
echo "Pronto. Arquivos em ${VENDOR}:"
ls -lh "${VENDOR}" | tail -n +2
