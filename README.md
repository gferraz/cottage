# Floor Plan

Aplicação estática para desenhar plantas baixas com HTML, CSS e JSON. Não exige banco de dados, servidor, Python ou processo de build.

## Abrir e carregar uma planta

Abra [`floor-plan.html`](floor-plan.html) no navegador e clique em **Carregar JSON**. A página inicia vazia; o projeto só é carregado quando um arquivo é escolhido. Para trocar a planta, selecione outro arquivo JSON.

Arquivos `.json5` e `.jsonc` também são aceitos. Eles usam a mesma estrutura do JSON, mas permitem comentários, chaves sem aspas e vírgulas finais:

```json5
{
  title: "Minha casa", // comentário
  floors: [{ id: "ground", rooms: [], }],
}
```

O parser é embutido na aplicação; não é necessário instalar biblioteca ou servidor.

O seletor de piso muda apenas o desenho. **Todos os pisos** sobrepõe os pavimentos na planta baixa e mostra o conjunto na perspectiva 3D; escolher um piso restaura a vista individual. As listas, totais e erros são consolidados entre todos os pisos.

## Editar a planta

O arquivo ativo é `cottage-ferraz-cesar-front-gables.json5`. O índice no início contém marcadores para buscar com Ctrl+F / Cmd+F. Listas de objetos com `id` ficam em ordem alfabética; listas sem IDs e coordenadas mantêm sua ordem. A ordem das seções do primeiro nível é preservada. As aberturas laterais ficam junto ao cômodo, em `rooms[].openings`; `from: "left"` refere-se à lateral esquerda desse cômodo. Vãos entre pavimentos continuam em `floors[].openings`.

Medidas reutilizáveis ficam em `parameters`:

```json5
parameters: {
  wall_thickness: 0.12,
  ground_height: 3,
  knee_setback: 0.8
},
config: {
  walls: { thickness: "params.wall_thickness", color: "desejo-ambar" },
  floors: { ceiling_height: "params.ground_height" }
}
```

Use `"params.nome"` como valor, ou em expressões geométricas como `"office.x0 + params.knee_setback"`. Parâmetros podem depender de outros parâmetros (`"params.ground_height * 2"`); ciclos, nomes inexistentes e valores não numéricos geram erro. Não use referências a cômodos dentro de `parameters`.

`config.walls` define padrões somente das paredes independentes; `config.roofs`, dos telhados; `config.openings`, das dimensões por tipo de abertura; e `config.floors`, dos pavimentos. O valor explícito no elemento prevalece. `ceiling_height` é o nome atual; `wall_max_height` continua aceito por compatibilidade.

O [JSON Schema](floor-plan.schema.json) fornece sugestões e validação estrutural em editores com suporte a JSON5 e JSON Schema. O arquivo ativo mantém chaves sem aspas, comentários e vírgulas finais. `.vscode/settings.json` registra o schema local, sem forçar o modo JSONC; o VS Code precisa de suporte a JSON5 com integração ao schema para oferecer validação e autocompletar nesse formato.

Veja um [exemplo curto e carregável](examples/parametros-e-aberturas.json5). O schema detecta erros de formato, propriedades e tipos; referências geométricas, conexões e colisões são verificadas pela aplicação.

Ao carregar um arquivo, os erros indicam nome, linha, coluna e caminho, por exemplo `casa.json5:42:7 · floors[0].rooms[3].openings[0]`. A linha aponta para o início do objeto que originou o erro; erros sintáticos apontam para a posição do problema. Arquivos carregados sem nome, como pelo link de compartilhamento, aparecem como `JSON5`.

## Estrutura mínima do JSON

```json
{
  "title": "Minha casa",
  "floors": [{
    "id": "ground",
    "label": "Térreo",
    "z0": 0,
    "ceiling_height": 3,
    "rooms": [],
    "items": [],
    "openings": []
  }]
}
```

Cada piso deve informar `z0`, sua cota vertical, e `ceiling_height`, o pé-direito desse piso. Quando existe um piso acima, a altura efetiva das paredes é limitada pela diferença entre os `z0`; no último piso, usa-se `ceiling_height`. O antigo `h` do piso não é mais usado para definir sua posição.

Os IDs dos cômodos são obrigatórios, globais e únicos. IDs de zonas, itens, janelas, passagens e guias também devem ser únicos quando informados. Objetos geométricos com ID podem ser referenciados globalmente quando o tipo oferece referências. `x0`, `y0` e `z0` são palavras reservadas e não podem ser usados como IDs.

## Catálogo compartilhado

