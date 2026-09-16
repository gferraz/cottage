# Floor Plan

Aplicação estática para desenhar plantas baixas usando HTML, CSS e JSON. Não há banco de dados, servidor ou processo de build obrigatório.

## Abrir a aplicação

Abra [`floor-plan.html`](floor-plan.html) no navegador e use **Carregar JSON**. Para abrir uma planta diretamente pelo terminal, no macOS:

```sh
./floor cottage-ferraz-cesar.json
```

O comando funciona no `zsh`, não exige Python e abre a planta no navegador padrão. A página aberta normalmente não carrega nenhum JSON automaticamente.

## Criar uma planta

Crie um arquivo JSON com um título e um ou mais pisos:

```json
{
  "title": "Minha casa",
  "floors": [
    {
      "id": "ground",
      "label": "Térreo",
      "rooms": [],
      "items": [],
      "openings": []
    }
  ]
}
```

IDs são obrigatórios para cômodos e devem ser únicos em todo o arquivo, independentemente do piso ou categoria. Eles podem ser usados em referências geométricas:

```json
{
  "id": "living",
  "label": "Sala",
  "pos": [1, 1],
  "size": [5, 4]
}
```

## Cômodos e partes

Use `pos: [x, y]` e `size: [largura (w), comprimento (l)]`, em metros. Também é possível informar a elevação: `pos: [x, y, z0]` e `size: [w, l, h]`, em que `z1 = z0 + h`. Para geometrias 2D, `z0` recebe o `floor.h` e `h` vale `0` por padrão; `floor.h` também vale `0` por padrão. Referências como `upper.h` podem acessar a elevação declarada no piso:

```json
{
  "id": "dining",
  "label": "Jantar",
  "pos": ["living.x1", "living.y0"],
  "size": ["living.w", 3]
}
```

Para criar um retângulo interno a partir de outra geometria, use `inset`:

```json
{
  "id": "confort",
  "inset": ["dorm", 1.0, 1.1]
}
```

Os valores são recuos não negativos nos eixos `x` e `y`, aplicados nos dois lados. Cada valor deve ser menor que metade da dimensão correspondente da geometria de referência; portanto, `0` também é permitido.

Como alternativa a `pos` + `size`, use `rectangle: [x0, y0, x1, y1]`:

```json
{
  "id": "master-room",
  "rectangle": [3.4, 4.5, 8.0, 9.0]
}
```

O renderer calcula `w = x1 - x0` e `l = y1 - y0`. Os quatro valores também podem ser referências geométricas.

Uma escada pode usar a terceira dimensão para indicar a elevação final. Quando recebe a classe `stair-flight`, o renderer usa `h` para desenhar um gradiente que fica progressivamente transparente na direção da subida:

```json
{
  "id": "stairs",
  "pos": [3.0, 6.0, 0.0],
  "size": [1.5, 5.0, 6.0],
  "classes": "circulation stair-flight"
}
```

Para uma escada vertical, a subida é inferida no eixo `y`; para uma escada horizontal, no eixo `x`. A representação considera `2 m` como altura confortável de passagem: a parte inferior fica mais escura, chega a aproximadamente `90%` de transparência aos `2 m` e permanece quase transparente até o topo.

Como alternativa, uma escada pode usar `from` e `to` como cantos opostos da sua área. O terceiro valor indica as cotas inicial e final; a direção da subida é deduzida automaticamente:

```json
{
  "id": "stairs",
  "from": [8.0, 6.0, 0.0],
  "to": [3.5, 7.5, 3.0],
  "classes": "circulation stair-flight"
}
```

Nesse formato, a largura já está implícita na diferença entre `from` e `to`; a escada começa em `from` e termina em `to`.

Uma escada com `h` positivo aparece automaticamente em todos os pisos cujo `floor.h` esteja entre `z0` e `z1`. Portanto, ela pode ser declarada apenas no piso inferior; suas representações nos demais pisos são visuais e não duplicam cômodos ou áreas.

Uma abertura entre pisos usa os IDs dos pisos como origem e destino. Ela fica na laje do piso `from`, com `z = from.h` e `h = 0`; sua área continua independente da escada:

```json
{ "from": "upper", "to": "ground", "type": "opening", "pos": ["stairs.x0", "stairs.y0"], "size": ["stairs.w", 3.0] }
```

O renderer valida se os dois pisos existem, se têm elevações diferentes e se a posição e o tamanho do vão são válidos.

As linhas dos degraus são geradas em CSS com espaçamento fixo de `0,30 m`.

Cômodos compostos usam `parts`:

```json
{
  "id": "l-shaped",
  "label": "Ambiente em L",
  "parts": [
    { "id": "main", "pos": [0, 0], "size": [4, 2] },
    { "id": "wing", "pos": [0, 2], "size": [2, 3] }
  ]
}
```

## Paredes e sobreposição

Por padrão, há quatro paredes sólidas. Use `walls` para alterar lados:

```json
"walls": { "top": "solid", "right": "open", "bottom": "virtual", "left": "solid" }
```

`virtual` desenha uma separação pontilhada; `open` não desenha parede. Para cômodos intencionalmente sobrepostos, informe `"overlaps": "outro-id"`.

Uma porta ou passagem pode ligar um cômodo contido em outro ambiente. Nesse caso, informe a parede sólida do cômodo menor e o ambiente envolvente em `to`; o renderer verifica se o segmento da abertura está dentro da geometria do destino, mesmo sem uma parede coincidente:

```json
{ "from": "powder.bottom", "to": "corridor", "type": "door" }
```

## Itens, zonas e passagens

Itens representam objetos concretos e não entram na lista de cômodos:

```json
{ "title": "Mesa", "pos": ["dining.x0 + 1", "dining.y0 + 1"], "size": [2.7, 1.1], "classes": "table" }
```

Zonas são áreas virtuais de referência. Não entram em áreas, listas ou conflitos:

```json
{ "id": "future-extension", "label": "Ampliação", "pos": ["living.x1", 1], "size": [3, 4] }
```

Passagens usam `from`, `to` opcional, `type` (`door`, `opening` ou `window`) e, opcionalmente, `dx`, `dy` e `w`. Sem posição ou largura, a aplicação centraliza e usa o padrão do tipo:

```json
{ "from": "living.right", "to": "dining", "type": "door" }
```

## Legendas e exportação

O seletor de piso altera apenas o desenho. As listas, totais, passagens, itens e erros permanecem consolidados entre todos os pisos. Os botões permitem baixar um HTML portátil com CSS embutido ou um arquivo Markdown com tabelas e ASCII art.

Erros de IDs, referências, geometria, paredes, passagens e renderização aparecem na seção **Itens com erro**.

## Arquivos principais

- `floor-plan.html`: shell da aplicação e CSS portátil.
- `cottage-ferraz-cesar.json`: exemplo com térreo e primeiro andar.
