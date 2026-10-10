# Regras fundamentais de combate e progressão

> Implementadas em `packages/game-core` · `RULESET_VERSION = 2` (Fase 1).
> Todas as fórmulas usam **inteiros**; percentuais em basis points (bp): `10_000 bp = 100%`.
> Toda divisão arredonda para baixo (`floor`). Qualquer mudança que altere resultados exige
> incrementar `RULESET_VERSION` e atualizar os snapshots de regressão.

## 1. Atributos primários

| Atributo           | Efeito                                                 |
| ------------------ | ------------------------------------------------------ |
| Força (`str`)      | Ataque do Guardião e da Lâmina; metade compõe a defesa |
| Intelecto (`int`)  | Ataque do Arcanista                                    |
| Agilidade (`agi`)  | +20 bp de crítico por ponto; acelera ataques           |
| Vitalidade (`vit`) | +10 de vida por ponto; metade compõe a defesa          |

Atributos no nível _L_ = `base da classe + crescimento × (L − 1)`, somados aos bônus de equipamento.

| Classe              | Base (str/int/agi/vit) | Por nível        | Intervalo base | Crítico × | Passiva              |
| ------------------- | ---------------------- | ---------------- | -------------- | --------- | -------------------- |
| Guardião Astral     | 8 / 3 / 4 / 12         | +2 / 0 / +1 / +3 | 1600 ms        | 150%      | −10% dano recebido   |
| Arcanista Celestial | 3 / 12 / 5 / 7         | 0 / +3 / +1 / +2 | 1500 ms        | 160%      | ignora 25% da defesa |
| Lâmina Estelar      | 9 / 3 / 10 / 8         | +2 / 0 / +3 / +2 | 1100 ms        | 175%      | — (crítico alto)     |

## 2. Estatísticas derivadas

```
vidaMáx      = 50 + vit × 10 + bônusVida
ataque       = atributoPrincipal × 2 + bônusAtaque
defesa       = floor((vit + str) / 2) + bônusDefesa
críticoBp    = 500 + agi × 20 + bônusCrítico          (teto: 6000 bp)
intervaloMs  = floor(intervaloBase × 10000 / (10000 + agi × 30))   (mínimo: 400 ms)
```

Depois aplica-se a passiva da **afinidade**:

| Afinidade  | Passiva                          | Vence      |
| ---------- | -------------------------------- | ---------- |
| Solar      | +5% ataque                       | Abissal    |
| Abissal    | +8% vida                         | Lunar      |
| Lunar      | +3 pontos percentuais de crítico | Tempestade |
| Tempestade | ataques 5% mais rápidos          | Solar      |

Ciclo: **Solar → Abissal → Lunar → Tempestade → Solar**. Vantagem: dano ×1,25. Desvantagem: ×0,80.

### Equipamento

Cada item tem bônus planos sorteados na criação e persistidos (`item_instances.bonuses`).
Aprimoramento `+n` amplia todos os bônus do item em `n × 8%` (máximo `+15` ⇒ +120%).
Um item por slot (`weapon, head, chest, hands, legs, feet`), garantido no código e no banco.

## 3. Combate (1×1, tempo discreto)

- Cada lado ataca a cada `intervaloMs`; o primeiro golpe ocorre após um intervalo.
- Empate de tempo: **o jogador age primeiro**.
- Duração máxima: 120 s (resultado `timeout`); teto rígido de 2000 ações.
- Cada golpe consome **exatamente 2 valores** do RNG, nesta ordem: variação, crítico.

```
defesaEfetiva = floor(defesa × (10000 − penetraçãoBp) / 10000)
dano          = floor(ataque × 100 / (100 + defesaEfetiva))
dano          = floor(dano × variaçãoBp / 10000)          variaçãoBp ∈ [9000, 11000]
se crítico:     dano = floor(dano × críticoPoderBp / 10000)
dano          = floor(dano × multiplicadorAfinidadeBp / 10000)
dano          = floor(dano × (10000 − reduçãoBp) / 10000)
dano          = max(1, dano)
```

### RNG

SFC32 (32 bits) com estado inicializado por `fmix32` (MurmurHash3). `int(min, max)` usa
amostragem por rejeição (sem viés de módulo). `deriveSeed(base, …partes)` cria sub-sementes
independentes — ex.: uma por encontro de caça. `Math.random` e `Date.now` são proibidos no
`game-core` por regra de lint.

### Referência (nível 1, semente 1, contra Brotolume)

Fixado no snapshot de regressão `combat.test.ts`: Guardião vence em 6,3 s; Arcanista em 4,4 s;
Lâmina em 3,2 s. Todas as classes nível 1 vencem o Brotolume em ≥ 95% das sementes; o chefe
Colosso do Eclipse Menor derrota personagens nível 1.