Tipos reutilizáveis de itens, padrões de portas/janelas e tokens de cor ficam em [`src/config/catalog.js`](src/config/catalog.js). Uma planta pode sobrescrever tipos em `item-types`, valores de abertura no próprio objeto e cores em `theme.colors`. A prioridade é: definição explícita da planta, catálogo compartilhado e padrão interno.

## Escopo de paredes independentes

Use `scope` com o ID de um pavimento ou cômodo:

```json5
{
  id: "knee-wall-front-left",
  scope: "unused-north", // Também pode ser "upper", o ID do pavimento.
  base: { level: "upper.z0" },
  top: "roof",
  from: ["office.x0", "knee-top.y0"],
  to: ["left.x0", "knee-top.y0"]
}
```

Na planta baixa e na perspectiva 3D com um piso selecionado, a parede aparece somente no piso do escopo. **Todos os pisos** na planta e na perspectiva, assim como as elevações completas, incluem as paredes de todos os escopos. O escopo associa o elemento; não recorta a parede ao cômodo, não altera suas coordenadas e não muda `base` ou `top`. Paredes sem `scope` mantêm o comportamento anterior. Um ID inexistente gera erro com a localização da definição.

## Geometria e referências

Para retângulos, use `pos: [x, y]` e `size: [w, l]`, em metros. `x/y/w/l` também são aceitos diretamente. `h` é a altura vertical; `z0` é a cota inicial. `rectangle: [x0, y0, x1, y1]` é uma alternativa. Nos dois últimos valores de `rectangle`, os aliases locais `x0`, `y0` e `z0` representam o ponto inicial: `rectangle: ["main.x0", "main.y0", "x0 + 3", "y0 + 2"]` cria um retângulo de `3 × 2 m`. `from` e `to` também aceitam esses aliases: `from: [4, 8], to: ["x0 + 1", "y0 - 3"]` termina em `[5, 5]`. Para coordenadas absolutas ou referências, use expressões como `to: ["main.x1", "main.y1"]`; arrays numéricos em `to` continuam sendo coordenadas absolutas. `inset: ["id", dx, dy]` cria um retângulo interno e `outset: ["id", dx, dy]` cria um retângulo ampliado para fora, aumentando cada lado em `dx` e `dy`.

Use `copy: "id"` para reutilizar explicitamente a geometria retangular de outro objeto:

```json5
{ id: "office-copy", copy: "office", label: "Cópia do escritório", color: "blue" }
```

Veja o [exemplo completo](examples/copiar-geometria.json5).

A cópia acompanha as alterações da origem e reutiliza posição, largura, comprimento e extensão vertical. Aparência, rotação original, paredes e aberturas não são herdadas; defina essas propriedades no novo objeto. Para cômodos compostos, usa-se o retângulo envolvente, sem reproduzir as partes. Não combine `copy` com `from/to`, `pos/size`, `rectangle`, `inset/outset` ou outras medidas geométricas. Paredes independentes continuam usando `from/to` ou `path.points`.

Expressões podem combinar referências e operações: `"living.x1 - 0.3"`, `"room.w / 2"` e `"part.z1"`. Cada referência oferece `x0()`, `x1()`, `xc()`, `y0()`, `y1()`, `yc()`, `z0()`, `z1()`, `zc()`, `w()`, `l()`, `h()` e `area()`.

Cômodos compostos usam `parts`; cada parte tem sua própria geometria e pode referenciar outras partes, independentemente da ordem de declaração. Referências circulares geram erro. As partes também podem ser referenciadas globalmente por ID, por exemplo `flight-1.y0`, a partir de qualquer cômodo. A regra de não sobreposição também é aplicada às partes.

Degraus e patamares de uma escada composta compartilham um gradiente de altura, do tom escuro de cobertura nas cotas baixas até a cor clara de circulação nas cotas altas. A escala usa o piso de origem e a maior cota de toda a escada, sem reiniciar por lance. A cor de cada degrau corresponde à sua cota superior; o patamar usa a própria cota. A planta e o 3D mantêm a mesma escala, inclusive ao visualizar a escada por outro piso.

Portas, janelas e vãos aceitam `z0` e `h` para a projeção vertical: `z1 = z0 + h`. Quando omitidos, portas e vãos usam `z0: 0, h: 2.1`, e janelas usam `z0: 0.9, h: 1.2`. A largura continua sendo informada por `w` e a posição relativa por `dx` ou `dy`.

