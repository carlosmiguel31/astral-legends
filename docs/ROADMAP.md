# Roadmap incremental

Cada fase termina com: testes passando, typecheck limpo, documentação atualizada e algo
demonstrável. Nenhuma fase depende de _mocks_ permanentes.

## Fase 0 — Fundação ✅

Monorepo, `game-core` determinístico (RNG, matemática inteira, atributos, combate, progressão,
conteúdo inicial), contratos Zod, API Fastify (health, conteúdo, WebSocket), Prisma 7 com
migrações e garantias no banco, serviço de livro-razão idempotente, cliente React + Phaser,
Docker Compose (Postgres/Redis), Vitest, Playwright, ESLint/Prettier.

## Fase 1 — Conta, personagem, caça idle e inventário ✅

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

## Fase 2A — Sistema híbrido de waves ✅

Entregue e testado:

1. Waves de 15 vitórias por região, com modos **Avançar** (avanço automático, trava por nível,
   recuo após 3 falhas, parada no fim do conteúdo) e **Farmar** (repetir wave liberada).
2. Elite a cada 5 waves e chefe a cada 10, na 15ª posição: Lobo-Cometa Ancestral (wave 5) e
   Colosso do Eclipse Menor (wave 10) nos Campos do Alvorecer, com atributos próprios.
3. Recompensa de primeira conclusão única (ouro, essência, item raro/épico vinculado),
   protegida por motor, livro-razão, `source_ref` e índice único parcial.
4. Progresso independente por região (`region_progress`), histórico de conclusões
   (`wave_clears`) e auditoria de comandos (`hunt_commands`).
5. Comandos (modo/wave/região/equipamento) aplicados numa fronteira de liquidação: sem efeito
   retroativo, sem reroll, sem divergência entre abas, mesmo resultado com qualquer frequência
   de consulta.
6. Migração incremental que preserva a Fase 1 (caçadas ativas seguem como Farmar wave 1).
7. Interface: painel de waves, HUD com wave e modo, histórico de conclusões, cena com destaque
   de elite/chefe, efeito de conclusão, golpes e derrotas mais expressivos e patrulha enquanto
   procura monstros.
8. Simulação de balanceamento (3 classes × 4 afinidades × 3 regiões) com limites verificados em
   teste (`BALANCE.md`).

Pendente da Fase 2A (conteúdo, não motor): waves 5–10 do Bosque e do Desfiladeiro, com seus
elites e chefes originais (monstros, sprites e itens).

## Fase 2B — Redesign visual premium ✅ (esta entrega)

Entregue e testado:

1. Design system com tokens (cores, tipografia, espaçamento, bordas, sombras, animações,
   breakpoints) e componentes reutilizáveis (`docs/DESIGN_SYSTEM.md`).
2. Navegação com Jogar/Personagem/Inventário/Mapa; Conquistas, Rankings, Chefes, PvP, Mercado,
   Passe, amigos, correio e configurações reservados e desabilitados ("Em breve").
3. HUD do personagem com XP, vida, ouro, essência, região, wave e estado da caçada.
4. Mapa Phaser como elemento central: cenários noturnos em pixel art procedural por região,
   palco panorâmico, personagens em escala inteira, placas e barras de vida legíveis, dano
   flutuante, transições de wave, tochas animadas.
5. Painel de caça com ilustração da região, regiões, etapas de wave, Avançar/Farmar e
   recompensas; registro de combate com filtros; painel de retorno offline; chat reservado.
6. Personagem (slots ao redor do retrato) e inventário em janelas, sem sair do jogo.
7. Layout adaptado ao celular (HUD compacta, barra inferior, folhas) e testado em 1920×1080,
   1366×768, tablet e celular.

## Fase 2C — Cenários e sprites

Cenários desenhados à mão por região, sprites de herói por classe com animações (ataque,
golpe recebido, vitória), monstros e chefes com mais quadros, ilustrações das regiões,
molduras de raridade desenhadas e partículas. Waves 5–10 do Bosque e do Desfiladeiro com
seus elites e chefes.

## Fase 2D — Aprimoramento e operação

Aprimoramento de itens (+1…+15, `idempotency_records`),
verificação de e-mail e recuperação de senha, painel admin mínimo com auditoria,
Dockerfiles + Caddy (HTTPS) + CI, reconciliação de economia, métricas (Prometheus) e retenção do
histórico de caça (incluindo `wave_clears` e `hunt_commands`). **Fecha o MVP.**

## Fase 3 — Social e mercado

Chat por região com moderação, amigos, guildas; mercado com custódia (escrow), taxas como
sumidouro, limites e detecção de padrões anômalos; histórico de propriedade de itens.

## Fase 4 — Conteúdo e profundidade

Dungeons, conjuntos de constelação, especializações, eventos sazonais, ranking.

## Fase 5 — Monetização (condicionada a parecer jurídico)

Somente após avaliação legal e de compliance: compra de diamantes para conveniências sem vantagem
competitiva, via provedor de pagamento, com serviço financeiro isolado. RMT/saques permanecem
**fora** até haver estrutura regulatória adequada (ver `RISKS.md`).
