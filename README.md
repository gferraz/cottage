# Floor Plan

[Abrir a aplicação](https://gferraz.github.io/cottage/)

Aplicação estática para desenhar plantas baixas com HTML, CSS e JSON. Não exige banco de dados, servidor, Python ou processo de build.

Os nomes dos cômodos, as medidas da planta e as legendas dos telhados usam Architects Daughter, de Kimberly Geswein, em negrito. Os nomes dos cômodos e os títulos dos telhados aparecem em maiúsculas. A fonte está incorporada em `src/fonts.css` para funcionar offline e nas exportações, sob a licença SIL OFL 1.1 disponível em `src/fonts/architects-daughter-OFL.txt`. Fonte original: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/architectsdaughter).

## Abrir e carregar uma planta

Abra [`floor-plan.html`](floor-plan.html) no navegador e clique em **Carregar JSON**. A página inicia vazia; o projeto só é carregado quando um arquivo é escolhido. Para trocar a planta, selecione outro arquivo JSON.

O botão **Carregar exemplo**, na tela inicial e na barra lateral, busca `cottage-ferraz-cesar-2-level-floors.json5` diretamente do arquivo raw da branch `main` no GitHub (`gferraz/cottage`). Esse carregamento requer internet; arquivos locais continuam disponíveis pelo botão **Carregar planta**.

Arquivos `.json5` e `.jsonc` também são aceitos. Eles usam a mesma estrutura do JSON, mas permitem comentários, chaves sem aspas e vírgulas finais:

```json5
{
  title: "Minha casa", // comentário
  floors: [{ id: "ground", rooms: [], }],
}
```

O parser é embutido na aplicação; não é necessário instalar biblioteca ou servidor.

As caixas de seleção dos pisos mudam apenas o desenho: marque um ou mais pisos para combinar a planta baixa e a perspectiva 3D. **Mostrar tudo** marca ou desmarca todos os pisos e telhados; também é possível desmarcar todos. As listas, totais e erros são consolidados entre todos os pisos.

## Editar a planta

O arquivo ativo é `cottage-ferraz-cesar.json5`. O índice no início contém marcadores para buscar com Ctrl+F / Cmd+F. Listas de objetos com `id` ficam em ordem alfabética; listas sem IDs e coordenadas mantêm sua ordem. A ordem das seções do primeiro nível é preservada. As aberturas laterais ficam junto ao cômodo, em `rooms[].openings`; `from: "left"` refere-se à face `x0` do cômodo (à direita na planta girada). Vãos entre pavimentos continuam em `floors[].openings`.

A versão separada `cottage-ferraz-cesar-cartesiana.json` usa `coordinate_system: "cartesian"`: X cresce da esquerda para a direita e Y da frente para os fundos (de baixo para cima na planta). O corpo principal ocupa X de −10 a 0; a origem X está na lateral direita. É uma cópia independente com medidas numéricas resolvidas, sem as fórmulas paramétricas do original. Paredes locais e aberturas usam `left = x0` e `right = x1`; os beirais longitudinais seguem essa mesma ordem. Nas coberturas transversais, `eaves.left/right` continuam representando frente/fundos. Coordenadas cadastrais do terreno, implantação e cotas Z são preservadas. A aplicação adapta esse arquivo ao referencial interno ao carregar; o arquivo original permanece no formato anterior. A convenção cartesiana aceita medidas numéricas e fórmulas em `pos/size`, `from/to`, `rectangle`, `inset`, `outset` e `path.points`.

A versão `cottage-ferraz-cesar-cartesiana-parametrica.json5` usa os mesmos eixos cartesianos e preserva `parameters` e as fórmulas entre objetos. É a alternativa para continuar editando o projeto com X crescente da esquerda para a direita. A conversão ajusta limites X, posições pela largura, aberturas, rotações e lados dos beirais, sem alterar Y, Z ou a implantação. Os padrões de beirais são escritos em cada telhado para respeitar sua orientação. A adaptação para o desenho acontece simbolicamente antes da resolução dos parâmetros. O original não é substituído.

Para regenerar essa cópia a partir do original (sobrescrevendo somente a versão paramétrica cartesiana):

```sh
node bin/migrate-cartesian.cjs
```

Nas fórmulas de **itens**, referências a cômodos usam automaticamente os limites internos em planta: `x0`, `x1`, `y0`, `y1`, centros, largura, comprimento e área consideram as faces das paredes. Por exemplo, `"bedroom-east.x0 + 0.4"` indica 40 cm livres a partir da face interna, sem somar metade da espessura. O cálculo considera paredes sólidas do cômodo, compartilhadas com vizinhos e independentes coincidentes com seus limites no mesmo piso; paredes virtuais não descontam espaço. Em limites parcialmente cobertos, o afastamento retangular usa a maior espessura coincidente naquele lado.

Essa convenção vale também para `copy`, `inset` e `outset` dos itens. As definições dos próprios cômodos, paredes, zonas, guias e telhados mantêm suas referências originais. Referenciar uma zona ou guia a partir de um item também mantém os valores originais, mesmo que sua definição use um cômodo. Referências a outros itens usam a geometria já calculada deles. Coordenadas Z e espessuras de telhados não mudam nesta etapa; não há sintaxe `raw`.

Ao adaptar arquivos antigos, remova das fórmulas dos itens as compensações manuais de meia espessura **somente nas referências a cômodos**. Zonas e guias não passam a ter espessura. A planta ativa já foi migrada; arquivos em `archive/` preservam fórmulas históricas e podem precisar desse ajuste ao serem reabertos.

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

`config.walls` define padrões somente das paredes independentes; `config.roofs`, dos telhados; `config.doors`, das portas; `config.windows`, das janelas; `config.openings`, dos vãos livres; e `config.floors`, dos pavimentos. O valor explícito no elemento prevalece. `ceiling_height` é o nome atual; `wall_max_height` continua aceito por compatibilidade.

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

