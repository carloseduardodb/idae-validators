# Plano — artigo sobre construção de validadores

Status (2026-09-30): experimentos X0–X6 concluídos; artigo em `article/validators.tex`.
As seções 1–9 são o plano original; as seções 10 em diante registram o que foi
feito, com os números finais (os mesmos do artigo).

## 1. Pergunta

O artigo do IDAE mostrou que a garantia de um pipeline "programa descartável
+ validador imutável" vale exatamente o que vale a especificação. Este artigo
responde à pergunta seguinte:

> **Como construir um validador para programas sintetizados por LLM, e como
> medir, antes de colocar em produção, quanto ele realmente garante?**

Título provisório: *How Strong Is Your Validator? Measuring and Building
Acceptance Gates for LLM-Synthesized Programs*. Título do artigo: *Quão Forte
é o seu Validator? Medindo Portões de Aceitação para Programas Sintetizados por
LLM*.

## 2. Perguntas de pesquisa

- **RQ1 — Força.** Quanto dos programas defeituosos que um LLM realmente
  produz cada estratégia de validador deixa passar (corrupção silenciosa)
  e quanto de programas corretos ela barra (rejeição falsa)?
- **RQ2 — Mutação vs. falhas reais.** O escore de mutação de um validador
  (medido com defeitos artificiais, sem LLM e sem oráculo de produção)
  prevê sua força contra os defeitos reais da RQ1? Se sim, é uma métrica
  barata para usar antes do deploy.
- **RQ3 — Validadores gerados por LLM.** Um validador escrito pelo próprio
  LLM a partir do telos é tão forte quanto um escrito à mão? E quando o
  mesmo modelo escreve o programa e o validador, os erros se correlacionam
  (o validador herda a mesma leitura errada da especificação)?
- **RQ4 — Custo.** Quanto cada estratégia custa em tempo de execução,
  chamadas de LLM e esforço de escrita?
- **RQ5 — Pares verificados** (acrescentada depois). Se cada formato tiver
  alguns pares entrada–saída verificados e o formato não mudar durante o uso,
  quanto um portão que exige reproduzir esses pares acrescenta?
- A RQ3 ganhou depois uma subpergunta: o validador do LLM melhora se o
  próprio modelo puder revisá-lo com autoverificação (X5)?

## 3. Base empírica (reaproveitada do IDAE)

- **Domínios com oráculo:** financeiro, IoT e USGS (560 eventos reais), com
  geradores com semente e verdade-terreno por registro.
- **Corpus de falhas reais:** os logs JSONL do IDAE guardam cerca de 1.500
  programas sintetizados por Claude Opus 4.5 e Haiku 4.5 (E1–E7), incluindo
  os defeituosos que causaram os 98% de corrupção, a fabricação de campo e a
  limitação de profundidade negativa. Cada programa é reexecutado contra todos
  os registros; o oráculo diz, por registro, se a saída está correta.
  Nenhuma chamada nova de LLM é necessária para isso.
- **Casos já documentados**, que viram exemplos da taxonomia:
  fabricação de campo ausente (330 registros), clamp de profundidade,
  envenenamento de formato, 74% de corrupção com validador reconstruído.

## 4. Estratégias de validador comparadas

| ID | Estratégia | O que checa | Origem |
|---|---|---|---|
| V0 | Formato (baseline do IDAE) | tipos, faixas, formato de data | já existe |
| V1 | Ancorado na fonte (grounded) | V0 + campos copiados existem literalmente na entrada | já existe (parcial) |
| V2 | Propriedades / relações | V0 + relações entre entrada e saída (ex.: categoria coerente com a moeda; sinal da profundidade preservado; valor convertido dentro da faixa derivada da entrada) | novo, à mão |
| V3 | Metamórfico | a saída muda de forma previsível quando a entrada é perturbada (ex.: dobrar o valor dobra `value_in_usd`; trocar o fuso muda a data como esperado) | novo |
| V4 | Diferencial / N-version | dois programas independentes precisam concordar | já existe (k=2) |
| V5 | Gerado por LLM a partir do telos | o que o LLM escrever | novo (Opus 4.5 e Haiku 4.5) |
| V6 | Rejeição explícita + V2 | V2, com o programa podendo devolver `null` e o `null` sendo amortizado | combinação |

