# Escopo do MVP

Objetivo do MVP: **um jogador consegue criar conta e personagem, caçar automaticamente (online e
offline), evoluir, receber e equipar armaduras, aprimorá-las e derrotar o primeiro chefe — com
economia correta e auditável.** Jogável em desktop e celular.

## Dentro do MVP

| Área       | Inclui                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Conta      | cadastro e login por e-mail/senha, sessões revogáveis, verificação de idade declarada + bloqueio de conteúdo pago |
| Personagem | 1 personagem por conta; 3 classes; 4 afinidades; nome único                                                       |
| Caça idle  | 3 regiões (níveis 1–20); liquidação determinística no servidor; teto offline de 8 h; eventos em tempo real        |
| Combate    | 1×1 automático; derrota com penalidade de tempo; log resumido no cliente                                          |
| Progressão | níveis 1–30; XP com penalidade por diferença de nível                                                             |
| Itens      | 6 slots; raridades Comum→Épica com drops; aprimoramento +1…+15 sem destruição                                     |
| Chefe      | 1 chefe (Campos do Alvorecer) com tentativas limitadas por hora                                                   |
| Moedas     | ouro e essência por gameplay; diamantes só concedidos por admin (sem compra)                                      |
| Operação   | painel admin mínimo (consultar conta, conceder/revogar com auditoria), métricas de economia, backups              |

### Situação após a Fase 1

| Área       | Situação                                                                      |
| ---------- | ----------------------------------------------------------------------------- |
| Conta      | ✅ cadastro, login, sessões revogáveis · ⏳ verificação de e-mail e de idade  |
| Personagem | ✅ completo                                                                   |
| Caça idle  | ✅ 3 regiões, liquidação no servidor, teto de 8 h, eventos em tempo real      |
| Combate    | ✅ automático, derrota com penalidade, registro no cliente                    |
| Progressão | ✅ níveis 1–30 com penalidade de XP                                           |
| Itens      | ✅ 6 slots, Comum/Rara/Épica, equipar/desequipar/descartar · ⏳ aprimoramento |
| Chefe      | ⏳ Fase 2                                                                     |
| Moedas     | ✅ ouro e essência via livro-razão · diamantes sem fonte (correto nesta fase) |
| Operação   | ⏳ admin, métricas, backups, deploy                                           |

## Fora do MVP (explicitamente)

- Mercado entre jogadores, trocas diretas, guildas, chat global.
- Qualquer pagamento real, compra de diamantes, **saque ou conversão de moeda em dinheiro**.
- _Loot boxes_ ou qualquer recompensa aleatória paga.
- Dungeons, PvP, especializações, conjuntos de armadura, crafting.
- Apps nativos; o MVP é web responsivo.

## Critérios de pronto

- Testes de regras com cobertura das fórmulas e snapshots de regressão de balanceamento.
- Testes de integração: liquidação concorrente não duplica recompensas; saldo = Σ livro-razão.
- E2E: criar conta → personagem → caçar → receber item → equipar → aprimorar.
- Simulação de balanceamento: tempo médio até o nível 20 dentro da meta definida no GDD.
- Deploy reproduzível na VPS com HTTPS, backups automáticos e restore testado.
