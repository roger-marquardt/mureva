# Mureva

Chat em português para qualificar quem quer comprar um imóvel. A Mureva conduz a conversa; cada mensagem, cada chamada à IA (tokens, modelo e custo estimado) e a origem do visitante (IP e localidade) ficam no PostgreSQL. Ao fim da conversa — ou quando a pessoa sai da página — a equipe recebe um e-mail com os dados e a conversa completa. Os preços por modelo ficam na tabela `ModelPrice`.

## Build

- Node.js 22+
- PostgreSQL 16 (local via Docker ou o add-on do Railway)

```bash
npm install
cp .env.example .env.local
docker compose up -d
npx prisma migrate deploy
npm run dev
```

Preencha `OPENAI_API_KEY` em `.env.local`. Sem `RESEND_API_KEY` e `EMAIL_TO`, o e-mail não é enviado (fica registrado em `Conversation.emailError`). Sem `IPINFO_TOKEN`, só o IP é guardado.

O Prisma CLI lê `.env`, não `.env.local`: exporte `DATABASE_URL` no terminal antes de rodar `prisma migrate` ou `prisma studio`.

## Test

```bash
npm test
npm run lint
```

## Deploy

Railway: um serviço web (este repositório) e um PostgreSQL.

1. Crie o projeto e adicione o plugin PostgreSQL.
2. Ligue `DATABASE_URL` ao serviço web.
3. Defina `OPENAI_API_KEY`, `EMAIL_TO`, `RESEND_API_KEY` e, opcionalmente, `IPINFO_TOKEN` / `IPINFO_PLAN`.
4. O start já roda `prisma migrate deploy` e `next start` (`railway.toml`).

O app escuta a porta `PORT` injetada pelo Railway.

## Context packs

Ainda não há `docs/context-pack/` neste repositório.

## Related

- OpenAI (chat)
- Prisma + PostgreSQL
- Resend (e-mail)