Para reunir níveis com desníveis no mesmo pavimento visual, use `storey`, por exemplo `storey: "ground"` nos dois térreos e `storey: "upper"` nos dois níveis dos dormitórios. Na página, os grupos seguem sua menor cota Z, e seus níveis são apresentados da frente para os fundos (menor Y), com desempate pelo menor X. A posição considera os limites dos cômodos. Sem `storey`, cada nível segue sua própria cota Z. A ordem do arquivo e os cálculos geométricos não mudam.

`floors[].z0` aceita números e expressões com parâmetros e cotas de outros pavimentos, como `"ground-rear.z0 + params.floor_height"`. São aceitas as operações `+`, `-`, `*`, `/` e parênteses. As cotas são resolvidas antes da geometria, independentemente da ordem dos pavimentos no arquivo; referências inexistentes, ciclos e resultados não finitos geram erro com a localização da definição. Nesse campo, as referências geométricas se limitam a `ID-do-pavimento.z0`: cômodos e outras propriedades ainda não estão disponíveis. Use parâmetros para medidas compartilhadas e defina cotas derivadas diretamente no pavimento.

Os IDs dos cômodos são obrigatórios, globais e únicos. IDs de zonas, itens, janelas, passagens e guias também devem ser únicos quando informados. Objetos geométricos com ID podem ser referenciados globalmente quando o tipo oferece referências. `x0`, `y0` e `z0` são palavras reservadas e não podem ser usados como IDs.

## Catálogo compartilhado

Tipos reutilizáveis de itens ficam em [`lib/items.json`](lib/items.json); padrões de portas/janelas e tokens de cor ficam em [`src/config/catalog.js`](src/config/catalog.js). O build incorpora a biblioteca de itens em `dist/index.html`, sem requisição externa. Uma planta pode sobrescrever tipos em `item-types`, valores de abertura no próprio objeto e cores em `theme.colors`. A prioridade é: definição explícita da planta, catálogo compartilhado e padrão interno.

Camas (`queen-bed` e `twin-bed`) aceitam `nightstand: { w: 0.5, side: "both" }`. A largura `w` é sempre opcional (0,5 m para queen e 0,4 m para twin, salvo definição no catálogo). Ela também define a profundidade: os criados-mudos são quadrados, afastados 5 cm das laterais e alinhados à cabeceira. Eles herdam a altura e a rotação da cama. Use `side: "left"`, `"right"` ou `"both"` para escolher o lado antes da rotação da cama. Use `nightstand: { side: "none" }` para remover os criados-mudos, sem precisar informar `w`. O padrão é `"right"` para `twin-bed` e `"both"` para `queen-bed`. Sem `nightstand`, a cama queen inclui dois criados-mudos de 0,5 × 0,5 m, e a cama twin inclui um criado-mudo à direita de 0,4 × 0,4 m. A opção também pode ser definida no catálogo ou em `item-types`.

```json5
{
  id: "master-bed",
  type: "queen-bed",
  pos: [2, 3],
  nightstand: { w: 0.5, side: "both" }
}
```

Exemplo para cama de solteiro (omitir `side` também seleciona o lado direito):

```json5
{
  type: "twin-bed",
  pos: [2, 3],
  nightstand: { w: 0.4, side: "right" }
}
```

O ID da cama continua representando apenas a cama. Os criados-mudos recebem os IDs `master-bed-nightstand-left` e `master-bed-nightstand-right` (lados antes da rotação), com referências geométricas próprias. Eles aparecem nas vistas, nas listas de itens e nas exportações; a configuração original continua contendo apenas o conjunto.

Camas queen também aceitam `recamier: true`. O recamier mede 1,4 × 0,45 × 0,45 m e fica centralizado aos pés da cama, com afastamento de 0,05 m, acompanhando sua rotação e elevação. O padrão é não incluir recamier; `recamier: false` também desativa uma definição do catálogo. O ID gerado é `<id-da-cama>-recamier`.

Mesas (`type: "dining-table"` ou classe `table`) incluem cadeiras automaticamente. Cada cadeira mede 0,45 × 0,45 × 0,85 m, fica voltada para a mesa e afastada 5 cm da borda. Mesas retangulares reservam 60 cm de borda por cadeira em cada um dos quatro lados (mínimo de uma por lado), com distribuição centralizada. Mesas com classe `round-table` distribuem as cadeiras pelo perímetro circular ou elíptico, com mínimo de quatro. As cadeiras acompanham a rotação e a elevação da mesa e recebem IDs `<id-da-mesa>-chair-1`, etc. Use `chairs: 0` para desativar; omita a opção para calcular automaticamente.

```json5
{
  id: "dining-table",
  type: "dining-table",
  pos: [2, 3],
  size: [1.8, 0.9, 0.75] // 8 cadeiras: 3 + 3 nas laterais e 1 + 1 nas cabeceiras
}
```

## Escopo de paredes independentes

Use `scope` com o ID de um pavimento ou cômodo:

