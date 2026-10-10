# Balanceamento das waves (Fase 2A)

> Tabelas geradas pelo motor real com `pnpm --filter @astral/game-core sim:waves -- --md`
> (`packages/game-core/scripts/balance.ts`). Os limites abaixo são verificados a cada execução
> de `pnpm test` por `packages/game-core/test/balance.test.ts`; se um ajuste os quebrar, o teste
> falha antes de o número chegar ao jogo.

## Parâmetros (`packages/game-core/src/content/waves.ts` → `WAVE_RULES`)

Todos inteiros; percentuais em pontos-base (bp, 10 000 = 100%).

| Parâmetro                  | Valor                           | Efeito                                                                        |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `winsPerWave`              | 15                              | vitórias para concluir uma wave (o especial é a 15ª)                          |
| `eliteEvery` / `bossEvery` | 5 / 10                          | waves múltiplas de 5 terminam com elite; de 10, com o chefe                   |
| `statGrowthBpPerWave`      | 400 (teto `maxStatBp` 16 000)   | vida/ataque/defesa dos comuns: +4% por wave, no máximo ×1,6                   |
| `rewardGrowthBpPerWave`    | 500 (teto `maxRewardBp` 14 500) | XP/ouro dos comuns: +5% por wave, no máximo ×1,45                             |
| `retreatAfterFailures`     | 3                               | no Avançar, 3 falhas seguidas → volta uma wave e passa a Farmar               |
| `designWavesPerRegion`     | 10                              | curva de nível mínimo: do mínimo ao máximo da região ao longo de 10 waves     |
| `firstClear.goldPerWave`   | 50                              | ouro da 1ª conclusão = 50 × wave × tier da região                             |
| `firstClear.essenceBase`   | 1                               | essência = (1 + ⌊wave/5⌋) × tier (+5 no chefe)                                |
| itens de 1ª conclusão      | elite: raro · chefe: épico      | sorteados com o RNG do próprio encontro (fluxo `firstClear`), não negociáveis |

Por região (`regions.ts` → `waves`): Campos do Alvorecer 10 waves (elite Lobo-Cometa Ancestral,
chefe Colosso do Eclipse Menor, tier 1); Bosque das Marés de Prata e Desfiladeiro dos Trovões
4 waves cada (sem elite/chefe implementados ainda, tiers 2 e 3).

Escolhas que tornam o sistema finito e não exploratório:

- Crescimento com teto: nenhuma wave tem atributos acima de ×1,6 nem recompensas acima de ×1,45.
- Recompensas crescem um pouco mais que a dificuldade: avançar rende mais por hora que farmar
  waves baixas, mas sem saltos — farmar continua útil para quem está travado.
- Elites e chefes pagam **pouco por abate** e **muito na primeira conclusão** (paga uma única vez,
  garantida por chave de idempotência e índice único no banco). Assim repetir a wave do chefe
  não vira o loop ótimo de farm.
- Nível mínimo por wave (`waveMinLevel`): o Avançar não leva o herói a waves impossíveis; ele
  repete a wave atual até ter o nível (aviso `level_gate` na interface).
- Fim do conteúdo: ao concluir a última wave implementada o herói passa a Farmar essa wave e a
  interface avisa (`content_limit`). Nunca existe wave além do conteúdo.

## Método da simulação

- 3 classes × 4 afinidades em cada região, 12 h simuladas, liquidação em passos de 5 min
  (resultado idêntico a liquidar de uma vez — propriedade testada).
- O herói entra no nível mínimo da região, com equipamento comum da região anterior (só a arma
  inicial nos Campos), em modo Avançar. A cada hora "confere o jogo" e, se houve recuo, reativa
  o Avançar. Itens obtidos **não** são equipados (cenário conservador).
- Colunas W1…W10: minuto em que cada wave foi concluída pela primeira vez. "Recuos": quantas
  vezes o Avançar recuou por 3 falhas seguidas. XP/h e ouro/h: média das 12 h (ouro inclui
  as recompensas de primeira conclusão).

## Resultados

### Campos do Alvorecer (início no nível 1)

