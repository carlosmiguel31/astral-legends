# Roadmap incremental

Cada fase termina com: testes passando, typecheck limpo, documentação atualizada e algo
demonstrável. Nenhuma fase depende de _mocks_ permanentes.

## Fase 0 — Fundação ✅ (esta entrega)

Monorepo, `game-core` determinístico (RNG, matemática inteira, atributos, combate, progressão,
conteúdo inicial), contratos Zod, API Fastify (health, conteúdo, WebSocket), Prisma 7 com
migrações e garantias no banco, serviço de livro-razão idempotente, cliente React + Phaser,
Docker Compose (Postgres/Redis), Vitest, Playwright, ESLint/Prettier.

## Fase 1 — Conta, personagem, caça idle e inventário ✅ (validada nesta entrega)

Entregue e testado:

1. Auth: cadastro/login/logout, Argon2id, sessões opacas em cookies HttpOnly, refresh rotativo
   com detecção de reuso, “sair de todos os dispositivos”, CSRF em camadas, bloqueio por
   tentativas (conta e IP) e limites por rota.
2. Personagem: criação com nome validado/único, classe, afinidade e aparência; 1 por conta;
   arma inicial; atributos sempre do servidor.
3. Caça: iniciar/parar/trocar região, liquidação determinística com teto de 8 h, recompensas
   no livro-razão, histórico imutável, proteção contra duplicação e corrida.
4. Inventário: listar, equipar/desequipar (integra ao combate), descartar com auditoria.
5. Tempo real: WebSocket autenticado com pub/sub no Redis; múltiplas abas sincronizadas.
6. Cliente: telas de acesso, criação, jogo com HUD, cena Phaser reproduzindo o servidor,
   resumo do progresso offline, reconexão automática.

Pendentes da Fase 1 (movidos para a Fase 2): empacotamento para VPS (Dockerfiles, Caddy com
HTTPS), CI no GitHub Actions, reconciliação periódica de economia e métricas.

## Fase 2 — Aprimoramento, chefe e operação

Aprimoramento de itens (+1…+15, `idempotency_records`), primeiro chefe com tentativas
limitadas, verificação de e-mail e recuperação de senha, painel admin mínimo com auditoria,
Dockerfiles + Caddy (HTTPS) + CI, reconciliação de economia, métricas (Prometheus) e retenção do
histórico de caça. **Fecha o MVP.**

## Fase 3 — Social e mercado

Chat por região com moderação, amigos, guildas; mercado com custódia (escrow), taxas como
sumidouro, limites e detecção de padrões anômalos; histórico de propriedade de itens.

## Fase 4 — Conteúdo e profundidade

Dungeons, conjuntos de constelação, especializações, eventos sazonais, ranking.

## Fase 5 — Monetização (condicionada a parecer jurídico)

Somente após avaliação legal e de compliance: compra de diamantes para conveniências sem vantagem
competitiva, via provedor de pagamento, com serviço financeiro isolado. RMT/saques permanecem
**fora** até haver estrutura regulatória adequada (ver `RISKS.md`).
