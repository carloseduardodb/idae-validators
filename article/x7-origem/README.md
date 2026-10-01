# Origem do X7 (RQ6, impacto na tarefa)

`idae-bug-feature.bundle` é o repositório git em que as tarefas de consumo do
X7 foram escritas e avaliadas pela primeira vez, num estudo exploratório
("Quando o bug vira feature") que não virou artigo próprio. Ele guarda o
histórico de commits, que documenta a ordem descrita no artigo:

1. `Estrutura inicial e tarefas de consumo congeladas (antes do B1)`:
   `src/tasks.js` e o hash em `TASKS.sha256`, antes de qualquer execução
   contra o corpus;
2. `Corrige a comparação top-N...`: a única correção depois do congelamento,
   revelada pelo controle com programas corretos;
3. `B1: impacto na tarefa...`: os resultados (iguais aos do X7 aqui).

O bundle também contém um estudo que não entrou no artigo (B4: geradores de
fases de um jogo sintetizados por Claude Opus 4.5 e Haiku 4.5, com 0 desvios
jogáveis em 30 programas), com os programas e o log das chamadas de LLM.
O autor dos commits foi normalizado para o mesmo endereço noreply deste
repositório; as datas são as originais.

Para abrir:

```bash
git clone idae-bug-feature.bundle idae-bug-feature
cd idae-bug-feature
git log --format='%h %ad %s' --date=iso
sha256sum -c TASKS.sha256 GAME.sha256
npm test
```
