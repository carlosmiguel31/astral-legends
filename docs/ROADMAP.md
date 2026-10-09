# Roadmap incremental

Cada fase termina com: testes passando, typecheck limpo, documentação atualizada e algo
demonstrável. Nenhuma fase depende de _mocks_ permanentes.

## Fase 0 — Fundação ✅ (esta entrega)

Monorepo, `game-core` determinístico (RNG, matemática inteira, atributos, combate, progressão,
conteúdo inicial), contratos Zod, API Fastify (health, conteúdo, WebSocket), Prisma 7 com
migrações e garantias no banco, serviço de livro-razão idempotente, cliente React + Phaser,
Docker Compose (Postgres/Redis), Vitest, Playwright, ESLint/Prettier.

## Fase 1 — Conta, personagem e caça idle

1. Auth: cadastro/login, argon2id, refresh token rotativo, cookies seguros, rate limit por rota.
2. Personagens: criação com validação de nome, consulta de estado.
3. **Liquidação de caça** (`game-core/idle.ts` + `modules/hunt`): seleção de monstro, recompensas,
   transação única com lock otimista, idempotência por intervalo de encontros.
4. Eventos em tempo real da caça; cena Phaser reproduzindo eventos do servidor.
5. Reconciliação de economia e métricas de ouro criado/destruído.
6. Empacotamento: Dockerfiles da API e do web, Caddy com HTTPS, CI (GitHub Actions) rodando
   lint, typecheck, unitários, integração (serviços Postgres/Redis) e E2E.

## Fase 2 — Itens e chefe

Definições de itens e tabelas de drop, geração de bônus por raridade, inventário/equipar,
aprimoramento (`idempotency_records`), primeiro chefe com tentativas limitadas, segunda e
terceira regiões, painel admin mínimo com auditoria. **Fecha o MVP.**

## Fase 3 — Social e mercado

Chat por região com moderação, amigos, guildas; mercado com custódia (escrow), taxas como
sumidouro, limites e detecção de padrões anômalos; histórico de propriedade de itens.

## Fase 4 — Conteúdo e profundidade

Dungeons, conjuntos de constelação, especializações, eventos sazonais, ranking.

## Fase 5 — Monetização (condicionada a parecer jurídico)

Somente após avaliação legal e de compliance: compra de diamantes para conveniências sem vantagem
competitiva, via provedor de pagamento, com serviço financeiro isolado. RMT/saques permanecem
**fora** até haver estrutura regulatória adequada (ver `RISKS.md`).