```json5
{
  id: "knee-wall-front-left",
  scope: "unused-north", // Também pode ser "upper", o ID do pavimento.
  base: { level: "upper.z0" },
  top: "roofs",
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

Escadas são elementos independentes em `stairs`, no mesmo nível de `walls` e `roofs`, ou em `floors[].stairs`. A coleção determina a categoria; não é necessário usar `classes: "stair-flight"`. Um lance simples usa `kind: "flight"` (padrão), e um patamar plano usa `kind: "landing"`. Escadas compostas agrupam lances e patamares em `parts`, cada um com sua geometria e seu `kind`.

```json5
{
  id: "ground",
  z0: 0,
  rooms: [/* cômodos */],
  stairs: [{
    id: "entry-stairs",
    label: "Escada de entrada",
    from: [0, 0, -0.30],
    to: [3, 0.68, 0],
    orientation: "longitudinal",
    type: "solid-flared",
    steps: { widths: [3, 1.8] },
  }],
}
```

`config.stairs` define padrões para escadas e partes; valores explícitos prevalecem. Escadas globais podem declarar `scope: "ground"` para o pavimento de origem. IDs de escadas e partes continuam disponíveis em expressões, como `entry-stairs.z0`, `stairs.y0` ou `upper-landing.z0`. As escadas participam das análises de acesso e altura livre e das vistas 2D/3D, sem aumentar a contagem ou a área dos cômodos. Paredes de fechamento continuam configuráveis em `walls` da escada ou de suas partes. Paredes de partes são geradas na planta, nas fachadas e no 3D, começando na cota inferior da parte e usando sua extensão vertical (ou `top` explícito); os IDs seguem `<escada>.<parte>-<lado>`. Arquivos antigos com escadas em `rooms` e classes `stair-flight`/`stair-landing` permanecem compatíveis; para novas definições, use `stairs` e `kind`.

Lances de escada aceitam `risers` (inteiro ≥ 2) para fixar o número de espelhos. A planta e o 3D desenham `risers - 1` pisadas: o último espelho termina no piso ou patamar de destino. A altura de cada espelho é `h / risers`, e a profundidade da pisada é a projeção do lance dividida por `risers - 1`. O plano inferior ideal acompanha as quinas inferiores dos espelhos, sem espessura estrutural presumida. Sem `risers`, permanece a representação automática anterior, estimada a partir de 16 cm de altura.

Para escadarias externas em semi-pirâmide, use `type: "solid-flared"` e `steps: { widths: [3, 2.6, 2.2, 1.8] }` (larguras da base ao topo). Cada bloco sólido vai da base até sua cota e continua até a varanda; o bloco inferior envolve todos os demais. A largura fica centralizada e a borda posterior é comum a todos os blocos. O número de larguras determina o número de pisos e espelhos, incluindo o piso superior; `h: 0.6` e projeção de 1,36 m resultam em quatro espelhos de 15 cm e recuos frontais de 34 cm. `colors.thread` e `colors.riser` controlam as cores dos pisos e das faces verticais.

Degraus e patamares usam automaticamente faixas de altura livre quando alguma pisada ou patamar da escada tem menos de 2,70 m livres acima. Cada pisada recebe uma única cor, correspondente à menor distância vertical entre qualquer ponto de sua superfície e a face inferior de telhados, lajes ou outros lances. A própria peça e superfícies inteiramente abaixo da pisada são excluídas. Uma região coberta pequena também limita o degrau inteiro; regiões sem cobertura não inventam uma altura livre. Os limites de cor seguem as faixas de altura livre existentes. Não há controles novos para habilitar cores ou gradiente.

Quando nenhuma pisada ou patamar tem menos de 2,70 m livres (inclusive sem cobertura definida), permanece o gradiente de elevação: do tom escuro nas cotas baixas até a cor clara de circulação nas cotas altas. A escala usa o piso de origem e a maior cota de toda a escada, sem reiniciar por lance. A planta e o 3D aplicam a mesma decisão e as mesmas cores, inclusive ao visualizar a escada por outro piso.

### Escadas por percurso

Também é possível definir uma escada por uma sequência de direções e cotas, sem calcular as coordenadas de cada parte. Veja o projeto completo em [`escadas-percurso.json5`](escadas-percurso.json5), que reúne três lances e uma semi-pirâmide.

```json5
{
  id: "stairs",
  pos: [4, 6, "ground.z0"],
  width: 1.2, // Opcional.
  riser: 0.17, // Espelho desejado, opcional.
  tread: 0.28, // Piso do degrau, opcional.
  parts: [
    { id: "first-flight", direction: "-y", to: 1.02 },
    { id: "first-landing" },
    { id: "second-flight", direction: "+x", to: 2.04 },
    { id: "extended-landing", direction: "+y", run: 2.4 },
    { id: "third-flight", direction: "-x", to: "upper.z0" },
  ],
}
```

`pos` é o centro da face de entrada do primeiro lance, e não o canto do envelope. Sua terceira coordenada é uma cota absoluta; quando omitida, usa a cota do pavimento. Direções aceitas: `+x`, `-x`, `+y` e `-y`. Os limites `stairs.x0`, `stairs.y0` etc. são calculados depois de montar o percurso.

Com `to` escalar (número ou expressão), a parte é um lance ascendente até aquela cota absoluta. Nas expressões de cada parte, `z0` representa a cota de partida daquela parte: `to: "z0 + 1.5"` sobe 1,50 m a partir da chegada anterior. Patamares mantêm a cota, sem acrescentar altura. Em `pos[2]`, `z0` representa a cota do pavimento; por exemplo, `pos: [4, 6, "z0 + 0.3"]` parte 30 cm acima dele. Referências como `ground.z0` e `upper.z0` continuam absolutas. O número de espelhos é o inteiro mais próximo de `desnível / riser`, com mínimo de dois; a altura real é `desnível / espelhos`. Há um piso a menos que espelhos, pois a chegada é o patamar ou pavimento, e `run = (espelhos - 1) * tread`. `risers` pode fixar a quantidade; `run` explícito fixa o comprimento e recalcula o piso real. Valores positivos são obrigatórios. Lances com espelhos diferentes geram um aviso.

Sem `to`, a parte é um patamar horizontal entre dois lances. `run` define seu comprimento total, incluindo as conexões, e assume `width` quando omitido. Para uma curva em L, a direção do patamar pode ser omitida: ele avança no sentido do lance anterior e sai pela face voltada ao seguinte. Para um retorno em U, informe uma direção perpendicular ao lance anterior para escolher o lado do afastamento. Por exemplo, `+y`, patamar em `+x` com `run: 2.4`, e lance em `-y` geram dois lances paralelos. Um percurso reto pode usar apenas um lance ou lances consecutivos na mesma direção. Mudanças de direção entre lances exigem patamar.

Os defaults de `width`, `riser` e `tread` são respectivamente 1,20 m, 0,17 m e 0,28 m. Podem ser definidos em `config.stairs`, na escada ou em cada parte, nessa ordem de precedência. Partes sem ID recebem `<escada>-part-<posição>`. IDs explícitos continuam disponíveis em referências geométricas. Não misture partes por percurso e partes por coordenadas na mesma escada.

`type: "solid-flared"` continua disponível, inclusive por percurso. `steps.widths` informa as larguras da base ao topo e determina tanto a largura máxima quanto a quantidade de espelhos e pisos, incluindo o piso superior. Assim, quatro larguras, `to: 0.6` a partir de zero e `tread: 0.34` geram quatro espelhos de 15 cm e `run: 1.36`. Um `risers` explícito deve coincidir com a quantidade de larguras.

A validação do percurso verifica conexão na mesma cota, cobertura de toda a largura nas interfaces, dimensões dos patamares e interseções entre partes cujos intervalos de altura se encontram. Partes em intervalos de altura separados podem compartilhar projeção; as análises existentes de altura livre continuam responsáveis pela folga vertical. A sintaxe antiga por `from`/`to` em arrays permanece compatível.

Aberturas verticais entre pisos recortam a laje superior e as lajes intermediárias atravessadas, preservando a laje do piso inferior. O recorte participa do 3D e dos cálculos de altura livre acima e abaixo das escadas e nos cômodos.

Portas, janelas e vãos aceitam `z0` e `h` para a projeção vertical: `z1 = z0 + h`. Quando omitidos, portas e vãos usam `z0: 0, h: 2.1`, e janelas usam `z0: 0.9, h: 1.2`. A largura continua sendo informada por `w` e a posição relativa por `dx` ou `dy`.

Também é possível criar cômodos diretamente no console do navegador: `const porch = floor.addRoom({ pos: [3.4, 2], size: [4.3, 2.3], label: "Varanda" })`. O objeto retornado expõe `x0()`, `x1()`, `xc()`, `y0()`, `y1()`, `yc()`, `z0()`, `z1()`, `zc()`, `w()`, `l()`, `h()` e `area()`.

O grupo **Pisos e telhados** reúne os checkboxes de pavimentos e **Telhados**, sem modos separados de isolamento. **Telhados** controla a visibilidade das coberturas na planta, nas elevações e no 3D.

No controle **Piso**, cada caixa pode ser marcada independentemente. A planta baixa e a perspectiva 3D mostram a combinação selecionada de cômodos, itens, aberturas, escadas e lajes. Paredes que atravessam pavimentos são recortadas nas cotas dos pisos selecionados; no último piso, o topo continua limitado pelos telhados. O terreno permanece como contexto, com os telhados controlados pela opção **Telhados**.

Na perspectiva 3D, os itens são representados por volumes esquemáticos, respeitando posição, piso, dimensões, cor e rotação. Camas, carro, mesa, sofás, poltronas, lavadoras e lareira têm formas próprias; outros itens usam um volume genérico. A terceira dimensão de `size` define a altura. Sem altura positiva, usam-se valores de visualização: carro 1,45 m, mesa 0,75 m, lareira 1,80 m e demais itens 0,60 m.

## Cômodos, paredes e sobreposições

No 3D e nas elevações, todas as paredes (inclusive independentes e diagonais) têm sua altura recortada pelas superfícies dos telhados nas áreas cobertas, considerando espessura e vãos. Os avanços `eave` não participam do limite de altura das paredes; os avanços `rake` continuam considerados. Nos encontros de telhados, prevalece a superfície mais alta; trechos sem cobertura mantêm a altura definida.

Em `path.points` de paredes independentes, `x0` e `y0` representam as coordenadas do ponto anterior já resolvido. Por exemplo, `[[4, 2], ["x0", "y0 + 3"], [8, "y0"]]` resulta em `[[4, 2], [4, 5], [8, 5]]`. O primeiro ponto precisa usar coordenadas absolutas ou referências a outros objetos.

Para paredes independentes, use `top: "roofs"` para alcançar automaticamente a cobertura, tanto no 3D quanto nas elevações:

```js
{
  id: "front-wall",
  base: { level: "ground.z0" },
  top: "roofs",
  thickness: 0.12,
  path: { points: [["office.x0", "office.y0"], ["office.x1", "office.y0"]] }
}
```

Nesse modo, somente os trechos cobertos são desenhados; nos encontros prevalece o telhado mais alto. Se nenhum telhado válido cobrir o caminho acima da base, a parede aparece em **Itens com erro**. A forma `top: ...` continua disponível para limitar a parede a uma cota explícita.

Para limitar paredes por um objeto superior, use `top` com o ID, tanto no cômodo quanto na parede independente:

```json5
top: "stairs" // Usa as partes da escada conforme sua projeção.
// Para selecionar apenas algumas partes:
top: ["upper-flight", "upper-landing"]
```

A referência aceita IDs de telhados, cômodos, partes, itens ou outras referências retangulares sem rotação. Um cômodo composto usa as suas partes. Lances seguem o plano inclinado ideal entre as cotas das extremidades; patamares e outros volumes usam sua cota inferior `z0`. Nenhuma espessura estrutural é presumida. Os lances no 3D deixam o volume sob esse plano livre. Nos encontros, prevalece a face inferior mais baixa; trechos fora das projeções mantêm o limite normal. O recorte considera a espessura das paredes e aparece no 3D e nas elevações. Referências inválidas geram erro de parede. O recorte não valida automaticamente a altura útil de portas ou equipamentos.

Arquivos anteriores com `top: { under: ..., offset: ... }` continuam sendo lidos por compatibilidade. Sem deslocamento, prefira `top` diretamente com o ID ou a lista de IDs. A forma `top: ...` continua válida para cotas explícitas.

Na definição de um cômodo, `"unused": true` exclui sua área da área usada (inclusive nos totais e nas exportações). A área bruta, a geometria e as regras de sobreposição são preservadas. O padrão é `false` quando o parâmetro é omitido.

O padrão é quatro paredes sólidas. Use `walls` com `solid`, `open` ou `virtual`:

```json
"walls": { "top": "solid", "right": "open", "bottom": "virtual", "left": "solid" }
```

Com `config.room_wall_sides: "house"`, como em `cottage-ferraz-cesar.json5`, `left` segue a esquerda da casa (`x1`, à esquerda na planta com a frente embaixo) e `right` segue a direita da casa (`x0`, à direita nessa vista). A opção vale para `walls` dos cômodos e de suas partes. Sem ela, `left` é `x0` e `right` é `x1`. As aberturas em `doors`, `windows` e `openings` mantêm os eixos geométricos anteriores ao giro: `left = x0` e `right = x1`. O giro da vista não altera coordenadas ou referências. IDs como `house-left`, `central-left`, `knee-left`, `main-left` e `upper-left-wall` seguem os lados da casa; seus pares `right` seguem o lado oposto.

Como atalho, `walls: ["top", "bottom"]` torna somente esses lados sólidos; `walls: "virtual"` torna todos pontilhados. `virtual` é separação visual, não parede sólida. Sobreposição intencional é declarada com `"overlaps": "corridor"` ou uma lista. Ela é descontada da área útil do elemento que recebe a autorização; itens também podem descontar área de cômodos.

`overlaps` autoriza a interseção e ajusta a área útil. `overlays` é separado e indica que o elemento atual deve ficar visualmente acima do elemento referenciado; somente essa propriedade participa das camadas. A regra vale para cômodos, itens e partes. Uma parte pode apontar para outra parte usando seu ID qualificado, por exemplo `"overlays": "stairs.landing"`. A aplicação calcula automaticamente a camada e acusa ciclos.

## Portas, janelas, vãos e itens

Use as coleções `doors`, `windows` e `openings` na raiz de plantas com piso único, nos pisos, nos cômodos e nas coberturas. Coleções omitidas equivalem a listas vazias. A coleção determina a categoria, sem precisar de `type`:

```json5
{
  config: {
    doors: { w: 0.8, h: 2.1, z0: 0 },
    windows: { w: 0.9, h: 1.5, z0: 0.9 },
    openings: { w: 1, h: 2.1, z0: 0 },
  },
  // No piso, use referências qualificadas; dentro de um cômodo, use o lado local.
  doors: [{ from: "office.left", to: "entry" }],
  windows: [{ from: "office.front", w: 1.5 }],
  openings: [{ from: "office.right", to: "hall", w: 2 }],
}
```

`openings` sem `type` significa vão livre, inclusive na largura padrão de 1 m; para uma porta, use `doors`. Aberturas entre pavimentos continuam em `openings`, com IDs dos pisos em `from/to` e geometria própria. As coleções das coberturas seguem as restrições existentes: fechamentos verticais não são criados automaticamente; uma superfície ausente gera erro e requer uma parede explícita. Aceitar a coleção no contrato não cria suporte a recortes nas águas inclinadas do telhado.

`to` omitido significa exterior. Sem `dx`/`dy` e `w`, a aplicação encontra o segmento comum, centraliza a abertura e usa os padrões acima. Os campos explícitos do elemento prevalecem sobre os padrões de `config`, que prevalecem sobre o catálogo. Use `dx` ao longo de qualquer parede; `dy` continua aceito nas verticais. O ID explícito é preservado; quando omitido, é gerado como `from-to-deslocamento-em-cm`. Para definir janelas como entidades independentes, declare-as em `windows` no pavimento (ou na raiz de uma planta de piso único), com ID próprio e `from` qualificado, por exemplo `{ id: "janela-sala", from: "sala.front", w: 1.5 }`. O formato local dentro do cômodo continua aceito. Portas e janelas são desenhadas com quatro bordas; vãos livres mostram apenas as bordas laterais.

Por compatibilidade, `openings` com `type: "door"`, `"window"` ou `"opening"` continua interpretado pela categoria antiga e gera aviso de depreciação. Mova a entrada para a coleção correspondente e remova `type`. Em `doors` e `windows`, a coleção sempre tem prioridade sobre `type`; o schema exige que um `type` redundante corresponda à coleção. Os padrões antigos `config.openings.door/window/opening` também continuam aceitos com aviso. A prioridade é por propriedade: padrões novos → padrões antigos → catálogo.

Veja o [exemplo carregável com dois pavimentos](examples/portas-janelas-vaos.json5). A planta principal, os exemplos e os fixtures de uso corrente foram migrados. Estudos históricos em `archive/` mantêm a sintaxe original para preservar o registro e exercitar a compatibilidade; carregar um arquivo não altera sua fonte automaticamente.

Itens são objetos concretos, aparecem em lista própria e podem usar `overlaps`. Use `title` para o texto exibido ao passar o mouse e `label` para a legenda. Tipos reutilizáveis podem ser declarados em `item-types`. Portas, janelas e vãos aparecem em listas e tabelas separadas. Zonas virtuais (`zones`) servem para referências e marcações, sem entrar em áreas ou conflitos.

## Terreno, guias e apresentação

`terrain` aceita frente/fundo, `boundary_order`, cantos e segmentos topográficos. A frente é inferida do segmento indicado no JSON; a casa permanece ortogonal, enquanto o terreno, o Norte e a rosa dos ventos refletem sua orientação. `building.anchor` e `building.position` posicionam a casa em relação ao terreno. `viewport.size` e `viewport.origin` definem a área visível; é possível arrastar a grade com o mouse.

Paredes independentes com `id` também podem ser usadas em expressões geométricas de cômodos, itens, guias e outras paredes, inclusive antes de sua declaração. Por exemplo: `from: ["knee-right.x0", "knee-wall-rear.y0 - 1"]`. As propriedades `x0`, `x1`, `xc`, `y0`, `y1`, `yc`, `w`, `l` e `area` usam a caixa que envolve todo o caminho da parede, incluindo metade da espessura em cada extremidade; `z0`, `z1`, `zc` e `h` usam os limites verticais. Referências circulares são rejeitadas. A posição da parede pode definir um cômodo mesmo quando sua altura depende desse cômodo, desde que não haja um ciclo nas propriedades calculadas.

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

Nesse exemplo, a água desce da fachada para a frente da varanda. Em `eave`, os valores correspondem às bordas esquerda/direita para orientação longitudinal e frente/fundos para transversal; `rake` corresponde às outras duas bordas. Os beirais prolongam o mesmo plano inclinado, inclusive abaixo de `z0` na borda baixa. Na planta, uma seta indica o caimento; nas fachadas e no 3D, os encontros com outros telhados são recortados. Paredes com `top: "roofs"` também seguem o plano de uma água, sem considerar `eave`, como nas coberturas de duas águas. A projeção, as cotas inclinadas no DXF e a área da superfície são exportadas; o shed não recebe linha de cumeeira. Pilares, vigas, calhas e fechamentos verticais precisam ser definidos separadamente.

Use `visible: false` em uma zona, item ou outro elemento visual para ocultá-lo sem removê-lo das referências geométricas:

```json
{ "id": "reference-only", "pos": [5, 5], "size": [1, 1], "visible": false }
```

## Legendas, validação e exportação

A interface mostra cômodos com dimensões e áreas bruta/útil, resumo por piso e terreno, itens, portas, janelas, vãos, comunicações naturais e todos os erros de cálculo ou apresentação. O botão **Baixar HTML gerado** cria um arquivo portátil com CSS embutido; **Baixar layout em Markdown** inclui tabelas, itens, portas, janelas, vãos, erros e ASCII art. A impressão oculta os controles e ajusta a escala para papel.

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

O resultado será salvo em `dist/index.html`. Esse arquivo pode ser copiado
ou aberto diretamente, sem servidor local. A visualização 3D carrega Three.js de um CDN. O JSON da
planta continua sendo escolhido pelo botão “Carregar JSON”.

## Publicar no GitHub Pages

Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
O workflow `.github/workflows/pages.yml` executa os testes, gera o HTML portátil
e publica somente a pasta `dist` a cada push em `main`. Também pode ser executado
manualmente em **Actions → Publicar no GitHub Pages → Run workflow**.

O endereço padrão é https://gferraz.github.io/cottage/.

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

No 3D, as superfícies dos telhados têm espessura vertical padrão de 0,12 m, com topo, face inferior e bordas fechadas. Use `thickness` no telhado (ou em `config.roofs`) para ajustar em metros; `0` mantém uma superfície sem volume. A espessura cresce acima da superfície de referência, preservando o contato das paredes. A planta, as elevações e as cotas de referência continuam representando a superfície original.

Nos dois estudos `cottage-ferraz-cesar*.json5`, a reserva preliminar do conjunto é de 0,30 m perpendicular às águas principais, incluindo estrutura com isolamento entre peças, canal ventilado livre de aproximadamente 0,05 m e acabamentos. Os parâmetros `roof_thickness_51` (0,477 m) e `roof_thickness_20` (0,320 m) convertem essa reserva para a espessura vertical do renderizador: `0,30 / cos(inclinação)`, arredondada para cima. Beirais com inclinação de 30° conservam a espessura vertical do corpo de 51°, ficando com aproximadamente 0,413 m perpendiculares à água; o modelo não individualiza as camadas ou a espessura do beiral.

Nesses estudos, a superfície de referência é tomada como acabamento interno. A reserva cresce acima dela, sem reduzir a altura livre calculada; as fachadas e cotas continuam usando essa referência. O volume representa uma reserva geométrica, sem dimensionar as peças estruturais ou modelar entradas de ar nos beirais e saídas superiores. A continuidade da ventilação e seus desvios nos encontros entre telhados devem ser detalhados no projeto construtivo.

As faces laterais da espessura no 3D usam a cor Casca de Pinus (SW 2807, aproximação digital `#6e5241` do catálogo), com material opaco; as águas e a face inferior mantêm o material original.