## 4. Progressão

```
XP para sair do nível L = 40·L² + 60·L      (1→2: 100 · 2→3: 280 · 10→11: 4600)
Nível máximo (MVP)       = 30
```

- Vários níveis podem ser ganhos de uma vez; no nível máximo a XP excedente é descartada.
- XP por abate: 100% até 2 níveis acima do monstro; depois −20% por nível, mínimo 10%.
  Monstros acima do nível do jogador não dão bônus (desestimula “carregar” personagens).

## 5. Caça idle (implementada — `idle.ts`)

Uma caçada é uma sequência de encontros numerados `0, 1, 2…`. Cada encontro usa três
sub-sementes independentes: `deriveSeed(semente, n, 0)` sorteia o monstro (pesos da região),
`…, 1` alimenta o combate e `…, 2` as recompensas. Linha do tempo de um encontro:

```
[procura 3 s] → [combate] → [recuperação]
recuperação = vitória: 0,1 s por ponto de vida perdido · derrota: 30 s · fuga (120 s de luta): 10 s
```

| Regra                               | Valor                                                     |
| ----------------------------------- | --------------------------------------------------------- |
| Teto de progresso offline           | 8 h (o excedente é descartado e registrado)               |
| Encontro só conta quando termina    | antes do instante da liquidação; a sobra fica para depois |
| Derrota / fuga                      | sem recompensa; a caçada continua                         |
| Entre encontros                     | a vida volta cheia (o custo é o tempo de recuperação)     |
| Acesso à região                     | nível ≥ `minLevel` (verificado ao iniciar e ao liquidar)  |
| Máximo por liquidação               | 20 000 encontros (8 h cabem em ≤ 9 600)                   |
| Equipar/desequipar/trocar de região | liquida antes; o passado usa o equipamento antigo         |
| Trocar modo ou wave                 | liquida antes e aplica numa fronteira (ver §5.1)          |

**Propriedade central (testada):** liquidar uma janela de uma vez ou em qualquer número de
pedaços produz exatamente o mesmo nível, XP, ouro, essência e itens — no `game-core` (37 pedaços
irregulares) e no banco real (relógio controlado, 7 pedaços).

### Recompensas por vitória (ordem fixa de consumo do RNG)

1. Ouro: inteiro uniforme em `[goldMin, goldMax]` do monstro.
2. Essência: 1 com probabilidade `essenceChanceBp`.
3. Item: com probabilidade `itemDropChanceBp` → item ponderado da tabela da região →
   raridade → bônus sorteados.

XP por abate segue a penalidade por diferença de nível (§4); arredondamento para baixo pode
resultar em 0 XP contra monstros muito mais fracos.

### 5.1 Waves (Fase 2A — `content/waves.ts`, `idle.ts`, `waveCommands.ts`)

Cada região tem uma sequência finita de waves. Uma wave é concluída com **15 vitórias**;
derrotas e fugas não contam (e não avançam a posição). O progresso é guardado por região.

| Regra                | Valor                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Encontro especial    | waves múltiplas de 5 → elite; de 10 → chefe; ocupa a 15ª vitória (posição 15)                                                              |
| Monstros comuns      | mesmos pesos da região; +4% atributos e +5% XP/ouro por wave (tetos ×1,6 e ×1,45)                                                          |
| Elite e chefe        | atributos e recompensas próprios (não escalam com a wave)                                                                                  |
| Nível mínimo da wave | `minLevel + ⌊(wave − 1) × (maxLevel − minLevel) / 9⌋` da região                                                                            |
| Modo **Avançar**     | ao concluir, vai para a próxima wave automaticamente                                                                                       |
| … nível insuficiente | repete a wave atual até ter o nível da próxima (aviso `level_gate`)                                                                        |
| … fim do conteúdo    | passa a Farmar a última wave implementada e avisa (`content_limit`); nunca cria waves                                                      |
| … 3 falhas seguidas  | recua uma wave e passa a Farmar (aviso `retreat`); o jogador reativa o Avançar quando quiser                                               |
| Modo **Farmar**      | ao concluir, repete a mesma wave                                                                                                           |
| Escolher wave        | só waves já liberadas (≤ maior concluída + 1) e permitidas pelo nível; recomeça a contagem                                                 |
| Trocar só o modo     | mantém a wave e as vitórias já obtidas                                                                                                     |
| Primeira conclusão   | ouro `50 × wave × tier`, essência `(1 + ⌊wave/5⌋) × tier` (+5 no chefe), item raro (elite) ou épico (chefe); **uma vez** por wave e região |
| Repetições           | só as recompensas normais dos abates                                                                                                       |