Também é possível criar cômodos diretamente no console do navegador: `const porch = floor.addRoom({ pos: [3.4, 2], size: [4.3, 2.3], label: "Varanda" })`. O objeto retornado expõe `x0()`, `x1()`, `xc()`, `y0()`, `y1()`, `yc()`, `z0()`, `z1()`, `zc()`, `w()`, `l()`, `h()` e `area()`.

A opção **Somente telhado (3D)** isola as coberturas, ocultando terreno, paredes, escadas e móveis da perspectiva. Ao ativá-la, **Telhados** também é marcado; desmarcar **Telhados** encerra o isolamento.

A opção **Todos os pisos** no controle **Piso** reúne o edifício completo na perspectiva 3D; a planta baixa permanece no último piso individual selecionado. Ao escolher um piso individual, a perspectiva 3D acompanha a seleção: cômodos, itens, aberturas e escadas são filtrados, e paredes que atravessam pavimentos são recortadas nas cotas do piso. No último piso, o topo continua limitado pelos telhados. O terreno e as coberturas continuam como contexto, com os telhados controlados pela opção **Telhados**.

Na perspectiva 3D, os itens são representados por volumes esquemáticos, respeitando posição, piso, dimensões, cor e rotação. Camas, carro, mesa, sofás, poltronas, lavadoras e lareira têm formas próprias; outros itens usam um volume genérico. A terceira dimensão de `size` define a altura. Sem altura positiva, usam-se valores de visualização: carro 1,45 m, mesa 0,75 m, lareira 1,80 m e demais itens 0,60 m.

## Cômodos, paredes e sobreposições

No 3D e nas elevações, todas as paredes (inclusive independentes e diagonais) têm sua altura recortada pelas superfícies dos telhados nas áreas cobertas, considerando espessura e vãos. Os avanços `eave` não participam do limite de altura das paredes; os avanços `rake` continuam considerados. Nos encontros de telhados, prevalece a superfície mais alta; trechos sem cobertura mantêm a altura definida.

Em `path.points` de paredes independentes, `x0` e `y0` representam as coordenadas do ponto anterior já resolvido. Por exemplo, `[[4, 2], ["x0", "y0 + 3"], [8, "y0"]]` resulta em `[[4, 2], [4, 5], [8, 5]]`. O primeiro ponto precisa usar coordenadas absolutas ou referências a outros objetos.

Para paredes independentes, use `top: "roof"` para alcançar automaticamente a cobertura, tanto no 3D quanto nas elevações:

```js
{
  id: "front-wall",
  base: { level: "ground.z0" },
  top: "roof",
  thickness: 0.12,
  path: { points: [["office.x0", "office.y0"], ["office.x1", "office.y0"]] }
}
```

Nesse modo, somente os trechos cobertos são desenhados; nos encontros prevalece o telhado mais alto. Se nenhum telhado válido cobrir o caminho acima da base, a parede aparece em **Itens com erro**. A forma `top: { level: ... }` continua disponível para limitar a parede a uma cota explícita.

Para limitar paredes por um objeto superior, use `top` com o ID, tanto no cômodo quanto na parede independente:

```json5
top: "stairs" // Usa as partes da escada conforme sua projeção.
// Para selecionar apenas algumas partes:
top: ["upper-flight", "upper-landing"]
```

A referência aceita IDs de telhados, cômodos, partes, itens ou outras referências retangulares sem rotação. Um cômodo composto usa as suas partes. Lances seguem o plano inclinado ideal entre as cotas das extremidades; patamares e outros volumes usam sua cota inferior `z0`. Nenhuma espessura estrutural é presumida. Os lances no 3D deixam o volume sob esse plano livre. Nos encontros, prevalece a face inferior mais baixa; trechos fora das projeções mantêm o limite normal. O recorte considera a espessura das paredes e aparece no 3D e nas elevações. Referências inválidas geram erro de parede. O recorte não valida automaticamente a altura útil de portas ou equipamentos.

Arquivos anteriores com `top: { level: ... }` ou `top: { under: ..., offset: ... }` continuam sendo lidos por compatibilidade.

O padrão é quatro paredes sólidas. Use `walls` com `solid`, `open` ou `virtual`:

```json
"walls": { "top": "solid", "right": "open", "bottom": "virtual", "left": "solid" }
```

Como atalho, `walls: ["top", "bottom"]` torna somente esses lados sólidos; `walls: "virtual"` torna todos pontilhados. `virtual` é separação visual, não parede sólida. Sobreposição intencional é declarada com `"overlaps": "corridor"` ou uma lista. Ela é descontada da área útil do elemento que recebe a autorização; itens também podem descontar área de cômodos.