V2 e V3 são as contribuições novas; V0, V1, V4 e V6 vêm do IDAE.

No que foi executado: V5 virou **L** (X3) e ganhou a variante **I** (X5,
revisada com autoverificação); V6 não foi avaliado à parte; entrou o portão
**G** de pares verificados (X6).

## 5. Experimentos

- **X1 — Falhas reais (RQ1).** Cada programa do corpus × cada validador
  × todos os registros do seu domínio. Métricas por validador: corrupção
  silenciosa, rejeição falsa, programas defeituosos detectados (um programa
  conta como detectado se o validador barra pelo menos uma saída errada
  antes da amortização). Sem LLM.
- **X2 — Mutação (RQ2).** Aplica operadores de mutação aos programas
  corretos do corpus (troca de taxa, off-by-one em data, remoção de conversão
  de fuso, troca de sinal, clamp, valor default para campo ausente,
  inverter categoria, `return {}` parcial). Escore de mutação por validador;
  correlação de Spearman com a força da X1. Sem LLM.
- **X3 — Validadores gerados por LLM (RQ3).** Opus 4.5 e Haiku 4.5 escrevem
  validadores a partir do mesmo telos (N=10 cada por domínio, com semente de
  prompt). Mede-se força (X1) e escore de mutação (X2). Correlação de erros:
  para programas e validadores do mesmo modelo, a chance de o validador
  aceitar justamente as saídas erradas que o programa produz, comparada com
  o cruzamento Opus↔Haiku. Único experimento que gasta LLM
  (≈ 60 chamadas).
- **X4 — Custo (RQ4).** Tempo de validação por registro, linhas de código
  do validador e chamadas de LLM, por estratégia.
- **X5 — Autoverificação iterativa (RQ3).** Acrescentado depois; ver seção 14.
- **X6 — Pares verificados (RQ5).** Acrescentado depois; ver seção 15.

Estatística: os mesmos testes exatos do IDAE (McNemar exato pareado por
registro, IC de Wilson, δ de Cliff) e Spearman com IC por bootstrap.

## 6. Contribuições esperadas

1. Uma taxonomia de falhas de validador, com exemplos reais.
2. Evidência de quanto cada estratégia pega de defeitos reais de LLM.
3. Uma métrica barata (escore de mutação), se a RQ2 confirmar, para medir um
   validador antes do deploy.
4. Uma resposta sobre se dá para deixar o LLM escrever o próprio validador.
5. Um guia prático: o que um validador precisa checar.

## 7. Ameaças já previstas

- O corpus vem de 3 domínios de extração; generalizar para outros tipos de
  programa é hipótese. Mitigação: um estudo de caso pequeno fora de extração
  (invariantes de jogo), que também prepara o artigo seguinte.
- V2 e V3 são escritos pelo autor, que conhece os defeitos do corpus.
  Mitigação: escrever V2/V3 a partir do telos **antes** de olhar os defeitos
  (congelar e registrar com hash no git), e reportar à parte os defeitos
  "vistos" e "não vistos".
- Programas repetidos no corpus inflam contagens. Mitigação: deduplicar por
  hash do código normalizado.

## 8. Estrutura da pasta

```
idae-validators/
├── PLANO.md
├── README.md
├── src/
│   ├── corpus.js        extrai e deduplica programas dos logs do IDAE
│   ├── validators/      V0…V6 por domínio
│   ├── mutation.js      operadores de mutação
│   └── metrics.js       força, escore de mutação, correlação
├── experiments/         x1…x4 + report.js
├── data/                cópia congelada do corpus e dos domínios do IDAE
├── results/
└── article/
```

