# Floor Plan

Aplicação estática para desenhar plantas baixas com HTML, CSS e JSON. Não exige banco de dados, servidor, Python ou processo de build.

## Abrir e carregar uma planta

Abra [`floor-plan.html`](floor-plan.html) no navegador e clique em **Carregar JSON**. A página inicia vazia; o projeto só é carregado quando um arquivo é escolhido. Para trocar a planta, selecione outro arquivo JSON.

O seletor de piso muda apenas o desenho. As listas, totais e erros são consolidados entre todos os pisos.

## Estrutura mínima do JSON

```json
{
  "title": "Minha casa",
  "floors": [{
    "id": "ground",
    "label": "Térreo",
    "h": 0,
    "rooms": [],
    "items": [],
    "openings": []
  }]
}
```

Os IDs dos cômodos são obrigatórios, globais e únicos. IDs de zonas, itens, janelas, passagens e guias também devem ser únicos quando informados. Objetos geométricos com ID podem ser referenciados globalmente quando o tipo oferece referências. `x0`, `y0` e `z0` são palavras reservadas e não podem ser usados como IDs.

## Catálogo compartilhado

Tipos reutilizáveis de itens, padrões de portas/janelas e tokens de cor ficam em [`src/floor-plan-catalog.js`](src/floor-plan-catalog.js). Uma planta pode sobrescrever tipos em `item-types`, valores de abertura no próprio objeto e cores em `theme.colors`. A prioridade é: definição explícita da planta, catálogo compartilhado e padrão interno.

## Geometria e referências

Para retângulos, use `pos: [x, y]` e `size: [w, l]`, em metros. `x/y/w/l` também são aceitos diretamente. `h` é a altura vertical; `z0` é a cota inicial. `rectangle: [x0, y0, x1, y1]` é uma alternativa. Nos dois últimos valores de `rectangle`, os aliases locais `x0`, `y0` e `z0` representam o ponto inicial: `rectangle: ["main.x0", "main.y0", "x0 + 3", "y0 + 2"]` cria um retângulo de `3 × 2 m`. `from` e `to` também aceitam esses aliases: `from: [4, 8], to: ["x0 + 1", "y0 - 3"]` termina em `[5, 5]`. Para coordenadas absolutas ou referências, use expressões como `to: ["main.x1", "main.y1"]`; arrays numéricos em `to` continuam sendo coordenadas absolutas. `inset: ["id", dx, dy]` cria um retângulo interno e `outset: ["id", dx, dy]` cria um retângulo ampliado para fora, aumentando cada lado em `dx` e `dy`.

Expressões podem combinar referências e operações: `"living.x1 - 0.3"`, `"room.w / 2"` e `"part.z1"`. Cada referência oferece `x0()`, `x1()`, `xc()`, `y0()`, `y1()`, `yc()`, `z0()`, `z1()`, `zc()`, `w()`, `l()`, `h()` e `area()`.

Cômodos compostos usam `parts`; cada parte tem sua própria geometria e pode referenciar partes anteriores. As partes também podem ser referenciadas globalmente por ID, por exemplo `flight-1.y0`, a partir de qualquer cômodo. A regra de não sobreposição também é aplicada às partes.

Portas, janelas e vãos aceitam `z0` e `h` para a projeção vertical: `z1 = z0 + h`. Quando omitidos, portas e vãos usam `z0: 0, h: 2.1`, e janelas usam `z0: 0.9, h: 1.2`. A largura continua sendo informada por `w` e a posição relativa por `dx` ou `dy`.

Também é possível criar cômodos diretamente no console do navegador: `const porch = floor.addRoom({ pos: [3.4, 2], size: [4.3, 2.3], label: "Varanda" })`. O objeto retornado expõe `x0()`, `x1()`, `xc()`, `y0()`, `y1()`, `yc()`, `z0()`, `z1()`, `zc()`, `w()`, `l()`, `h()` e `area()`.

## Cômodos, paredes e sobreposições

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

Telhados de duas águas podem ser definidos com `roofs`: `{ "id": "office-roof", "type": "gable", "base": "office", "orientation": "longitudinal", "pitch": 51, "eave": 0.4, "rake": 0.2 }`. A base pode referenciar um cômodo/zona por ID ou ser definida diretamente no telhado com `inset`, `outset`, `from/to`, `pos/size` ou `rectangle`; por exemplo, `{ "inset": ["main", 3, 0, 3, 0] }`. Nos atalhos de cinco posições, a ordem é `[id, left, top, right, bottom]`; a forma antiga `[id, dx, dy]` continua aplicando o mesmo valor aos lados correspondentes. Também é possível usar uma geometria própria em `base`, como `{ "base": { "from": ["x0 + 1", "y0 + 2"], "to": ["x1 - 1", "y1 - 2"] } }`. `pitch` é informado em graus, `eave` é o avanço dos beirais e `rake` é o avanço das extremidades das empenas, ambos em metros; use arrays (`[0.4, 0.6]`) para valores diferentes nos dois lados. A orientação aceita `longitudinal` (cumeeira no eixo Y) ou `transverse` (cumeeira no eixo X). A planta desenha a projeção translúcida e a linha da cumeeira; telhados não entram no cálculo das áreas.
O renderer também desenha triângulos tracejados nas extremidades para indicar a inclinação. A altura em Z é projetada no plano sempre em escala real de 100%, sem parâmetro adicional de escala.

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
- `src/floor-plan.js`: fachada pública `FloorPlan` e orquestração no navegador.
- `src/floor-plan-geometry.js`: avaliação de expressões, aliases locais e referências geométricas.
- `src/floor-plan-dom.js`: criação de elementos HTML e cômodos.
- `src/floor-plan-geometry-domain.js`: normalização geométrica, paredes e escadas.
- `src/floor-plan-terrain.js`, `src/floor-plan-guides.js`, `src/floor-plan-roofs.js`: terreno e desenhos SVG.
- `src/floor-plan-openings.js`, `src/floor-plan-elements.js`: aberturas, itens e zonas.
- `src/floor-plan-references.js`, `src/floor-plan-layers.js`: referências globais, camadas e sobreposições.
- `src/floor-plan-lists.js`, `src/floor-plan-text-export.js`, `src/floor-plan-html-export.js`: listas e exportações.
- `src/floor-plan-model.js`, `src/floor-plan-validation.js`, `src/floor-plan-renderer.js`, `src/floor-plan-legend.js`, `src/floor-plan-export.js`: serviços auxiliares.
- `src/floor-plan-config.js`: inicialização, carregamento por arquivo e comando `floor`.
- `cottage-ferraz-cesar.json`: exemplo com terreno e múltiplos pisos.
