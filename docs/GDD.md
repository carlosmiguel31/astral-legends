# Game Design Document (inicial) — Astral Legends: O Despertar

> Documento vivo. Nomes e números são provisórios. Universo, personagens e arte são **originais**:
> nenhuma referência visual ou narrativa a franquias existentes.

## 1. Visão

Um Idle MMORPG de fantasia astral no navegador. O jogador desperta como um guerreiro ligado a
uma constelação, escolhe classe e afinidade, e caça automaticamente por regiões cada vez mais
perigosas. A graça está nas **decisões** — onde caçar, o que equipar, quando aprimorar, quando
enfrentar um chefe — e não em clicar repetidamente.

**Pilares**

1. _Progresso que respeita o tempo_: avanço offline com teto, sem punição por ausência curta.
2. _Escolhas significativas_: afinidades em ciclo, classes com papéis claros, itens com identidade.
3. _Mundo vivo_: outros jogadores visíveis, chefes, e (depois) economia entre jogadores.
4. _Justiça_: resultados decididos pelo servidor; nada de pagar para pular conteúdo competitivo.

**Público**: jogadores de idle/RPG em sessões curtas (5–15 min) várias vezes ao dia, desktop e mobile.

## 2. Universo

Há eras, o céu se partiu no **Eclipse Primordial**, e fragmentos das constelações caíram como
poeira estelar. Algumas pessoas nascem com essa poeira no sangue: os **Despertos**. Cada Desperto
ressoa com uma das quatro **afinidades** — Solar, Lunar, Tempestade, Abissal — e serve a uma das
ordens antigas. O **Vazio** que escapou pela rachadura corrompe criaturas e terras; os Despertos
caçam essa corrupção para recolher **essência astral** e restaurar o firmamento.

Tom: aventura luminosa com toques melancólicos. Direção de arte: mundo em **pixel art 2D**
(top-down) e **retratos/ilustrações em estilo anime** para personagens, chefes e eventos.

## 3. Classes iniciais

| Classe                  | Ordem                 | Fantasia                                                | Papel                                          |
| ----------------------- | --------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| **Guardião Astral**     | Ordem da Égide        | Cavaleiro de armadura que ergue escudos de luz estelar  | Resistente, golpes lentos, reduz dano recebido |
| **Arcanista Celestial** | Círculo do Astrolábio | Estudioso que lê órbitas como grimórios                 | Dano alto que ignora defesa, frágil            |
| **Lâmina Estelar**      | Irmandade do Cometa   | Duelista veloz guiado pelo rastro das estrelas cadentes | Muitos ataques e críticos                      |

Futuro (pós-MVP): especializações no nível 30 (duas por classe) e habilidades ativas automáticas
com prioridade configurável.

## 4. Afinidades

Escolhidas na criação (troca futura por item raro). Cada uma concede uma passiva e participa de um
ciclo de vantagem: **Solar → Abissal → Lunar → Tempestade → Solar** (×1,25 / ×0,80).
Monstros e chefes também têm afinidade, o que torna a escolha de região estratégica.

## 5. Loop de jogo

```
Escolher região ─▶ Caça automática (encontros) ─▶ XP, ouro, essência, itens
      ▲                                                     │
      └── Equipar / aprimorar / enfrentar chefe ◀───────────┘
```

- **Curto (minutos)**: ver a caça, coletar recompensas, equipar drops melhores.
- **Médio (horas)**: subir de nível, liberar a próxima região, aprimorar armaduras.
- **Longo (dias)**: derrotar chefes regionais, completar conjuntos, dungeons, mercado.

## 6. Mundo e conteúdo

| Região                         | Níveis | Afinidade dominante | Chefe                    | Fase    |
| ------------------------------ | ------ | ------------------- | ------------------------ | ------- |
| Campos do Alvorecer            | 1–6    | mista               | Colosso do Eclipse Menor | MVP     |
| Bosque das Marés de Prata      | 6–12   | Lunar               | —                        | MVP     |
| Desfiladeiro dos Trovões       | 12–20  | Tempestade          | —                        | MVP     |
| Ruínas do Observatório Partido | 20–30  | Abissal             | —                        | pós-MVP |

Monstros dos Campos do Alvorecer (implementados): Brotolume (Solar), Lobo-Cometa (Tempestade),
Vigia de Quartzo (Lunar) e o chefe Colosso do Eclipse Menor (Abissal).

**Dungeons** (pós-MVP): sequência curta de encontros com chefe, entrada limitada por dia,
recompensas garantidas de conjunto.

## 7. Itens e armaduras

- Slots: arma, cabeça, peito, mãos, pernas, pés.
- Raridades: Comum, Incomum, Rara, Épica, Lendária, **Astral** (cosmeticamente única).
- Cada item tem bônus sorteados na criação (atributos e/ou estatísticas), guardados no próprio item.
- **Aprimoramento** +1…+15 com custo crescente em ouro e essência; +8% nos bônus por nível.
  Falha sem perda do item no MVP (decisão consciente para evitar frustração e mecânica de aposta).
- **Características de armadura**: conjuntos de constelação (2/4/6 peças) com bônus temáticos
  (pós-MVP).
- Itens de chefe podem ser **vinculados** (não negociáveis) para proteger a economia.

## 8. Moedas

| Moeda               | Fonte                                                  | Usos (sumidouros)                                | Negociável           |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------ | -------------------- |
| **Ouro**            | caça, venda a NPC                                      | aprimoramento, reparos, taxas do mercado         | sim (futuro mercado) |
| **Essência astral** | caça (chance), chefes                                  | aprimoramento, crafting                          | não no MVP           |
| **Diamantes**       | **somente** concessão administrativa/testes nesta fase | conveniências futuras (sem vantagem competitiva) | não                  |

Princípios: toda moeda tem sumidouros; nenhum diamante é comprado ou convertido em dinheiro nesta
fase; nenhuma _loot box_ paga (ver `RISKS.md` — ECA Digital).

## 9. Social e economia entre jogadores (pós-MVP)

Chat por região, lista de amigos, guildas, ranking por região/classe e **mercado** com custódia
(escrow), taxa como sumidouro de ouro, limites anti-lavagem e trilha de auditoria completa.
Integração financeira (RMT) só após avaliação jurídica — ver `RISKS.md`.

## 10. Interface

- Tela principal: mapa Phaser da região (personagem caçando), barra de status, log de combate,
  painel de recompensas pendentes.
- Painéis React: personagem, inventário/equipamento, regiões, aprimoramento, configurações.
- Mobile-first na interface; o canvas se ajusta mantendo pixels nítidos.
- Acessibilidade: textos com contraste AA, tudo navegável por teclado, sem informação só por cor.