O código dos domínios e dos oráculos é copiado do `idae` (versão do commit
e460355) em vez de importado, para o repositório ficar independente.

## 9. Ordem de trabalho

1. ~~Montar o corpus~~ (seção 10).
2. ~~Escrever e congelar V2 e V3~~ (seção 11; feito por agente isolado).
3. ~~Rodar X1 e X2~~ (seções 11–12).
4. ~~Rodar X3~~ (80 chamadas; seção 12).
5. ~~Artigo em LaTeX~~ (seção 16). Depois: X5 e X6.

## 10. Resultado do passo 1 — corpus (2026-09-30)

`npm run corpus` (sem LLM, ~9 s):

- 1.570 respostas de síntese sob o telos final → **909 programas únicos**
  (código normalizado); nenhum deixou de compilar.
- Rótulos: financeiro 439 corretos / 14 incompletos / 38 defeituosos;
  IoT 406 / 0 / 1; USGS corrigido 6 / 0 / 0; USGS estrito 2 / 0 / 3.
- **Comportamentos distintos** (mesmo resultado por registro contado uma vez):
  só **10 defeituosos** (financeiro 6, IoT 1, USGS estrito 3) e 4 incompletos.
  (Números da primeira extração; o corpus final está em 10.1.)
  Os 39 programas defeituosos do Opus repetem poucos erros:
  - valor em texto `"3440.04"` lido como número brasileiro → 344004 (100×);
  - moeda ausente → assume BRL em vez de rejeitar;
  - `value_usd` pré-agregado convertido de novo; categoria errada;
  - USGS estrito: `significance` fabricado no CSV (323–330 registros).
  Haiku: CSV com 98% errado, IoT com timestamp sem offset tratado como local,
  data errada em 20% do P2 financeiro.

**Consequência para o plano:** 10 comportamentos defeituosos são poucos para
estatística na RQ1. Opções:
1. manter o corpus e reportar por comportamento (análise qualitativa + X2
   de mutação carregando a parte quantitativa);
2. **ampliar o corpus de falhas reais** com uma rodada nova de síntese
   (Haiku 4.5 e Opus 4.5, formatos novos e amostras variadas por domínio),
   estimada em algumas centenas de chamadas de LLM.

### 10.1 Ampliação do corpus (x0b, 2026-09-30)

- Fases novas P7–P11 no financeiro e no IoT (chave=valor, JSON aninhado com
  epoch, XML, JSON com valor+unidade/total brasileiro, e uma adversarial
  nos formatos novos), cada uma com assinatura própria. Os rótulos do corpus
  original não mudaram (conferido).
- `npm run synth`: 182 chamadas (Opus 4.5 e Haiku 4.5, 3 amostras por
  assinatura, semente de síntese 3001 ≠ semente de avaliação 1001; USGS com 4
  amostras por formato nos dois telos), 0 falhas, ~197 mil tokens estimados.
- Corpus total: **1.068 programas únicos**, nenhum sem compilar.
  Comportamentos distintos: **23 defeituosos** (antes 10) e 15 incompletos
  (antes 4). Haiku: 25 programas defeituosos de 106; Opus: 45 de 962.
- Defeitos novos observados (todos conferidos contra o oráculo):
  epoch em segundos lido como milissegundos (data em 1970); `"2181.38"` lido
  como número brasileiro (100×) também no JSON aninhado; offset ignorado no
  chave=valor; Fahrenheit não convertido em parte do P3 do IoT; moeda ausente
  assumida como BRL no chave=valor; `ts: null` virando 1970-01-01;
  CSV do USGS partido na vírgula dentro de aspas (place/event_type/status);
  timestamps com milissegundos fora do formato do telos.