`overlaps` autoriza a interseção e ajusta a área útil. `overlays` é separado e indica que o elemento atual deve ficar visualmente acima do elemento referenciado; somente essa propriedade participa das camadas. A regra vale para cômodos, itens e partes. Uma parte pode apontar para outra parte usando seu ID qualificado, por exemplo `"overlays": "stairs.landing"`. A aplicação calcula automaticamente a camada e acusa ciclos.

## Passagens, janelas e itens

Passagens usam a parede de origem e um destino opcional:

```json
{ "from": "office.left", "to": "entry", "type": "door" }
```

`type` pode ser `door`, `opening` ou `window`. `to` omitido significa exterior. Sem `dx`/`dy` e `w`, a aplicação encontra o segmento comum, centraliza a abertura e usa os padrões: porta `0.8 m`, abertura `1.0 m`, janela `0.9 m`. O ID é gerado como `from-to-deslocamento-em-cm`. Portas e janelas são desenhadas com quatro bordas; passagens abertas mostram apenas as bordas laterais.

Itens são objetos concretos, aparecem em lista própria e podem usar `overlaps`. Use `title` para o texto exibido ao passar o mouse e `label` para a legenda. Tipos reutilizáveis podem ser declarados em `item-types`. Janelas também podem ser declaradas em `openings` com `type: "window"` ou na coleção `windows`; em ambos os casos ficam separadas da lista de passagens. Zonas virtuais (`zones`) servem para referências e marcações, sem entrar em áreas ou conflitos.

## Terreno, guias e apresentação

`terrain` aceita frente/fundo, `boundary_order`, cantos e segmentos topográficos. A frente é inferida do segmento indicado no JSON; a casa permanece ortogonal, enquanto o terreno, o Norte e a rosa dos ventos refletem sua orientação. `building.anchor` e `building.position` posicionam a casa em relação ao terreno. `viewport.size` e `viewport.origin` definem a área visível; é possível arrastar a grade com o mouse.

`guides` desenha linhas ou segmentos auxiliares. Use `pos` ou `from` para o ponto inicial e `to` para o ponto final; em `to`, `x0`, `y0` e `z0` representam o ponto inicial da guia. `theme.colors` personaliza a paleta. Escadas podem ter `h` positivo, `stair-flight` e `parts`, projetando-se visualmente entre pisos; aberturas verticais conectam dois IDs de pisos. O catálogo atual inclui `washing-machine`, `queen-bed`, `three-seat-sofa` e `armchair`; cada tipo pode ser usado com `type` e ter sua posição e tamanho sobrescritos.

Os encontros entre telhados são recortados automaticamente na planta, nas elevações e no 3D: superfícies abaixo de outro telhado são removidas, mantendo a cobertura mais alta em cada ponto e as linhas de encontro. Sobreposições coplanares são desenhadas uma única vez. Use `clip_intersections: false` no telhado para manter sua superfície inteira, por exemplo numa cobertura de varanda que continua sob os beirais de um corpo mais alto. Esse campo afeta somente o recorte visual dessa superfície; o recorte das demais coberturas e a altura das paredes continuam seguindo as regras existentes. Esse recorte visual considera os beirais; a regra de altura das paredes continua ignorando `eave`.

Telhados de duas águas podem ser definidos com `roofs`: `{ "id": "office-roof", "type": "gable", "base": "office", "orientation": "longitudinal", "pitch": 51, "eave": 0.4, "rake": 0.2 }`. A base pode referenciar um cômodo/zona por ID ou ser definida diretamente no telhado com `inset`, `outset`, `from/to`, `pos/size` ou `rectangle`; por exemplo, `{ "inset": ["main", 3, 0, 3, 0] }`. Nos atalhos de cinco posições, a ordem é `[id, left, top, right, bottom]`; a forma antiga `[id, dx, dy]` continua aplicando o mesmo valor aos lados correspondentes. Também é possível usar uma geometria própria em `base`, como `{ "base": { "from": ["x0 + 1", "y0 + 2"], "to": ["x1 - 1", "y1 - 2"] } }`. `pitch` é informado em graus, `eave` é o avanço dos beirais e `rake` é o avanço das extremidades das empenas, ambos em metros; use arrays (`[0.4, 0.6]`) para valores diferentes nos dois lados. A orientação aceita `longitudinal` (cumeeira no eixo Y) ou `transverse` (cumeeira no eixo X). A planta desenha a projeção translúcida e a linha da cumeeira; telhados não entram no cálculo das áreas.
O renderer também desenha triângulos tracejados nas extremidades para indicar a inclinação. A altura em Z é projetada no plano sempre em escala real de 100%, sem parâmetro adicional de escala.