### Inclinação dos beirais

Use `eaves: { left: 0.5, right: 0.5, pitch: 30 }` no telhado ou em `config.roofs` para reunir os avanços horizontais (metros) e o ângulo dos beirais (graus). Exemplo: `{ type: "gable", base: "main", orientation: "longitudinal", pitch: 51, eaves: { left: 0.8, right: 0.8, pitch: 30 } }`.

A quebra reta começa no limite da base, preservando o trecho principal, a cumeeira e `rake`. `left` e `right` correspondem aos dois lados da seção do telhado: `x0`/`x1` na orientação longitudinal (direita/esquerda na planta com a frente embaixo); frente/fundos na transversal (a mesma ordem do antigo array `eave`). Aceita ângulo de 0° a menos de 90°; sem `eaves.pitch`, o beiral segue `pitch`. Aplica-se também às duas extremidades de coberturas `shed`. O campo antigo `eave` continua aceito; os valores presentes em `eaves.left/right` têm prioridade sobre ele, e lados ausentes usam `eave` ou zero. A configuração representa geometria de estudo, sem validar a inclinação mínima do fabricante do shingle.

O controle **Camadas → Acima da camada 0** oculta a camada base da planta baixa e mantém visíveis todas as camadas de sobreposição superiores. **Todas** restaura a visualização completa; **Camada 0** mantém a opção de visualizar apenas a base.