| Classe / afinidade | W1  | W2  | W3  | W4  | W5  | W6  | W7  | W8  | W9  | W10 | Recuos | Vitórias | XP/h | Ouro/h | Nível final |
| ------------------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ------ | -------- | ---- | ------ | ----------- |
| guardian/solar     | 5   | 8   | 13  | 17  | 22  | 26  | 30  | 34  | 36  | 57  | 0      | 100.0%   | 2133 | 3636   | 12          |
| guardian/lunar     | 4   | 7   | 11  | 15  | 18  | 21  | 24  | 28  | 30  | 47  | 0      | 100.0%   | 2161 | 3753   | 12          |
| guardian/storm     | 5   | 8   | 12  | 16  | 19  | 23  | 26  | 30  | 32  | 51  | 0      | 100.0%   | 2157 | 3739   | 12          |
| guardian/abyssal   | 5   | 8   | 12  | 16  | 20  | 24  | 27  | 31  | 34  | 52  | 0      | 100.0%   | 2160 | 3752   | 12          |
| arcanist/solar     | 4   | 6   | 9   | 13  | 16  | 19  | 21  | 24  | 26  | 41  | 0      | 100.0%   | 2397 | 4783   | 12          |
| arcanist/lunar     | 3   | 5   | 8   | 11  | 13  | 16  | 18  | 21  | 22  | 35  | 0      | 99.9%    | 2454 | 5006   | 12          |
| arcanist/storm     | 4   | 6   | 10  | 13  | 16  | 19  | 21  | 24  | 26  | 41  | 0      | 100.0%   | 2452 | 5028   | 12          |
| arcanist/abyssal   | 4   | 6   | 9   | 12  | 15  | 18  | 21  | 23  | 25  | 39  | 0      | 100.0%   | 2361 | 4624   | 12          |
| blade/solar        | 4   | 6   | 9   | 12  | 15  | 18  | 21  | 24  | 26  | 40  | 0      | 100.0%   | 2434 | 4949   | 12          |
| blade/lunar        | 3   | 5   | 8   | 11  | 13  | 15  | 18  | 20  | 22  | 35  | 0      | 100.0%   | 2485 | 5171   | 12          |
| blade/storm        | 3   | 6   | 9   | 12  | 15  | 18  | 20  | 23  | 25  | 38  | 0      | 100.0%   | 2475 | 5124   | 12          |
| blade/abyssal      | 3   | 6   | 9   | 11  | 14  | 17  | 20  | 22  | 24  | 37  | 0      | 100.0%   | 2474 | 5123   | 12          |

### Bosque das Marés de Prata (início no nível 6)

| Classe / afinidade | W1  | W2  | W3  | W4  | Recuos | Vitórias | XP/h | Ouro/h | Nível final |
| ------------------ | --- | --- | --- | --- | ------ | -------- | ---- | ------ | ----------- |
| guardian/solar     | 8   | 15  | 23  | 30  | 0      | 100.0%   | 5889 | 5019   | 17          |
| guardian/lunar     | 10  | 19  | 28  | 47  | 0      | 99.6%    | 5544 | 4313   | 17          |
| guardian/storm     | 11  | 21  | 31  | 41  | 0      | 100.0%   | 5126 | 3558   | 16          |
| guardian/abyssal   | 7   | 13  | 19  | 26  | 0      | 100.0%   | 6314 | 5903   | 17          |
| arcanist/solar     | 6   | 11  | 17  | 22  | 0      | 100.0%   | 6470 | 6240   | 18          |
| arcanist/lunar     | 7   | 14  | 21  | 36  | 0      | 99.5%    | 6114 | 5506   | 17          |
| arcanist/storm     | 8   | 15  | 23  | 30  | 0      | 100.0%   | 5672 | 4578   | 17          |
| arcanist/abyssal   | 5   | 10  | 15  | 20  | 0      | 100.0%   | 7047 | 7646   | 18          |
| blade/solar        | 6   | 10  | 15  | 20  | 0      | 100.0%   | 7088 | 7744   | 18          |
| blade/lunar        | 7   | 13  | 19  | 31  | 0      | 99.9%    | 6737 | 6889   | 18          |
| blade/storm        | 7   | 14  | 20  | 27  | 0      | 100.0%   | 6210 | 5703   | 17          |
| blade/abyssal      | 5   | 9   | 13  | 18  | 0      | 100.0%   | 7508 | 8764   | 18          |

### Desfiladeiro dos Trovões (início no nível 12)

