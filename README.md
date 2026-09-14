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

Use `pos: [x, y]` e `size: [largura (w), comprimento (l)]`, em metros. Também são aceitos `x`, `y`, `w` e `l`. Valores podem referenciar outro cômodo:

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

Os valores são recuos positivos nos eixos `x` e `y`, aplicados nos dois lados. Cada valor deve ser menor que metade da dimensão correspondente da geometria de referência.

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