### Perfil de cotas do terreno

`terrain.grading.profile` substitui a rampa padrão entre frente e fundos nas fachadas e na superfície 3D. Os dados cadastrais em `corners` permanecem preservados. Exemplo ilustrativo em JSON5:

```json5
grading: {
  profile: [
    { y: 0, z: 0 },
    { y: 3, z: -0.45 },
    { y: 18, z: -0.45 },
    { y: 23, z: -1.5 },
    { y: 45, z: -6 }
  ]
}
```

Use todos os pontos com `y` para um perfil longitudinal, ou todos com `x` para um perfil transversal. São metros no referencial local do terreno: origem no primeiro vértice de `boundary_order`, X ao longo da frente em direção ao segundo vértice e Y perpendicular à frente, positivo para dentro do lote. Esse referencial não muda com `coordinate_system` da casa, com `building.position` ou com o deslocamento visual da planta. Z usa a mesma referência vertical dos pisos e vértices cadastrais.

São necessários pelo menos dois pontos numéricos, com coordenadas estritamente crescentes. A interpolação é linear, cotas iguais formam patamares e a cota permanece constante antes/depois das extremidades. A superfície é constante no eixo perpendicular ao perfil. Não há suporte nesta versão a degraus verticais, expressões/referências ou perfis combinados em X e Y. Sem `grading`, permanece a interpolação anterior entre as cotas médias da frente e dos fundos. A perspectiva continua exibindo apenas o trecho de terreno ao redor da casa; a planta cadastral não é alterada pelo perfil.

