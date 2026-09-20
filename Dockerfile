# ─────────────────────────────────────────────────────────────────────────────
# Estágio 1 — vendor
#
# Baixa Bootstrap, Bootstrap Icons e Chart.js. Fazer isso no build garante que
# a imagem final seja autocontida: nenhum arquivo é buscado em CDN quando o
# usuário abre a página. Se o desenvolvedor já rodou scripts/baixar-vendor.sh,
# o COPY aproveita os arquivos e o download é pulado.
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.20 AS vendor

ARG BOOTSTRAP_VERSAO=5.3.3
ARG ICONES_VERSAO=1.11.3
ARG CHARTJS_VERSAO=4.4.3

RUN apk add --no-cache curl bash sed

WORKDIR /build

COPY scripts/ ./scripts/
COPY vendor* ./vendor/

RUN chmod +x scripts/baixar-vendor.sh \
    && if [ ! -f vendor/bootstrap.min.css ]; then \
         ./scripts/baixar-vendor.sh; \
       else \
         echo "vendor/ já populado — download ignorado."; \
       fi

# ─────────────────────────────────────────────────────────────────────────────
# Estágio 2 — servidor
#
# nginx serve os arquivos estáticos e repassa /api/ para o container da API
# pela rede interna do Docker. Esse proxy elimina o CORS e faz a interface
# funcionar sem depender de nenhuma porta publicada no host.
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="Amortiza ou Investe? — Interface"
LABEL org.opencontainers.image.description="Interface do simulador de financiamento imobiliário"
LABEL org.opencontainers.image.source="https://github.com/SaraWolfP/software-architecture-mvp-front"

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html /usr/share/nginx/html/
COPY css/       /usr/share/nginx/html/css/
COPY js/        /usr/share/nginx/html/js/
COPY --from=vendor /build/vendor/ /usr/share/nginx/html/vendor/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1
