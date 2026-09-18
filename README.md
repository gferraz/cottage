# Floor Plan

Aplicação estática para desenhar plantas baixas com HTML, CSS e JSON. Não exige banco de dados, servidor, Python ou processo de build.

## Abrir e carregar uma planta

Abra [`floor-plan.html`](floor-plan.html) no navegador e clique em **Carregar JSON**. A página inicia vazia; o projeto só é carregado quando um arquivo é escolhido. **Recarregar JSON atual** relê o último arquivo selecionado.

No macOS, o comando abaixo abre a página já com o JSON embutido na URL e funciona no `zsh`:

```sh
./floor cottage-ferraz-cesar.json
```

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

## Geometria e referências

Para retângulos, use `pos: [x, y]` e `size: [w, l]`, em metros. `x/y/w/l` também são aceitos diretamente. `h` é a altura vertical; `z0` é a cota inicial. `rectangle: [x0, y0, x1, y1]` é uma alternativa. Nos dois últimos valores de `rectangle`, os aliases locais `x0`, `y0` e `z0` representam o ponto inicial: `rectangle: ["main.x0", "main.y0", "x0 + 3", "y0 + 2"]` cria um retângulo de `3 × 2 m`. `from` e `to` também aceitam esses aliases: `from: [4, 8], to: ["x0 + 1", "y0 - 3"]` termina em `[5, 5]`. Para coordenadas absolutas ou referências, use expressões como `to: ["main.x1", "main.y1"]`; arrays numéricos em `to` continuam sendo coordenadas absolutas. `inset: ["id", dx, dy]` cria um retângulo interno.

Expressões podem combinar referências e operações: `"living.x1 - 0.3"`, `"room.w / 2"` e `"part.z1"`. Cada referência oferece `x0()`, `x1()`, `y0()`, `y1()`, `w()`, `l()`, `h()` e `area()`.

Cômodos compostos usam `parts`; cada parte tem sua própria geometria e pode referenciar partes anteriores. As partes também podem ser referenciadas globalmente por ID, por exemplo `flight-1.y0`, a partir de qualquer cômodo. A regra de não sobreposição também é aplicada às partes.

Também é possível criar cômodos diretamente no console do navegador: `const porch = floor.addRoom({ pos: [3.4, 2], size: [4.3, 2.3], label: "Varanda" })`. O objeto retornado expõe `x0()`, `x1()`, `y0()`, `y1()`, `w()`, `l()`, `h()` e `area()`.

## Cômodos, paredes e sobreposições

O padrão é quatro paredes sólidas. Use `walls` com `solid`, `open` ou `virtual`:

```json
"walls": { "top": "solid", "right": "open", "bottom": "virtual", "left": "solid" }
```

Como atalho, `walls: ["top", "bottom"]` torna somente esses lados sólidos; `walls: "virtual"` torna todos pontilhados. `virtual` é separação visual, não parede sólida. Sobreposição intencional é declarada com `"overlaps": "corridor"` ou uma lista. Ela é descontada da área útil do elemento que recebe a autorização; itens também podem descontar área de cômodos.

`overlaps` é direcional: o elemento que declara a propriedade está acima do elemento referenciado. A regra vale para cômodos, itens e partes. Uma parte pode apontar para outra parte usando seu ID qualificado, por exemplo `"overlaps": "stairs.landing"`. A aplicação calcula automaticamente a camada, acusa ciclos e mostra relações válidas com destaques distintos.

## Passagens, janelas e itens

Passagens usam a parede de origem e um destino opcional:

```json
{ "from": "office.left", "to": "entry", "type": "door" }
```

`type` pode ser `door`, `opening` ou `window`. `to` omitido significa exterior. Sem `dx`/`dy` e `w`, a aplicação encontra o segmento comum, centraliza a abertura e usa os padrões: porta `0.8 m`, abertura `1.0 m`, janela `0.9 m`. O ID é gerado como `from-to-deslocamento-em-cm`. Portas e janelas são desenhadas com quatro bordas; passagens abertas mostram apenas as bordas laterais.

Itens são objetos concretos, aparecem em lista própria e podem usar `overlaps`. Use `title` para o texto exibido ao passar o mouse e `label` para a legenda. Tipos reutilizáveis podem ser declarados em `item-types`. Janelas também podem ser declaradas em `openings` com `type: "window"` ou na coleção `windows`; em ambos os casos ficam separadas da lista de passagens. Zonas virtuais (`zones`) servem para referências e marcações, sem entrar em áreas ou conflitos.

## Terreno, guias e apresentação

`terrain` aceita frente/fundo, `boundary_order`, cantos e segmentos topográficos. A frente é inferida do segmento indicado no JSON; a casa permanece ortogonal, enquanto o terreno, o Norte e a rosa dos ventos refletem sua orientação. `building.anchor` e `building.position` posicionam a casa em relação ao terreno. `viewport.size` e `viewport.origin` definem a área visível; é possível arrastar a grade com o mouse.

`guides` desenha linhas ou segmentos auxiliares. `theme.colors` personaliza a paleta. Escadas podem ter `h` positivo, `stair-flight` e `parts`, projetando-se visualmente entre pisos; aberturas verticais conectam dois IDs de pisos.

Use `visible: false` em uma zona, item ou outro elemento visual para ocultá-lo sem removê-lo das referências geométricas:

```json
{ "id": "reference-only", "pos": [5, 5], "size": [1, 1], "visible": false }
```

## Legendas, validação e exportação

A interface mostra cômodos com dimensões e áreas bruta/útil, resumo por piso e terreno, itens, passagens, janelas, comunicações naturais e todos os erros de cálculo ou apresentação. O botão **Baixar HTML gerado** cria um arquivo portátil com CSS embutido; **Baixar layout em Markdown** inclui tabelas, itens, passagens, janelas, erros e ASCII art. A impressão oculta os controles e ajusta a escala para papel.

O botão **Todas as camadas** alterna o limite visual das camadas. Ao selecionar uma camada, elementos acima dela são ocultados temporariamente; cálculos, listas e exportações continuam considerando a planta completa.

## Arquivos principais

- `floor-plan.html`: shell, interface e template de CSS portátil.
- `floor-plan.css`: estilos da aplicação.
- `floor-plan.js`: fachada pública `FloorPlan` e execução no navegador.
- `floor-plan-model.js`, `floor-plan-validation.js`, `floor-plan-renderer.js`, `floor-plan-legend.js`, `floor-plan-export.js`: módulos auxiliares.
- `floor-plan-config.js`: inicialização, carregamento por arquivo e comando `floor`.
- `cottage-ferraz-cesar.json`: exemplo com terreno e múltiplos pisos.
