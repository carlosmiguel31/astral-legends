# Riscos técnicos, de segurança, de economia e legais

Escala: **Impacto** (A/M/B) × **Probabilidade** (A/M/B).

## 1. Técnicos

| Risco                                                                                  | I   | P   | Mitigação                                                                                                                              |
| -------------------------------------------------------------------------------------- | --- | --- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Divergência de resultados entre versões das regras (replays e auditoria quebram)       | A   | M   | `RULESET_VERSION` gravado em itens e caças; snapshots de regressão; matemática inteira; lint proíbe `Math.random`/`Date.now` no núcleo |
| Liquidação idle cara para muitos jogadores offline                                     | M   | M   | teto offline, limite de encontros por chamada, liquidação sob demanda + worker só para online; benchmark antes do MVP                  |
| Conexões WebSocket em massa numa única VPS                                             | M   | M   | heartbeat, limites por conexão, pub/sub no Redis para escalar horizontalmente                                                          |
| Mudança de comportamento em dependências recentes (Prisma 7, Vite 8, Phaser 4, TS 6)   | M   | M   | versões fixadas no lockfile; atualizações em PRs dedicados com a suíte completa                                                        |
| Prisma 7 baixa binário do _schema engine_ na primeira execução de `generate`/`migrate` | B   | M   | documentado no README; em CI com rede restrita, usar `PRISMA_ENGINES_MIRROR` ou cache                                                  |
| Diferenças Windows × Linux (caminhos, sinais, finais de linha)                         | B   | M   | scripts sem shell específico, `.gitattributes` com LF, `127.0.0.1` explícito, SIGINT tratado                                           |

## 2. Segurança

| Risco                                           | I   | P   | Mitigação                                                                                                                                                                   |
| ----------------------------------------------- | --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente forjando resultados (dano, drops, ouro) | A   | A   | servidor autoritativo; cliente só envia intenções; Zod em toda entrada                                                                                                      |
| Duplicação de itens/ouro por corrida ou reenvio | A   | M   | transações, `UPDATE` condicional, chaves de idempotência, lock otimista, índices únicos, triggers append-only — **já testado** para débitos concorrentes e reenvio paralelo |
| Roubo de sessão / credenciais                   | A   | M   | argon2id, cookies `HttpOnly/Secure/SameSite`, rotação de refresh token, 2FA para admin                                                                                      |
| Abuso de API e bots                             | M   | A   | rate limit (Redis) global e por ação, detecção de padrões, limites de caça por conta                                                                                        |
| Abuso administrativo / interno                  | A   | B   | toda concessão via ledger com motivo + `audit_logs` imutável; princípio do menor privilégio                                                                                 |
| Vazamento de segredos em logs                   | M   | M   | redação de cabeçalhos sensíveis; erro de env não imprime valores                                                                                                            |
| Injeção de SQL                                  | A   | B   | Prisma parametrizado; SQL bruto apenas com template tags                                                                                                                    |

## 3. Economia

| Risco                                         | I   | P   | Mitigação                                                                                      |
| --------------------------------------------- | --- | --- | ---------------------------------------------------------------------------------------------- |
| Inflação (mais ouro entrando que saindo)      | A   | A   | sumidouros planejados; métrica ouro criado × destruído; simulações antes de cada ajuste        |
| Exploit de farm (região/monstro “quebrado”)   | M   | M   | penalidade de XP por nível; logs de liquidação reproduzíveis; ajuste por `RULESET_VERSION`     |
| Lavagem de valor via mercado (quando existir) | A   | M   | custódia, limites, histórico de propriedade, preço mínimo/máximo relativo, atraso de liberação |

## 4. Legais e regulatórios — atenção especial a RMT

> Não constitui aconselhamento jurídico. Antes de qualquer monetização, obter parecer de advogado
> especializado em jogos, meios de pagamento e proteção de dados.

- **Menores de idade**: a Lei 15.211/2025 (ECA Digital), em vigor desde março de 2026, veda
  _caixas de recompensa_ (loot boxes) em jogos acessíveis a crianças e adolescentes e exige
  mecanismos confiáveis de verificação de idade para conteúdo inadequado. Decisão de design:
  **nenhuma recompensa aleatória paga**, em nenhuma fase planejada.
- **Marco Legal dos Games** (Lei 14.852/2024): enquadra jogos eletrônicos e prevê cuidados com
  crianças e adolescentes; considerar no desenho de classificação etária e controles parentais.
- **RMT / conversão em dinheiro**: comprar e vender moeda/itens por dinheiro real e permitir saques
  pode atrair regras de arranjos de pagamento, prevenção à lavagem de dinheiro (KYC, monitoramento,
  comunicação de operações suspeitas), tributação, Código de Defesa do Consumidor e, se houver
  aleatoriedade vinculada a valor, risco de enquadramento como jogo de azar. Também conflita com
  políticas de lojas de aplicativos e de provedores de pagamento, e eleva fraude e chargeback.
- **LGPD**: dados pessoais mínimos, base legal, retenção, direitos do titular; KYC ampliaria
  muito a responsabilidade.

**Decisão arquitetural**: diamantes são não conversíveis e não compráveis nesta fase; a economia
fica isolada em serviços com livro-razão imutável, de modo que um eventual módulo financeiro
futuro seja um serviço separado, auditável e desligável — sem reescrever o jogo.