**Atenção para o passo 2:** o autor (e o assistente) já viram esses defeitos,
então V2/V3 escritos "às cegas" pelo autor ficaram comprometidos. Alternativa:
V2/V3 escritos por um agente sem acesso ao corpus, só com o telos, e
congelados com hash antes de rodar X1.

## 11. Passo 2 e X1 (2026-09-30)

- V2/V3 escritos por um agente isolado (Claude Opus 5.5; só `SPEC.md` com o
  telos e um exemplo normal por formato, mais o V0), congelados no commit 7892f98 com
  SHA-256 em `src/validators/blind/SHA256SUMS`, antes de qualquer execução.
  Ameaça: o código do USGS tem algum conhecimento genérico de GeoJSON
  (ignora "Feature"/"Point" como `event_type`, ignora o título "M x - …").
- `npm run x1` (sem LLM, ~2 min). Por comportamento distinto (23 defeituosos):

| Validador | pegos (≥1 saída errada barrada) | saídas erradas barradas | rejeição falsa |
|---|---|---|---|
| V0 formato | 26,1% (6/23) | 34,7% | 0,0% |
| V1 ancorado | 26,1% (6/23) | 34,7% | 0,0% |
| V2 propriedades | **91,3% (21/23)** | **95,6%** | 0,4% |
| V3 metamórfico | 34,8% (8/23) | 39,3% | 0,0% |
| V2+V3 | 91,3% | 95,6% | 0,4% |

Por programa único (70 defeituosos): V0 15,7%, V2 94,3% (rejeição falsa 0,1%).

- Escapam do V2 os dois comportamentos do P3 financeiro (pré-agregado):
  valor já em USD convertido de novo como BRL, e categoria derivada da moeda
  errada. O primeiro é explicável como "número da entrada × taxa de uma
  moeda citada", então a relação genérica não o distingue. O segundo expõe
  uma ambiguidade do próprio telos (qual moeda define a categoria quando o
  valor já vem em USD); precisa ser discutido como ameaça, não como defeito
  puro.
- Rejeição falsa: toda a do V2 está no chave=valor do IoT (P7), 64 de 509
  saídas corretas (cerca de 16 de 105 por programa); a do V3 está no P3
  financeiro, onde barra as 100 saídas corretas de um dos programas (a relação
  "dobrar o valor dobra o resultado" escolhe o número errado quando há mais
  de um valor numérico).
- V3 sozinho acrescenta pouco sobre V0 e nada sobre V2 neste corpus.

## 12. V4, X3 e X2 (2026-09-30)

**V4 N-version (X1, por comportamento):** com 3 parceiros diferentes, pega
78–100% dos comportamentos defeituosos, mas com rejeição falsa de 8,2–27,2%
(barra saída correta sempre que o parceiro erra). Depende muito de qual
parceiro foi sorteado.

**X3 — 80 validadores escritos por LLM** (10 por modelo e domínio, mesmo
material do agente de V2; congelados no commit b88847e, todos compilam):

| domínio | V2 pega / rej. falsa | Opus: pega (mediana) / rej. falsa (mediana) / utilizáveis* | Haiku: idem |
|---|---|---|---|
| financeiro | 77,8% / 0,0% | 66,7% / 9,5% / 1 de 10 | 88,9% / 90,8% / 0 de 10 |
| IoT | 100% / 1,2% | 71,4% / 2,7% / 3 de 10 | 85,7% / 51,9% / 0 de 10 |
| USGS corrigido | 100% / 0,0% | 100% / 0,0% / 6 de 10 | 100% / 59,3% / 4 de 10 |
| USGS estrito | 100% / 0,0% | 33,3% / 0,0% / 10 de 10 | 100% / 0,0% / 10 de 10 |

\* utilizável = rejeição falsa ≤ 1%.
Erros correlacionados: validadores do Opus aceitam 69,6% das saídas erradas
de programas do Opus e 20,3% das do Haiku; os do Haiku, 29,3% e 11,3%.
Controlando a permissividade de cada modelo, a razão de chances da interação
é 2,76 com IC 95% [0,28; 18,2] por bootstrap sobre os 23 comportamentos:
**inconclusivo** (a direção sugere leniência com os próprios erros, mas não há
dado suficiente).

