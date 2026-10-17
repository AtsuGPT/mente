# Minha Mente

Blog pessoal em Next.js com painel administrativo e PostgreSQL.

## Stack

- Next.js 16
- React 19
- Prisma ORM
- PostgreSQL
- Tailwind CSS

## Desenvolvimento local

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Crie o banco local com PostgreSQL:
   ```bash
   docker compose up -d
   ```
   ou use uma instância local do PostgreSQL.
3. Copie e ajuste o arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```
4. Execute as migrações:
   ```bash
   npm run db:deploy
   ```
5. Inicie a aplicação:
   ```bash
   npm run dev
   ```

## Variáveis de ambiente

As variáveis necessárias são:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
SITE_URL="https://seu-dominio.com"
ADMIN_EMAIL="admin@exemplo.com"
ADMIN_PASSWORD_HASH="scrypt:16384:8:1:..."
SESSION_SECRET="valor-secreto-com-32+caracteres"
```

Para gerar o hash do administrador:

```bash
npm run admin:hash
```

Para gerar um segredo de sessão:

```bash
openssl rand -base64 48
```

## Deploy na Vercel

1. Faça o push do repositório para o GitHub.
2. Importe o projeto na Vercel.
3. Em "Environment Variables", configure os valores acima.
4. Use o banco PostgreSQL externo ou o Vercel Postgres.
5. Faça o deploy.
6. Depois do deploy, rode:
   ```bash
   npx prisma migrate deploy
   ```

## Observações

- O projeto depende de PostgreSQL e do Prisma.
- O GitHub Pages não é o destino ideal para esta aplicação, porque ela tem backend, autenticação e banco de dados.
- A Vercel é a opção recomendada para hospedagem deste projeto.
