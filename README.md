# Formação de Preço — Rondônia

Aplicativo web para substituir a planilha de análise e formação de preços.
Roda 100% no navegador: **sem servidor e sem banco de dados externo** — os
dados ficam salvos localmente no seu navegador via **IndexedDB**.

## O que ele faz

- Cadastra um produto (referência, NCM, fornecedor, marca, frete, estado de
  origem, quantidade, descrição e valor unitário) e calcula automaticamente,
  em tempo real: custo final, ICMS/ICMS-ST, PIS/COFINS, markup e preço de
  venda — usando exatamente a mesma lógica e as mesmas tabelas de referência
  da planilha original (`RBC`, `ICMS ST RO` e `PISCOFINS`).
- Mostra margens rápidas (10/15/20/25%) e uma aba **Análise de Margens** com
  a faixa completa de 10% a 50%, em passos de 1%.
- Salva, edita, pesquisa e exclui análises no **Histórico**, mantendo os
  dados mesmo depois de fechar o navegador.

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org) 18 ou mais recente instalado.

```bash
# 1. instale as dependências (uma vez só)
npm install

# 2. rode em modo desenvolvimento
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente `http://localhost:5173`).

Para abrir no VS Code: abra esta pasta (`File > Open Folder…`), abra um
terminal integrado (`` Ctrl+` ``) e rode os dois comandos acima.

### Gerar uma versão para publicar (opcional)

```bash
npm run build      # gera a pasta dist/, pronta para hospedar em qualquer lugar
npm run preview    # visualiza essa versão localmente
```

## Estrutura do projeto

```
src/
  calc/
    calculator.ts       # motor de cálculo — reproduz a aba "Analise" da planilha
    marginAnalysis.ts   # gera a faixa de margens 10%–50%
  data/
    rbc.json            # tabela "RBC" (redução de base de cálculo, Convênio 52/91)
    icmsStRo.json        # tabela "ICMS ST RO" (MVA ajustada por NCM)
    pisCofins.json        # tabela "PISCOFINS" (NCMs monofásicos)
    estados.ts           # lista de UFs
  db/
    db.ts                # wrapper sobre IndexedDB nativo (sem dependências)
    analysesRepo.ts       # salvar/listar/excluir análises (histórico)
  components/            # formulário, painel de preço, resultado, navegação
  pages/                  # Início (Dashboard), Análise de Margens, Histórico
  types.ts                # tipos do domínio (produto, config, resultado)
```

## Sobre os cálculos

A lógica foi extraída célula a célula da planilha `Markup - Rondônia 5.0`:
classificação automática do item (**Normal**, **RBC**, **ST** ou **ST RET**)
a partir do NCM, cálculo do crédito de ICMS na compra, base e valor do
ICMS-ST (com a alíquota MVA correta por estado de origem), créditos de
PIS/COFINS (ou isenção monofásica), até a fração de CMV e o markup que
define o preço final — mantendo os mesmos resultados matemáticos da
planilha original.

Os componentes de formação de preço (Imposto Federal, Comissão, Custo
Fixo e Lucro) são editáveis e recalculam tudo instantaneamente, sem
precisar clicar em nenhum botão de "calcular".

## Preparado para crescer

Todo o acesso a dados passa por `src/db/`. Se no futuro você quiser trocar
o IndexedDB por um banco em nuvem (Firebase, Supabase, etc.), basta
reescrever essas duas funções (`analysesRepo.ts`) sem tocar no resto do
aplicativo — a interface, o motor de cálculo e as telas continuam iguais.

## Campos avançados

Além dos campos principais, a planilha original também previa: **ST retido
na nota**, **outras despesas**, **desconto**, **IPI**, **frete adicional** e
**crédito de ICMS sobre frete**. Eles existem no app como campos avançados
opcionais (ocultos por padrão, com valor 0) para manter a tela principal
limpa sem perder fidelidade com a planilha.