| Classe / afinidade | W1  | W2  | W3  | W4  | Recuos | Vitórias | XP/h  | Ouro/h | Nível final |
| ------------------ | --- | --- | --- | --- | ------ | -------- | ----- | ------ | ----------- |
| guardian/solar     | 16  | 35  | 151 | 170 | 2      | 92.4%    | 10688 | 3507   | 22          |
| guardian/lunar     | 11  | 21  | 32  | 56  | 0      | 99.9%    | 14037 | 6180   | 24          |
| guardian/storm     | 12  | 27  | 40  | 90  | 1      | 98.8%    | 13275 | 5373   | 23          |
| guardian/abyssal   | 16  | 32  | 53  | 152 | 1      | 97.9%    | 11811 | 4095   | 22          |
| arcanist/solar     | 13  | 29  | 82  | 94  | 1      | 90.2%    | 11839 | 4612   | 22          |
| arcanist/lunar     | 9   | 16  | 25  | 43  | 0      | 99.9%    | 16136 | 8543   | 25          |
| arcanist/storm     | 9   | 20  | 73  | 81  | 1      | 98.2%    | 15141 | 7319   | 24          |
| arcanist/abyssal   | 14  | 72  | 84  | 94  | 1      | 98.0%    | 13502 | 5667   | 23          |
| blade/solar        | 11  | 25  | 81  | 91  | 1      | 96.3%    | 13803 | 5975   | 24          |
| blade/lunar        | 8   | 14  | 21  | 37  | 0      | 100.0%   | 17359 | 10326  | 25          |
| blade/storm        | 8   | 17  | 26  | 78  | 1      | 99.5%    | 16590 | 9187   | 25          |
| blade/abyssal      | 11  | 21  | 31  | 82  | 1      | 99.6%    | 14882 | 7070   | 24          |

### Farmar cada wave dos Campos por 1 h (Guardião Solar nível 6)

| Wave | XP/h | Ouro/h | Essência/h | Itens/h | Vitórias |
| ---- | ---- | ------ | ---------- | ------- | -------- |
| 1    | 3089 | 2515   | 6          | 8       | 100.0%   |
| 2    | 3095 | 2557   | 6          | 8       | 100.0%   |
| 3    | 3129 | 2516   | 6          | 7       | 100.0%   |
| 4    | 3191 | 2427   | 5          | 7       | 100.0%   |
| 5    | 3365 | 2586   | 6          | 8       | 100.0%   |
| 6    | 3369 | 2616   | 5          | 7       | 100.0%   |
| 7    | 3319 | 2572   | 4          | 7       | 100.0%   |
| 8    | 3365 | 2806   | 3          | 7       | 100.0%   |
| 9    | 3384 | 2747   | 3          | 7       | 100.0%   |
| 10   | 4119 | 2890   | 7          | 5       | 100.0%   |

## Leitura

- **Waves iniciais acessíveis**: todas as 12 combinações concluem a wave 1 dos Campos em 3–5 min
  e a região inteira (com elite e chefe) em 35–57 min, com 99,9–100% de vitórias.
- **Elite e chefe são o pico da wave, não um muro**: a afinidade pesa (×1,25 vantagem, ×0,8
  desvantagem). Na varredura de atributos, o pior caso venceu o elite em 62% das tentativas no
  nível 3 e 100% no nível 4; o chefe, 68% no nível 6 e 100% no nível 7. Por isso a wave 5 exige
  nível 3 e a wave 10, nível 6. Derrotas não contam como vitória: o especial reaparece até cair.
- **Bosque**: as 4 waves saem em 18–47 min, sem recuos.
- **Desfiladeiro** é o desafio atual: 90–100% de vitórias e alguns recuos para combinações em
  desvantagem de afinidade (até 170 min para a wave 4). É o comportamento desejado: o recuo
  automático evita uma sequência de derrotas improdutivas e o jogador decide quando insistir.
- **Farmar não supera avançar**: XP/h dos Campos cresce de forma suave (3 089 na wave 1 →
  3 384 na wave 9); a wave do chefe rende 4 119 XP/h, mas menos itens/h (5 contra 7–8) e ouro/h
  só ~5% acima da wave 9. Os testes impõem: wave 10 ≤ 1,3× wave 9 em XP/h e ≤ 1,2× em ouro/h;
  wave 5 ≤ 1,2× wave 4 em XP/h.

## Limitações conhecidas

- Bosque e Desfiladeiro têm só 4 waves e nenhum elite/chefe próprio: o desenho prevê 10 waves
  por região; as demais entram junto com o novo conteúdo (sprites, monstros e itens originais).
- A simulação não equipa drops nem considera aprimoramento (Fase 2B); na prática o ritmo deve
  ser um pouco mais rápido que o da tabela.
