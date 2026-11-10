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

## Cobertura

A lista de cobertura fica no banco, e o resto do sistema deve obedecê-la.

**Geografia (dados de referência).** O `id` de `Country` é o código ISO 3166-1 (`BR`). O `id` de `State` é país + `_` + código do estado (`BR_AC`), e o banco recusa qualquer outro formato. Nenhuma lista de países ou estados fica no código. A migração já cria o Brasil (`BR`) com as 27 UFs (`BR_AC` … `BR_TO`). `Country.hasStates` diz se o país usa estados:

- `true` (Brasil): toda cidade tem um estado, e ele precisa ser do mesmo país.
- `false` (ex.: Singapura): o país não tem linhas em `State`, e suas cidades não têm estado.
- O flag só muda enquanto o país não tem estados nem cidades.

**Cobertura.**

- Uma cidade só está em jogo se existir uma linha em `CoverageCity`: país + estado (quando houver) + `slug` do nome, ex.: `BR` / `PR` / `sao-jose-dos-pinhais`. Cidades homônimas em estados diferentes são cidades diferentes.
- Um site (`CoverageSite`) só está em jogo para as cidades que tiverem uma linha em `CoverageSiteCity` com ele. Um site sem nenhuma linha ali não é lido. Um portal que publica o Brasil inteiro continua restrito às cidades listadas para ele.
- `host` é o hostname exato, em minúsculas, sem esquema, porta ou caminho. `www.exemplo.com.br` e `exemplo.com.br` são sites diferentes.
- Apagar uma cidade a remove da lista de todos os sites. País ou estado com cidades não podem ser apagados.

Todo código que busca anúncios externos passa por `src/lib/coverage.ts`: `listCrawlTargets()` dá os pares (site, cidade) permitidos, e `assertCrawlAllowed(url, cidade)` deve ser chamado antes de cada requisição. Na dúvida, a resposta é "não": URL inválida, site ou cidade desconhecidos, cidade brasileira sem estado e pares sem linha são recusados. Nenhuma cidade vem cadastrada, então nada é lido até alguém adicionar linhas:

```sql
INSERT INTO "CoverageCity" ("id", "countryId", "stateId", "name", "slug")
VALUES (gen_random_uuid()::text, 'BR', 'BR_PR', 'Curitiba', 'curitiba');

INSERT INTO "CoverageSite" ("id", "host")
VALUES (gen_random_uuid()::text, 'www.exemplo.com.br');

INSERT INTO "CoverageSiteCity" ("siteId", "cityId")
SELECT site."id", city."id"
FROM "CoverageSite" site, "CoverageCity" city
WHERE site."host" = 'www.exemplo.com.br'
  AND city."countryId" = 'BR' AND city."stateId" = 'BR_PR' AND city."slug" = 'curitiba';
```

Para outro país, cadastre-o em `Country` com `hasStates` certo (ex.: `('US', 'United States', true)`) e, se houver, seus estados em `State` (ex.: `('US_OR', 'US', 'OR', 'Oregon')`). Em país sem estados, `stateId` fica `NULL`.

O `slug` deve ser igual a `citySlug(nome)` (sem acentos, minúsculas, palavras separadas por hífen). O banco rejeita códigos, hosts e slugs fora do formato.

## Context packs

Ainda não há `docs/context-pack/` neste repositório.

## Related

- OpenAI (chat)
- Prisma + PostgreSQL
- Resend (e-mail)
