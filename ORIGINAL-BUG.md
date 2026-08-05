# Correções de bugs do código original

Este arquivo registra comportamentos defeituosos encontrados em
`dart_pdf-master` durante a tradução. O port mantém a intenção da API, mas não
reproduz esses defeitos.

## Raios maiores que a caixa (`border_radius.dart`)

**Como reproduzir:** pinte uma caixa de largura 40 com raios horizontais de 30
nos dois cantos da mesma borda. O caminho original soma 60 numa aresta de 40 e
as curvas se cruzam.

**Correção no port:** `BorderRadius.paint` reduz proporcionalmente todos os
raios quando a soma de dois cantos excede a largura ou a altura disponível.

## `Positioned` consulta tamanho de um layout anterior (`stack.dart`)

**Como reproduzir:** no primeiro layout de um `Stack`, o código testa
`positioned.width`/`height` antes de chamar `positioned.layout`. Esses getters
leem `box?.width`/`height`, portanto retornam nulo na primeira passagem e podem
retornar um tamanho obsoleto quando a instância é reutilizada.

**Correção no port:** largura e altura são entradas imutáveis opcionais de
`Positioned`; o resultado medido fica somente em `StackLayoutData`.

## `GridView.hasMoreWidgets` sempre verdadeiro (`grid_view.dart`)

**Como reproduzir:** conclua todos os filhos de um `GridView` dentro de
`MultiPage` e consulte `hasMoreWidgets`; o getter original retorna `true` sem
examinar o cursor, permitindo páginas vazias ou repetição até o limite.

**Correção no port:** `GridViewState.firstChild` é comparado ao número real de
filhos e `hasMore` passa a falso exatamente no último fragmento.

## Proporção do grid é reduzida para caber (`grid_view.dart`)

**Como reproduzir:** use `childAspectRatio` finito com várias linhas e pouca
altura. O original escolhe o mínimo entre o tamanho proporcional e a altura da
página dividida pelo total de linhas, comprimindo as células e deixando de
respeitar a proporção solicitada.

**Correção no port:** uma proporção finita determina um tamanho estável de
célula; linhas completas que não cabem continuam no próximo fragmento. O modo
padrão sem proporção explícita ainda distribui as linhas pela altura finita,
necessário para o calendário original.

## `Partitions` termina quando a primeira coluna termina (`partitions.dart`)

**Como reproduzir:** crie duas partições pagináveis, uma com dois fragmentos e
outra com quatro. `hasMoreWidgets` usa a negação de `any(!hasMoreWidgets)`, isto
é, exige que todas ainda tenham conteúdo; a coluna longa é truncada quando a
curta acaba.

**Correção no port:** a continuação permanece ativa enquanto qualquer coluna
tiver conteúdo. Estados de colunas concluídas geram fragmentos vazios e as
demais continuam normalmente.

## Justificação divide por zero em linha com um único trecho (`text.dart`)

**Como reproduzir:** use `TextAlign.justify` numa largura que force uma palavra
longa a ocupar sozinha uma linha marcada como quebrada. `_Line.realign` calcula
o intervalo como `(totalWidth - wordsWidth) / (spans.length - 1)`; com um único
span, o denominador é zero e o deslocamento seguinte deixa de ser finito.

**Correção no port:** a folga é distribuída apenas quando a linha quebrada tem
ao menos um intervalo real entre palavras. Linhas sem intervalo conservam sua
posição normal, e todos os deslocamentos permanecem finitos.

## Destinos de cabeçalhos podem colidir (`content.dart`)

**Como reproduzir:** crie dois `Header` com o mesmo `text`, ou dois cabeçalhos
que usam apenas `child` e `title`. O original usa `text.hashCode.toString()`
como nome do destino; textos iguais geram o mesmo nome e o caso sem `text` usa o
mesmo hash nulo, fazendo uma entrada sobrescrever a outra em `PdfNames`.

**Correção no port:** cada cabeçalho pintado recebe uma âncora sequencial única
na ordem do documento (`outline-1`, `outline-2`, ...). O replay usado pelo índice
reutiliza essas âncoras sem criar duplicatas.

## A última palavra lorem nunca é escolhida (`placeholders.dart`)

**Como reproduzir:** force o gerador a devolver o maior índice permitido em
`LoremText.word()`. O original chama `nextInt(words.length - 1)`, cujo limite é
exclusivo, portanto a última entrada (`voluptate`) nunca pode aparecer.

**Correção no port:** o limite é o comprimento completo da lista; um teste com
gerador controlado confirma que `voluptate` é selecionável.

## Parágrafos lorem ultrapassam o tamanho solicitado (`placeholders.dart`)

**Como reproduzir:** chame `LoremText().paragraph(15)`. A expressão original
aplica `max(10, min(3, ...))`, que resulta sempre em pelo menos 10, e ainda limita
pelo comprimento total em vez das palavras restantes; duas sentenças podem
produzir 20 palavras para uma solicitação de 15.

**Correção no port:** cada sentença recebe de 3 a 10 palavras, limitada pelo
total restante. O laço termina com exatamente o número solicitado.
