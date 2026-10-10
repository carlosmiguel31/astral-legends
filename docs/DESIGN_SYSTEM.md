# Design System — Astral Legends (Fase 2B)

Identidade: **fantasia astral premium** — azul-noturno profundo, superfícies índigo, ouro como
destaque, violeta para magia e ciano para energia. Pixel art no mundo do jogo; interface com
molduras douradas finas, cantos ornamentados e brilhos discretos. Tudo original.

- Tokens: `apps/web/src/styles.css` (bloco `@theme` do Tailwind 4).
- Componentes: `apps/web/src/components/ui/` (exportados por `components/ui/index.ts`).
- Ícones: `components/icons.tsx` (vetoriais) e `components/pixelIcons.tsx` (pixel art).
- Cenários: `game/backdrop.ts` (pixel art procedural, usado pela cena e pelas miniaturas).

Regra geral: **nenhum valor visual solto**. Cores, raios, sombras e animações vêm dos tokens;
componentes de tela só combinam componentes do design system.

## 1. Tokens

### Cores

| Grupo       | Tokens                                                                                      | Uso                                  |
| ----------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| Superfícies | `night-950` (fundo) · `night-900` · `night-850` · `night-800` · `night-700` · `indigo-deep` | fundo, painéis, controles            |
| Identidade  | `astral-gold` · `astral-gold-soft` · `astral-gold-deep`                                     | destaques, títulos, botões primários |
|             | `astral-violet` · `astral-violet-deep`                                                      | magia, elites, filtros ativos        |
|             | `astral-cyan`                                                                               | foco do teclado, energia             |
| Jogo        | `hp` / `hp-soft` (vida) · `xp` / `xp-soft` (experiência)                                    | barras da HUD                        |
|             | `gold-coin` · `essence`                                                                     | moedas                               |
| Estado      | `success` · `warning` · `danger`                                                            | avisos                               |
| Afinidades  | `solar` · `lunar` · `storm` · `abyssal`                                                     | textos e marcadores de afinidade     |
| Raridades   | `rarity-common` … `rarity-astral`                                                           | texto, moldura e brilho de itens     |

Contraste: textos principais `slate-50/100/200` sobre `night-*` (AA). Texto auxiliar no mínimo
`slate-400`; `slate-500` só em informação redundante (horário do registro, por exemplo).

### Tipografia

| Token          | Fonte                                                             | Uso                                 |
| -------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `font-display` | **Cinzel** 600/700 (OFL, auto-hospedada via `@fontsource/cinzel`) | títulos, placas, abas, HUD          |
| `font-sans`    | Segoe UI / system-ui                                              | texto corrido, números, formulários |
| `font-mono`    | ui-monospace / Cascadia / Consolas                                | horários do registro de combate     |
| `text-micro`   | 11 px                                                             | legendas                            |

Cinzel é usada só em títulos curtos (é uma fonte em versaletes); textos longos usam `font-sans`.
A fonte é servida pelo próprio app: nenhuma requisição a serviços externos.

### Espaçamento, bordas, sombras

| Token                                   | Valor                  | Uso                                   |
| --------------------------------------- | ---------------------- | ------------------------------------- |
| `--spacing-gutter`                      | 0,75 rem               | espaço entre painéis                  |
| `--spacing-panel`                       | 1 rem                  | padding interno de painéis            |
| `--spacing-touch`                       | 2,75 rem (44 px)       | alvo mínimo de toque                  |
| `--radius-panel` / `-control` / `-chip` | 14 / 10 / 6 px         | painéis / botões e campos / selos     |
| `--shadow-panel`                        | sombra escura + filete | todos os painéis                      |
| `--shadow-glow-gold` / `-violet`        | anel + brilho suave    | item ativo, aba ativa, botão primário |

### Animações

| Token             | Uso                                               |
| ----------------- | ------------------------------------------------- |
| `animate-rise-in` | entrada de cartões, modais e itens do inventário  |
| `animate-fade-in` | novas linhas do registro de combate               |
| `animate-pop`     | notificações e painel de retorno                  |
| `animate-shimmer` | reservado para carregamentos                      |
| `--ease-astral`   | curva padrão (barras de XP/vida animam a largura) |

`prefers-reduced-motion` desliga as animações da interface. A cena Phaser mantém só o mínimo.

### Breakpoints

| Nome  | Largura | Layout                                                               |
| ----- | ------- | -------------------------------------------------------------------- |
| base  | < 640   | celular: HUD compacta, palco 16:9, barra inferior, painéis em folhas |
| `sm`  | 640     | celular grande: palco 20:9                                           |
| `md`  | 768     | tablet retrato: cartão de wave em três colunas                       |
| `lg`  | 1024    | **duas colunas**: mapa + painel lateral com abas, navegação completa |
| `xl`  | 1280    | notebook 1366: rótulos na navegação, registro e chat lado a lado     |
| `2xl` | 1536    | desktop 1920: painel lateral 540 px, palco panorâmico 14:5           |

O layout muda em `lg` via `useIsDesktop()` (`lib/useMediaQuery.ts`) — cada controle é montado
uma única vez, no lugar certo; o celular não é o desktop encolhido.

## 2. Componentes (`components/ui`)