Cada ponto aceita um `id` opcional, não vazio e único dentro do perfil, por exemplo `{ id: "tp-02-entrada", y: 3, z: -0.45 }`. O ID identifica o ponto para edição; ainda não funciona como referência em expressões geométricas. O arquivo `cottage-ferraz-cesar.json5` contém seis pontos longitudinais provisórios (`tp-01-rua` a `tp-06-fundos-terreno`), com patamar em −0,45 m e início da descida em Y = 12 m. A cota de estudo nos fundos do envelope térreo é −0,90 m em Y = 23,8 m. O perfil alcança −6 m em Y = 44,32 m e mantém essa cota até o restante da divisa oblíqua. As cotas intermediárias são hipóteses editáveis, não um projeto de terraplenagem.

A mureta periférica do estudo é a parede independente `perimeter-plinth`, com `scope: "ground"`, `base: "terrain"` e `top: "ground.z0"`. Seu caminho fechado acompanha o contorno do térreo, incluindo varanda, terraço e garagem, sem incluir a escada frontal. A espessura usa `params.wall_thickness`. A base é recortada pelo perfil do terreno nas fachadas e no 3D, inclusive nas mudanças de inclinação; a mureta permanece visível na seleção do térreo. Trata-se do fechamento geométrico entre terreno e piso, sem dimensionamento estrutural de fundação ou contenção.