**X2 — mutação:** 3.525 mutantes de 141 programas corretos → 265 com
comportamento distinto que produzem saída errada (a maioria NUM×10/NUM+1).
Escore (pegos ≥1): V0 30,9%, V1 57,4%, V2 99,6%, V3 55,1%, V4 100%.
V4 chega a 100% por construção (o parceiro é um programa correto do corpus),
então o escore de mutação superestima o N-version.
Spearman entre escore de mutação e força em falhas reais, um ponto por
(domínio, validador), V4 excluído:

| escopo | n | ρ (programas pegos) | ρ (saídas barradas) |
|---|---|---|---|
| total | 100 | 0,51 [0,36; 0,66] | 0,62 [0,48; 0,75] |
| financeiro | 25 | 0,81 [0,55; 0,96] | 0,64 [0,27; 0,88] |
| IoT | 25 | 0,46 [0,04; 0,78] | 0,48 [0,01; 0,80] |
| USGS estrito | 25 | 0,87 [0,71; 0,96] | 0,87 [0,71; 0,96] |
| USGS corrigido | 25 | sem variância (todos pegam o único defeito) | |

Correção feita no caminho: os validadores de LLM tinham o mesmo nome em
todos os domínios e o agregado total somava validadores diferentes; os nomes
agora incluem o domínio e o total junta os pontos por domínio.


### 12.1 Correção (2026-09-30)

O representante de cada comportamento no X1 era o último programa do grupo,
não o primeiro como documentado (`new Map` sobrescreve chaves repetidas).
Programas com o mesmo comportamento por registro podem dar saídas erradas
diferentes, então o representante importa um pouco. Corrigido (commit
1aace70) e X1–X4 rodados de novo; as tabelas das seções 11 e 12 já mostram os
valores corrigidos (antes: V0 30,4%, V3 39,1%, Spearman total 0,47).

## 13. X4 — custo (2026-09-30)

Mediana por verificação, sobre saídas corretas (faixa entre domínios; os
tempos variam entre execuções, a ordem de grandeza não):

| validador | µs/verificação | execuções extras do programa | para criar |
|---|---|---|---|
| V0 | 1–2 | 0 | 6–12 linhas |
| V2 | 50–110 | 0 | módulo V2/V3 de 276–301 linhas |
| V3 | 630–730 | 5–5,7 | idem |
| V4 | 140–190 | 1 | 1 síntese extra por formato |
| L | 105–115 | 0 | 1 chamada (mediana 39–88 linhas) |
| I | 105–120 | 0 | 3,3 chamadas em média (mediana 45–89 linhas) |

## 14. X5 — autoverificação iterativa (2026-09-30)

Cada um dos 80 validadores L revisado pelo mesmo modelo, até 5 rodadas. A
rodada 1 é a própria resposta do X3 (mesmo prompt, lido do log). A cada rodada
o validador roda contra os exemplos do prompt: a saída correta de cada exemplo
tem de ser aceita, e variantes erradas (`src/output-mutants.js`, mutador
genérico por tipo de campo) deveriam ser barradas. Nada do corpus no feedback.
V2 passa nessa autoverificação (aceita todas as corretas; 1 de 216 variantes
aceita — a troca de categoria no pré-agregado). 185 chamadas de revisão,
0 falhas; congelados em `data/llm-validators-iter/` (commit a173174).

- Nos exemplos funcionou: Opus no financeiro, validadores que aceitam todas
  as corretas 2 → 6 de 10; variantes aceitas 22,6% → 0,1%.