| Componente                   | Para quê                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Button`                     | variantes `primary` (ouro), `secondary` (índigo), `gold-outline`, `danger`, `ghost`; tamanhos `sm`/`md`/`lg`; `icon`; `busy` |
| `IconButton`                 | botão quadrado só com ícone, sempre com rótulo acessível; `badge` opcional                                                   |
| `Panel` / `SectionTitle`     | moldura ornamentada (`astral-frame`), título em Cinzel com ícone, ações à direita                                            |
| `Modal`                      | `<dialog>` nativo: foco preso, Esc e clique no fundo fecham; `sheet` = folha inferior no celular                             |
| `Tabs`                       | padrão WAI-ARIA (setas trocam); `plaque` (abas douradas) e `chips` (filtros)                                                 |
| `Tooltip` / `SoonBadge`      | dica no hover e no foco (ligada por `aria-describedby`); selo "Em breve"                                                     |
| `ProgressBar`                | barra contínua (`xp`, `hp`, `gold`, `violet`, `cyan`); tamanho `lg` com texto dentro                                         |
| `SegmentedBar`               | 15 segmentos da wave; último segmento marca elite (◆) ou chefe (♛)                                                           |
| `RarityBadge` + `RARITY_*`   | texto, moldura e fundo por raridade                                                                                          |
| `ItemSlot`                   | slot de equipamento/inventário (vazio = contorno; com item = cor da raridade; ✓ equipado)                                    |
| `EmptyState` / `Loading`     | estados vazios, indisponíveis e de carregamento                                                                              |
| `ToastProvider` / `useToast` | notificações empilhadas, não bloqueantes (`aria-live`)                                                                       |
| `RewardTile` / `RewardIcon`  | blocos de recompensa (XP, ouro, essência, itens, tempo, nível, waves, encontros)                                             |
| `Field` / `Alert`            | formulários e avisos                                                                                                         |

Outros componentes compartilhados: `Logo` / `AstralEmblem` (emblema de estrela-bússola
original), `RegionArt` (miniatura da região), `HeroPortrait`.

### Ícones

- **Vetoriais** (`Icon name="…"`): navegação, slots de equipamento, ações. Traço de 1,75 px,
  `currentColor`, desenhados para o jogo.
- **Pixel art** (`PixelIcon name="coin|essence|chest|star"`): recompensas. SVG com
  `crispEdges` — nítidos em qualquer tamanho.

## 3. Telas (`screens/game`)

| Arquivo              | Conteúdo                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `TopNav.tsx`         | logotipo, Jogar/Personagem/Inventário/Mapa (abrem janelas), módulos futuros desabilitados, conta    |
| `Hud.tsx`            | avatar, nome, nível, classe, afinidade, XP, vida, ouro, essência, região, wave, estado              |
| `Stage.tsx`          | palco Phaser com a placa da região/wave; cartão "Progresso da Wave"                                 |
| `HuntPanel.tsx`      | região (ilustração, descrição, iniciar/parar), regiões, etapas de wave, Avançar/Farmar, recompensas |
| `CombatLog.tsx`      | registro de combate com filtros (Todos, Combate, Recompensas, Progresso)                            |
| `ChatPanel.tsx`      | espaço **reservado** para o chat (desabilitado, sem mensagens)                                      |
| `CharacterPanel.tsx` | equipamento em slots ao redor do retrato, atributos e estatísticas                                  |
| `InventoryPanel.tsx` | itens com slot, raridade, bônus, equipar/desequipar/descartar                                       |
| `HistoryPanel.tsx`   | conclusões de wave e liquidações                                                                    |
| `OfflineSummary.tsx` | painel "Bem-vindo de volta" (não modal)                                                             |

## 4. Princípios

1. **Sem dados fictícios.** Todo número vem do servidor. Módulos não implementados aparecem
   desabilitados com "Em breve"; o chat não mostra mensagens inventadas.
2. **Uma fonte da verdade visual.** Tokens → componentes → telas.
3. **Legibilidade antes de brilho.** Brilhos só em itens ativos; molduras finas; sem gradientes
   atrás de texto corrido.
4. **Toque confortável.** Botões com pelo menos 44 px em telas de toque; nada de rolagem
   horizontal (testado em 412 px).
5. **Arte original e provisória identificada.** Cenários procedurais e sprites 16×16 são
   provisórios (Fase 2C trará cenários e sprites desenhados à mão).

## 5. Capturas (Fase 2B)

Geradas pelo Playwright com dados reais de uma conta de teste (`docs/screenshots/`):

| Tela                          | Arquivo                           |
| ----------------------------- | --------------------------------- |
| Jogo — desktop 1920×1080      | `fase2b-jogo-1920x1080.jpg`       |
| Jogo — notebook 1366×768      | `fase2b-jogo-1366x768.jpg`        |
| Jogo — tablet 820×1180        | `fase2b-jogo-tablet-820x1180.jpg` |
| Jogo — celular 412×915        | `fase2b-jogo-celular-412x915.jpg` |
| Personagem em folha (celular) | `fase2b-celular-personagem.jpg`   |
| Painel de retorno offline     | `fase2b-retorno-1920.jpg`         |
| Acesso                        | `fase2b-login-1920.jpg`           |