### Avisos de depreciação

O quadro técnico apresenta **Avisos de depreciação**, separados dos erros. A planta continua carregando com a sintaxe antiga; cada aviso informa a substituição recomendada e, quando o arquivo é lido pelo parser JSON5, arquivo, linha, coluna e caminho da propriedade. Para configurações criadas diretamente em JavaScript, apresenta o caminho no objeto.

As regras atuais são `wall_max_height` → `ceiling_height`, `eave` → `eaves.left/right` e `top: { under: ... }` sem deslocamento → `top` com ID ou lista de IDs. `top: { level: ... }` gera aviso para usar a cota diretamente. `top.under` com deslocamento continua válido sem aviso. O campo `type` nas coleções de aberturas e os padrões antigos `config.openings.door/window/opening` agora geram avisos com a orientação de migração. Os aliases `front/rear` e os atalhos de geometria também continuam válidos.

A coleta fica centralizada em `FloorPlanModel.collectDeprecations`, antes da normalização e da aplicação de padrões. Novas regras devem indicar código estável, propriedade e orientação de migração, inspecionando apenas os contextos estruturais correspondentes. Os avisos originais são preservados nas recargas internas para não repetir ocorrências nem atribuir avisos a valores herdados dos padrões; não são incluídos no JSON exportado.

A leitura das coleções fica em `FloorPlanOpenings.visit/collect`: a mesma classificação é usada pela reflexão de coordenadas e pela validação. `forFloor` reúne declarações do piso e dos cômodos, qualificando referências locais e preservando as localizações do parser. `normalizeOpening` aplica os padrões por categoria e produz a geometria comum de recorte, mantendo `type` como categoria interna. `rendered` fornece as geometrias normalizadas a listas, fachadas, 3D e exportações. Vãos entre pisos continuam no fluxo próprio de aberturas verticais.

A migração foi comparada com a geometria anterior da planta principal e dos três exemplos: posições, dimensões, cotas, paredes associadas e diagnósticos foram preservados. Os testes de equivalência também comparam a declaração atual com a forma legada em todos os pavimentos. As exportações HTML e Markdown apresentam Portas, Janelas e Vãos; o DXF mantém as layers DOORS, WINDOWS e OPENINGS.

### Faixas automáticas de altura livre

As faixas são geradas automaticamente, inclusive em arquivos antigos, com regiões ≥ 1,30 m,
≥ 2,10 m e ≥ 3 m individualmente em seus cômodos. As áreas em m² aparecem
na lista de cômodos do pavimento selecionado. Não é necessário declarar
`zones` nem recuos por telhado para essas faixas. A propriedade também pode
ser definida em um cômodo ou pavimento: use `comfort_zones: false` para
desativar suas faixas individualmente.

O cálculo recorta as superfícies nas mesmas interseções usadas na cobertura
3D, incluindo águas, beirais e a opção `clip_intersections`. Uma cobertura
inferior preservada sob outra continua limitando a altura livre. A referência
é a face inferior dos telhados, cuja espessura cresce para cima; a altura é
medida a partir de `z0` do cômodo. Áreas fora da cobertura não são contadas.
As faixas são cumulativas e descontam as sobreposições declaradas, como a
área útil dos cômodos. Este cálculo considera coberturas, sem inferir forros,
lajes ou obstáculos internos.

