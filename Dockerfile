# Imagem do Minha Mente (Next.js + Prisma/SQLite).
# Versão inicial, em um estágio: mesma forma de rodar que "npm run start".

# Node 24 (LTS) sobre Debian 13 "trixie", variante enxuta.
FROM node:24-trixie-slim

# O Prisma detecta a versão do OpenSSL do sistema para escolher o motor certo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1) Dependências. Só os manifestos e o schema entram antes do "npm ci":
#    enquanto eles não mudarem, o Docker reaproveita esta camada (cache).
#    O schema precisa estar aqui porque o postinstall roda "prisma generate".
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 2) Código e build de produção (gera o cliente Prisma para Linux e roda next build).
#    O next build importa as rotas para ler a configuração delas, e lib/db.ts exige
#    um DATABASE_URL "file:" ao ser importado. Este valor descartável vale só para
#    este comando (não vira ENV da imagem) e nenhuma consulta é feita no build.
COPY . .
RUN DATABASE_URL="file:/tmp/build.db" npm run build

# 3) Execução.
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