Sub-sementes: o fluxo `3` (`deriveSeed(semente, n, 3)`) sorteia o item da primeira conclusão,
sem alterar os fluxos de monstro, combate e recompensas. Na wave 1 os multiplicadores são
exatamente 100%: "Farmar wave 1" reproduz a Fase 1 bit a bit (teste de regressão).

**Comandos** (modo, wave, região, equipamento) são aplicados numa fronteira: liquida-se até o
instante do comando, o encontro em andamento é descartado e o próximo começa nesse instante,
com o mesmo índice. Resultado: os mesmos comandos nos mesmos instantes dão o mesmo estado,
independentemente de quantas consultas houve (ver `ARCHITECTURE.md`, ADR-08).

**Propriedades testadas:** liquidar em 1 ou N partes atravessando várias waves (game-core e
banco real); offline de 30 h respeita o teto de 8 h e conclui as 10 waves dos Campos; primeira
conclusão paga uma única vez mesmo com 8 liquidações simultâneas; trocas simultâneas de 4 abas
formam uma cadeia auditada sem divergência; reinício do servidor continua de onde parou.

Números e simulações completas: [`BALANCE.md`](./BALANCE.md).

## 6. Regiões e monstros (MVP)

| Região                    | Nível | Monstros (peso)                                                                        |
| ------------------------- | ----- | -------------------------------------------------------------------------------------- |
| Campos do Alvorecer       | 1–6   | Brotolume Nv1 (60), Lobo-Cometa Nv3 (30), Vigia de Quartzo Nv5 (10)                    |
| Bosque das Marés de Prata | 6–12  | Lince-de-Maré Nv7 (60), Água-Viva Prateada Nv9 (30), Raiz Sussurrante Nv11 (10)        |
| Desfiladeiro dos Trovões  | 12–20 | Grifo-de-Faísca Nv13 (60), Golem de Basalto Nv16 (25), Serpente de Relâmpago Nv19 (15) |

Encontros especiais (Fase 2A), só na 15ª posição das waves correspondentes:

| Especial                         | Wave          | Nv  | Afinidade  | Vida | Ataque | Defesa | Crítico | Intervalo | XP  | Ouro  | Essência | Item |
| -------------------------------- | ------------- | --- | ---------- | ---- | ------ | ------ | ------- | --------- | --- | ----- | -------- | ---- |
| Lobo-Cometa Ancestral (elite)    | 5 dos Campos  | 4   | Tempestade | 240  | 16     | 10     | 9%      | 1,3 s     | 40  | 14–22 | 15%      | 5%   |
| Colosso do Eclipse Menor (chefe) | 10 dos Campos | 6   | Abissal    | 560  | 22     | 16     | 5%      | 2,2 s     | 80  | 30–50 | 30%      | 10%  |

Bosque e Desfiladeiro têm 4 waves implementadas, ainda sem elite/chefe próprios.

### Balanceamento (simulação, sem equipamento, afinidade Lunar)

| Situação                       | Resultado                                                  |
| ------------------------------ | ---------------------------------------------------------- |
| Nível 1 nos Campos             | ~300–450 encontros/h; nível 1 → 6–7 em 1 h; ~0–1 derrota/h |
| Nível 6 no Bosque              | 6–15% dos encontros perdidos (contra a Raiz, nível 11)     |
| Nível 12 no Desfiladeiro       | 1–12% perdidos; Serpente (nível 19) ainda é perigosa       |
| No nível máximo de cada região | 0 derrotas/h, exceto Arcanista no Desfiladeiro (~7%)       |

Mudanças na Fase 1: XP dos monstros dos Campos reduzida (8/18/40), Arcanista ganhou +2 de
Vitalidade por nível (era +1; perdia ~50% no Bosque), tempo de procura 2 s → 3 s.

## 7. Itens

| Raridade (Fase 1) | Chance no drop | Multiplicador dos bônus |
| ----------------- | -------------- | ----------------------- |
| Comum             | 80%            | ×1,0                    |
| Rara              | 17%            | ×1,4                    |
| Épica             | 3%             | ×1,9                    |

- 24 itens: arma inicial por classe (concedida na criação, não negociável) e 7 itens por região
  (arma marcial, arma arcana, cabeça, peito, mãos, pernas, pés).
- Bônus sorteados na criação e gravados no item (`bonuses`); `ruleset_version` registra a regra.
- Restrições: armas por classe; nível mínimo = nível da região. O servidor sempre revalida.
- Inventário: 100 itens não equipados; drops excedentes são descartados e contabilizados.
