# Quão Forte é o seu Validator?

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23074363.svg)](https://doi.org/10.5281/zenodo.23074363)

Artigo: *Quão Forte é o seu Validator? Medindo Portões de Aceitação para
Programas Sintetizados por LLM* —
[doi.org/10.5281/zenodo.23074363](https://doi.org/10.5281/zenodo.23074363)
(PDF e fonte LaTeX em `article/`).

English version: *How Strong Is Your Validator? Measuring Acceptance Gates for
LLM-Synthesized Programs* —
[doi.org/10.5281/zenodo.23074532](https://doi.org/10.5281/zenodo.23074532)
(PDF and LaTeX source in `article/arxiv/`).

Autor: Carlos Eduardo Dias Batista — ORCID [0009-0005-5726-0289](https://orcid.org/0009-0005-5726-0289)

Estudo derivado do [IDAE](https://github.com/carloseduardodb/idae)
([doi.org/10.5281/zenodo.23050791](https://doi.org/10.5281/zenodo.23050791)).
No IDAE, um LLM sintetiza programas de extração descartáveis, um validator
imutável decide quais saídas aceitar, e o programa aprovado é reutilizado para
todos os registros do mesmo formato. A garantia do sistema é a força do
validator. Este repositório mede essa força contra falhas que LLMs realmente
cometem e compara formas de construir o validator.

## Resultados principais

Corpus: 1.068 programas únicos sintetizados por Claude Opus 4.5 e Claude
Haiku 4.5 em três domínios com oráculo por registro (financeiro, IoT e 560
eventos reais do USGS); 70 defeituosos, com **23 comportamentos defeituosos
distintos**.

| Estratégia | Defeitos pegos (de 23) | Saídas corretas barradas |
|---|---|---|
| V0 — formato (validator do IDAE) | 6 (26,1%) | 0,0% |
| V2 — relações entrada↔saída, escrito só a partir da especificação | **21 (91,3%)** | 0,4% |
| V3 — metamórfico | 8 (34,8%) | 0,0% |
| V4 — N-version (3 parceiros) | 78–100% | 8,2–27,2% |
| G + V2 — pares verificados por formato + V2 | **95,7–100%** | 0,5% |

* **Validators escritos pelo próprio LLM** (80, numa chamada) pegam muito, mas
  barram saídas corretas: no financeiro e no IoT, só 4 de 40 ficam com
  rejeição falsa ≤ 1%. Deixar o modelo revisá-los em até 5 rodadas de
  autoverificação contra os exemplos da especificação não muda isso (4 de 40
  depois): eles se ajustam aos exemplos.
* **Pares verificados** (o programa só é aprovado se reproduz k pares
  entrada–saída verificados do seu formato) nunca barraram um programa correto
  e pegam exatamente os defeitos que V2 deixa passar, que vêm de ambiguidades
  da especificação.
* **Escore de mutação** correlaciona moderadamente com a força contra falhas
  reais (Spearman ρ = 0,51, IC 95% [0,36; 0,66]): serve como triagem.
* **Impacto na tarefa:** contra 14 tarefas de consumo congeladas antes da
  análise, 20 dos 23 comportamentos defeituosos mudam o resultado de alguma
  tarefa. O validator de formato pega justamente os 3 inofensivos e deixa
  passar 17 que causam dano; V2 com o primeiro par verificado não deixa passar
  nenhum.

## Experimentos

| ID | Script | Pergunta | LLM? |
|---|---|---|---|
| X0 | `corpus`, `synth` | Monta o corpus: extrai os programas dos logs do IDAE, sintetiza programas novos, reexecuta todos contra o oráculo | `synth`: 182 chamadas |
| X1 | `x1` | RQ1 — força de cada validator contra as falhas reais | não |
| X2 | `x2` | RQ2 — escore de mutação e correlação com a força real | não |
| X3 | `x3`, `x3-analysis` | RQ3 — 80 validators escritos por LLM; erros correlacionados | `x3`: 80 chamadas |
| X4 | `x4` | RQ4 — custo por verificação e para criar | não |
| X5 | `x5` | RQ3 — os mesmos validators revisados com autoverificação iterativa | 172 chamadas |
| X6 | `x6` | RQ5 — pares entrada–saída verificados como portão de aceitação | não |
| X7 | `x7` | RQ6 — impacto dos defeitos em 14 tarefas de consumo (`src/tasks.js`, congelado em `TASKS.sha256`) e dano aceito por portão | não |

Todas as chamadas de LLM estão registradas em `data/new-logs/*.jsonl`
(prompt e resposta). Os scripts que chamam o LLM reaproveitam as respostas do
log quando o prompt é o mesmo, então rodá-los de novo não gera chamadas novas.

## Como rodar

Pré-requisitos: Node ≥ 22. Não há dependências npm. Os scripts fixam
`TZ=America/Sao_Paulo`.

```bash
npm test                  # testes do corpus (sem LLM)
npm run corpus            # X0: reconstrói data/corpus/programs.jsonl a partir dos logs
npm run x1                # X1 (precisa rodar antes de x2, x3-analysis e x6)
npm run x2
npm run x3-analysis
npm run x4
npm run x6
npm run x7                # depois do x1 e do x6
```

Os experimentos que chamam o LLM (`synth`, `x3`, `x5`) precisam de
`ANTHROPIC_API_KEY`, a não ser que todas as respostas já estejam no log.
Variáveis: `MODELS`, `N`, `ROUNDS`, `CONC` (ver o cabeçalho de cada script).

## Validators congelados

Para que nenhum validator fosse ajustado depois de ver os resultados, todos
foram congelados com hash SHA-256 antes da primeira avaliação:

* `src/validators/blind/` — V2 e V3, escritos por um agente isolado (Claude
  Opus 5.5) que recebeu só a especificação, um exemplo normal por formato e o
  V0 (`_source/SPEC.md`), sem acesso ao corpus. `_source/` guarda o material
  recebido, o código-fonte e o script de autoverificação.
* `data/llm-validators/` — os 80 validators do X3.
* `data/llm-validators-iter/` — as versões revisadas do X5 (`final/`), todas as
  rodadas (`rounds/`) e o resumo por validator (`summary.json`).

## Estrutura

```
idae-validators/
├── src/
│   ├── domains/            financial.js · iot.js · usgs.js (geradores, oráculo, V0/V1), fases P7–P11 novas
│   ├── streams.js          fluxos de avaliação (semente 1001) e assinaturas de formato
│   ├── corpus.js           extração, deduplicação e reexecução dos programas contra o oráculo
│   ├── evaluate.js         avaliação de um programa por um conjunto de validators
│   ├── validators/         V0–V4, carregadores dos validators de LLM, blind/ (V2/V3)
│   ├── mutation.js         operadores de mutação (X2)
│   ├── output-mutants.js   variantes erradas de saídas corretas (feedback do X5)
│   ├── prompts.js          prompt de síntese (idêntico ao do IDAE) e prompt de validator
│   └── llm-client.js       cliente da API da Anthropic, com log JSONL
├── experiments/            x0…x6
├── data/
│   ├── idae-logs/          logs de síntese do IDAE (origem do corpus)
│   ├── new-logs/           logs das chamadas novas (x0b, x3, x5)
│   ├── corpus/             programs.jsonl: código, rótulo e proveniência de cada programa
│   ├── mutants/            mutantes do X2
│   ├── llm-validators*/    validators escritos por LLM (X3, X5)
│   └── usgs/               eventos reais do USGS Earthquake Catalog
├── results/                JSON e saída de cada experimento
├── article/                LaTeX + classe ACM + PDF (arxiv/: versão em inglês;
│                           x7-origem/: repositório de origem do X7, com o histórico)
├── PLANO.md                plano do estudo e registro do que foi feito
└── tests/
```

O código dos domínios, oráculos, métricas e cliente LLM foi copiado do IDAE
(commit e460355) para que este repositório seja independente.

## Uso de IA

Os modelos Claude Opus 4.5 e Haiku 4.5 são objeto de estudo. Um assistente de
IA (Claude Opus 5.5) foi usado para implementar os scripts, escrever V2/V3 numa
instância isolada e redigir versões do artigo; o autor revisou código,
resultados e texto.