- Contra as falhas reais, quase nada mudou: utilizáveis no financeiro + IoT
  4/40 → 4/40; Opus pega um pouco mais (financeiro 66,7% → 77,8%, IoT
  71,4% → 78,6%). Haiku no financeiro continua rejeitando corretas dos
  próprios exemplos após 5 rodadas. Só no USGS corrigido a rejeição falsa do
  Haiku caiu (59,3% → 0,0%).
- Motivo: sobreajuste ao exemplo. Os 6 validadores do Opus limpos na
  autoverificação rejeitam 11,3% das corretas no fluxo; um deles rejeita
  todos os registros do chave=valor cujo horário em UTC cai no dia seguinte
  (o único exemplo do formato não cruza o dia).
- Consequência: a iteração sozinha não explica a vantagem de V2 (que usou os
  mesmos exemplos); resta o modelo (Opus 5.5) e a liberdade do agente.
- Interação de leniência com os validadores I: OR 5,75 [0,72; 96,8],
  inconclusivo.

## 15. X6 — pares verificados (2026-09-30)

Portão de nascimento: o programa só é aprovado se reproduz exatamente k pares
verificados do seu formato (saída igual; `null` nos de rejeição). Composições:
primeiros k do fluxo, sorteio (hipergeométrico), estratificado por tipo de
registro (500 sorteios). Sem LLM. Por comportamento (23 defeituosos):

| composição | k | G | G+V0 | G+V2 |
|---|---|---|---|---|
| primeiros | 1 | 78,3% | 82,6% | 100% |
| primeiros | 10 | 82,6% | 87,0% | 100% |
| sorteio | 1 | 65,7% | 71,4% | 95,7% |
| sorteio | 10 | 85,9% | 90,0% | 99,8% |
| estratificado | 10 | 95,1% | 99,2% | 99,8% |

Nenhum programa correto barrado em nenhuma configuração. Os 2 escapes de V2
caem no primeiro par; os que escapam dos pares (casos de borda e registros
raros) V2 pega. "Primeiros" é favorecido pela ordem do fluxo sintético
(normais antes dos casos de borda); o sorteio é a estimativa neutra.

## 16. Artigo (2026-09-30)

`article/validators.tex` (acmart, português com abstract em inglês), RQ1–RQ5,
8 páginas; todos os números conferidos contra `results/*.json`.
Pendências antes de publicar: leitura do autor; repositório público e link
dos artefatos; versão em inglês para o arXiv.

## 17. RQ6 — impacto na tarefa (X7, versão 3 do artigo)

Vindo do estudo "Quando o bug vira feature" (repositório local
`idae-bug-feature`, não publicado), onde as tarefas foram escritas e
congeladas antes da primeira execução. Copiado para cá com o mesmo hash
(`TASKS.sha256`); a saída do X7 aqui é idêntica à de lá.

- 14 tarefas de consumo com tolerância declarada (5 financeiro, 4 IoT, 5 USGS),
  3 que exigem exatidão. Escopos: formato (só a fonte) e fluxo (domínio).
- Controle: 961/961 programas corretos resolvem todas.
- Formato: 3 inofensivos, 12 depende, 8 graves (programas: 5/46/19).
  Os 3 inofensivos são o mesmo defeito (milissegundos no timestamp do IoT).
- V0 pega 6, dos quais os 3 inofensivos; deixa passar 17, todos com dano.
- Dano aceito entre os 20 não inofensivos: V0 17, G primeiro par 5, V2 2,
  G primeiro par + V2 0, oráculo exato 0. Todos rejeitam os 3 inofensivos.
- Fluxo: 3/19/1; proporções e rankings toleram quase tudo, totais e médias
  não (×100: total mensal do domínio errado em 1.549%; dupla conversão 3,2%).
- 13 dos 15 formatos com defeito têm ao menos um programa correto no corpus;
  os outros dois são o CSV do USGS estrito e o financeiro `pipe:3` (P7).
- O estudo de geração de fases de jogo (B4) do mesmo repositório deu 0
  desvios jogáveis em 30 programas e não entrou no artigo.
