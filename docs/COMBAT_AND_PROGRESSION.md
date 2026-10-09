# Regras fundamentais de combate e progressão

> Implementadas em `packages/game-core` · `RULESET_VERSION = 1`.
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
| Arcanista Celestial | 3 / 12 / 5 / 7         | 0 / +3 / +1 / +1 | 1500 ms        | 160%      | ignora 25% da defesa |
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

## 5. Regras da caça idle (especificação para a Fase 1)

| Regra                            | Valor inicial                                                      |
| -------------------------------- | ------------------------------------------------------------------ |
| Teto de tempo offline acumulado  | 8 h                                                                |
| Tempo de procura entre encontros | 2 s                                                                |
| Recuperação após combate         | 0,1 s por ponto de vida perdido (vida volta cheia)                 |
| Derrota                          | 30 s de recuperação, sem recompensa, caça continua                 |
| Acesso à região                  | nível ≥ `minLevel` da região                                       |
| Recompensas                      | XP, ouro (`goldMin..goldMax`), chance de essência; itens na Fase 1 |

Valores serão calibrados com simulações automatizadas (milhares de horas simuladas) antes do
lançamento do MVP — o determinismo do núcleo permite isso de forma barata.