Para uma cobertura de **uma água**, use `type: "shed"`. `z0` informa a cota absoluta da **borda baixa na base**, antes dos beirais. A altura entre apoios é o vão inteiro no sentido do caimento multiplicado por `tan(pitch)`. `orientation: "longitudinal"` aceita `slope: "left"` ou `"right"` (padrão); `orientation: "transverse"` aceita `slope: "top"` (frente) ou `"bottom"` (fundos, padrão). O campo `slope` aponta para a borda baixa.

```json5
{
  id: "porch-roof",
  label: "Cobertura da varanda",
  type: "shed",
  base: "porch",
  orientation: "transverse",
  slope: "top",
  pitch: 12,
  z0: "ground.z0 + 2.6",
  eave: [0.35, 0],
  rake: [0, 0.25]
}
```

Nesse exemplo, a água desce da fachada para a frente da varanda. Em `eave`, os valores correspondem às bordas esquerda/direita para orientação longitudinal e frente/fundos para transversal; `rake` corresponde às outras duas bordas. Os beirais prolongam o mesmo plano inclinado, inclusive abaixo de `z0` na borda baixa. Na planta, uma seta indica o caimento; nas fachadas e no 3D, os encontros com outros telhados são recortados. Paredes com `top: "roof"` também seguem o plano de uma água, sem considerar `eave`, como nas coberturas de duas águas. A projeção, as cotas inclinadas no DXF e a área da superfície são exportadas; o shed não recebe linha de cumeeira. Pilares, vigas, calhas e fechamentos verticais precisam ser definidos separadamente.

Use `visible: false` em uma zona, item ou outro elemento visual para ocultá-lo sem removê-lo das referências geométricas:

```json
{ "id": "reference-only", "pos": [5, 5], "size": [1, 1], "visible": false }
```

## Legendas, validação e exportação

A interface mostra cômodos com dimensões e áreas bruta/útil, resumo por piso e terreno, itens, passagens, janelas, comunicações naturais e todos os erros de cálculo ou apresentação. O botão **Baixar HTML gerado** cria um arquivo portátil com CSS embutido; **Baixar layout em Markdown** inclui tabelas, itens, passagens, janelas, erros e ASCII art. A impressão oculta os controles e ajusta a escala para papel.

O botão **Todas as camadas** alterna o limite visual das camadas. Ao selecionar uma camada, elementos acima dela são ocultados temporariamente; cálculos, listas e exportações continuam considerando a planta completa. O botão **Visão: Multi-pisos** mostra, sobre o piso selecionado, as partes descobertas dos pisos inferiores com baixa opacidade.

## Exportar DXF 2D

O JSON continua sendo a fonte da verdade. Na página, carregue a planta e clique em **Baixar DXF** para gerar o arquivo diretamente no navegador, sem Python, Node ou servidor. O arquivo usa escala 1:1 (1 unidade CAD = 1 metro).

O exportador reutiliza o resolvedor de geometria da aplicação e cria as layers `WALLS`, `WALLS_VIRTUAL`, `DOORS`, `WINDOWS`, `OPENINGS` e `ROOM_LABELS`. Paredes são interrompidas nos vãos; portas recebem folha e arco, janelas recebem duas linhas paralelas e os cômodos recebem textos quando têm espaço suficiente para a legenda.

## Gerar HTML portátil

O HTML de desenvolvimento referencia os módulos em `src/`. Para gerar uma versão
autônoma, com JavaScript e CSS incorporados em um único arquivo, execute:

```sh
bin/build
```

O resultado será salvo em `dist/floor-plan.html`. Esse arquivo pode ser copiado
ou aberto diretamente, sem servidor local e sem dependências externas. O JSON da
planta continua sendo escolhido pelo botão “Carregar JSON”.

## Arquivos principais

- `floor-plan.html`: shell, interface e template de CSS portátil.
- `src/floor-plan.css`: estilos da aplicação.
- `src/main.js`: fachada pública `FloorPlan` e orquestração no navegador.
- `src/models/`: modelo, validação, geometria, métricas, aberturas, paredes, referências e camadas.
- `src/views/`: desenho da planta, terreno, fachadas, telhados, cômodos, controles e listas.
- `src/exports/`: exportadores DXF, HTML e Markdown/ASCII.
- `src/config/`: catálogo de tipos e cores, tema, parser JSON5 e inicialização da aplicação.
- `src/floor-plan.css`: estilos gerais da página.
- `cottage-ferraz-cesar.json`: exemplo com terreno e múltiplos pisos.