### Lajes (`slabs`)

Cada piso pode declarar `slabs: [{ id: "slab-ground", label: "Laje — Térreo", thickness: 0.15 }]`.
A laje acompanha a união dos ambientes do piso, preservando recortes e excluindo ambientes compostos exclusivamente por lances ou patamares de escada. O topo fica em `floor.z0`, com a espessura desenvolvida para baixo. Sem `slabs`, é criada uma laje de 15 cm; `slabs: []` omite a laje. A lista na barra esquerda, junto às seleções de pisos e camadas, permite alternar cada laje independentemente e conserva a seleção ao trocar de piso durante a sessão. Esses controles afetam a perspectiva 3D.

Áreas locais de terreno plano podem ser definidas em `terrain.grading.flatAreas`, por exemplo `[{ reference: "front-stairs", margin: 0.15, transition: 0.5 }]`. O terreno acompanha o retângulo da referência na sua cota inferior, com margem e transição em metros; a posição acompanha a implantação da casa. Fora da transição, permanece o perfil longitudinal.

`top: "roofs"` considera o conjunto de telhados do projeto. O alias antigo `top: "roof"` continua aceito, com aviso de migração.

O topo pode ser uma cota absoluta (`top: 2.66`) ou uma expressão (`top: "upper-rear.z0 - 0.15"`). Uma string com apenas um ID, como `top: "stairs"`, continua selecionando a face inferior do objeto; `top: "roofs"` seleciona o conjunto de telhados. A forma antiga `top: { level: ... }` continua aceita com aviso de migração.

### Posição relativa de janelas

Use `dx` para o deslocamento ao longo da parede e `dz` para o peitoril em relação à cota do piso. Ambos aceitam expressões do interpretador geral:

```json5
windows: [{
  id: "janela-sala",
  from: "sala.front",
  dx: "sala.w / 2 - 0.75",
  dz: 0.9,
  w: 1.5,
  h: 1.2,
}]
```

`dx` mede a distância desde o início da parede, inclusive para paredes verticais (no sentido crescente de y). Sem deslocamento, a janela continua centralizada. `dz` é relativo ao piso, enquanto o campo antigo `z0` continua sendo absoluto; `dz` tem prioridade. `dy`, `position`, `x` e `y` continuam aceitos por compatibilidade, com prioridade para `dx`. Portas e vãos de parede compartilham essas regras.

### Tipo de janela e grade de vidros

Na coleção `windows`, `type` aceita `fixed` (fixa), `casement` (de abrir), `sliding` (de correr), `awning` (maxim-ar) e `tilt` (basculante). A fachada mostra a grade com linhas contínuas e o símbolo de abertura com linhas tracejadas; a janela fixa não tem símbolo de abertura. Os símbolos são esquemáticos e não definem lado de dobradiça ou quantidade de folhas.

`glazing: { columns: 2, rows: 3 }` divide a janela em seis panos de vidro. Cada valor aceita inteiros de 1 a 32; `1 × 1` representa vidro inteiro. Sem `glazing`, a janela usa `config.windows.glazing` ou, na ausência desse valor, quatro colunas e quatro linhas; sem `type`, usa `config.windows.type` ou é fixa. A lista de janelas informa o tipo e a grade. As subdivisões de vidro aparecem nas fachadas e como montantes sólidos na perspectiva 3D. Os símbolos de abertura aparecem somente nas fachadas; a planta baixa mantém sua representação simplificada.

```json5
{ id: "janela-sala", from: "sala.front", dx: 1.25, dz: 1.1,
  w: 0.7, h: 1.5, type: "casement", glazing: { columns: 1, rows: 3 } }
```

A grade representa subdivisões do vidro, não uma proteção metálica externa.


### Moldura de janela

`config.windows` define padrões de largura, altura, peitoril, tipo, grade e moldura para todas as janelas; valores informados em uma janela prevalecem. `framing` configura moldura e montantes em metros. Por padrão, a moldura externa tem 4 cm, os montantes 2,4 cm e a cor é `#454545`. Exemplo: `framing: { frame: 0.05, mullion: 0.025, color: "#454545" }`. A moldura aparece na fachada e na perspectiva 3D; a mesma cor e espessura são usadas nos montantes da grade.

Os modelos reutilizáveis ficam em [`lib/windows.json5`](lib/windows.json5). Use `model: "cottage-casement"` numa janela ou `config.windows.model` para escolher o padrão do projeto. Propriedades locais, como `w`, `type`, `glazing` e `framing`, sobrescrevem o modelo. O build valida e incorpora a biblioteca em `dist/index.html`, que não depende de uma requisição externa.

Os modelos reutilizáveis ficam em [`lib/windows.json5`](lib/windows.json5). Use `model: "cottage-casement"` numa janela ou `config.windows.model` para escolher um padrão do projeto. Propriedades da janela instalada, como `w`, `type`, `glazing` e `framing`, sobrescrevem o modelo. O build valida e incorpora a biblioteca em `dist/index.html`, sem requisição externa.

Janelas `sliding` aceitam `direction: "left"`, `"right"` ou `"up"`, indicando para onde a folha se move na vista da fachada. Nas duas folhas móveis frontais, a esquerda desliza para a esquerda e a direita para a direita; o modelo `cottage-sliding` usa `right` como padrão.

Com `pos` e `rotation`, a rotação é aplicada antes do posicionamento: `pos` indica o canto mínimo do retângulo envolvente do objeto rotacionado, sem incluir cadeiras ou acessórios. `size` mantém as dimensões locais. Por exemplo, `pos: [0.3, 0.3], size: [2.7, 1.1], rotation: 90` ocupa X de 0,30 a 1,40 m e Y de 0,30 a 3,00 m. As formas `x/y`, `rectangle` e `from/to` mantêm a convenção nominal.
