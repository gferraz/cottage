# Auditoria preparatória da arquitetura geométrica

Data: 17/11/2026. Escopo: leitura do código, rastreamento dos principais consumidores geométricos e execução de `node --test test/`. Resultado: 216 testes aprovados. Nenhum código de aplicação foi alterado; não houve validação visual ou medição de desempenho.

## Parecer

Recomenda-se uma refatoração preparatória antes das zonas automáticas e dos novos conflitos físicos. A base geométrica existente é aproveitável. O problema principal é a distribuição de responsabilidades e de representações dos mesmos objetos entre resolução de referências, DOM, listas, fachadas, exportadores e perspectiva 3D.

Não se recomenda uma reescrita, troca de framework, conversão imediata para ES Modules ou motor CAD genérico. As extrações devem preservar as fachadas públicas atuais e separar mudanças estruturais de mudanças de resultado geométrico.

## Achados prioritários

### 1. Objetos geométricos têm representações concorrentes

- `src/models/references.js:612`: `createRoomReference()` produz referências com `dataset` para consumidores que esperam uma interface semelhante ao DOM.
- `src/models/references.js:689`: `getRoomGeometry()` produz outra representação, com cache, acessores e referências de partes.
- `src/views/dom.js:62` e `:188`: `add()` e `addRoom()` criam acessores geométricos nos próprios elementos HTML e reconstroem partes e limites.
- `src/views/facades.js:22`: `render()` normaliza novamente os ambientes e constrói objetos próprios para a fachada.
- `src/views/3d/renderer.js:42`: `render()` volta a montar limites, alturas de apresentação e partes de escadas.

Há diferenças concretas entre essas representações: em `getRoomGeometry()`, os `geometryParts` retêm apenas x/y/w/l; os acessores Z do envoltório composto consultam campos ausentes da geometria agregada. O DOM também cria o envoltório composto com posição e tamanho apenas 2D. As fachadas recompõem explicitamente os extremos Z a partir das partes.

Consequência: não é seguro usar qualquer `geometryParts` ou `bounds()` existente como volume físico completo. Antes de unificar resultados, caracterizar valores ausentes, partes em cotas distintas e a distinção entre envelope, união e geometria exata.

Proposta: uma representação normalizada de domínio com identidade, pavimento, partes completas e limites derivados. Preservar os acessores atuais por adaptadores. Metadados de apresentação e elevação visual padrão não devem ser confundidos com volume físico declarado.

### 2. Resolução depende de contexto mutável compartilhado

- `src/models/geometry-domain.js:8` troca temporariamente `currentFloorHeight`.
- `src/models/geometry-domain.js:66` troca `itemReferenceContext` e `itemRoomBoundsCache`.
- `src/models/geometry.js:6` usa Proxy para alternar o contexto durante leituras e chamadas de referências.
- `src/models/references.js:644` usa `partReferenceStack`; `getRoomGeometry()` também troca o pavimento corrente.
- Fachadas, preparação das listas globais e renderer 3D repetem esse padrão.

Os blocos `try/finally` existentes são proteções importantes, mas a semântica depende da ordem das chamadas. `prepareGlobalLists()` restaura a altura no fim da iteração, sem `finally` abrangendo o corpo todo.

Proposta: introduzir contexto explícito de resolução — pavimento, cota, política de referências e escopo de partes — preservando wrappers existentes inicialmente. Testar resolução aninhada, falhas e restauração do estado. Preservar a política atual: referências de itens a cômodos usam limites internos; outras referências mantêm seu significado.

### 3. Regras de domínio executam junto com a apresentação

- `src/models/layers.js:6`: `updateOverlaps()` resolve o grafo de camadas, detecta ciclos e sobreposições, atualiza erros e altera classes, estilos e controles.
- `src/models/headroom.js:82`: `render()` escolhe ambientes, calcula deduções e áreas, grava `comfortAreas` no elemento e desenha SVG. Ambientes com visualização desabilitada são pulados antes do cálculo.
- `src/views/lists.js:576`: `findNaturalCommunications()` calcula conectividade espacial a partir de referências com `dataset`.
- `src/models/model.js:275`: cálculo líquido depende de `dataset`, acessores e listas de elementos.
- `src/models/openings.js` mistura coleta/normalização com criação de elementos e projeções.

Consequência: novas verificações herdariam dependência de elementos renderizados, piso selecionado e visibilidade.

Proposta: separar análise pura de camadas, deduções, altura livre e comunicações dos adaptadores DOM. Não substituir a semântica atual de sobreposições declaradas por uma nova política de colisões durante essa extração.

### 4. Geometria compartilhável está em módulos de visualização e exportação

- `src/views/roofs.js:141`, `:231`: interseções e construção do sólido de cobertura convivem com `render()`.
- `src/models/walls.js:222`, `:520`: recorte de sólidos e faces de caixas convivem com normalização de paredes e renderização em planta (`:713`).
- `src/views/3d/slabs.js:2`: coleta de lajes fica junto a lista e meshes.
- `src/views/elements.js`: geração e posicionamento de cadeiras, criados-mudos e recamiers ficam junto à criação dos elementos HTML.
- `src/exports/dxf.js:2`: `roofMetrics()` é usado também pela exportação Markdown.

Proposta: extrair operações puras de polígonos/sólidos, geometria de coberturas, coleta de lajes e derivação de itens. Manter funções delegadoras nos módulos antigos durante a transição. Evitar dependências do domínio para `FloorPlanElements`, `FloorPlanLists` ou exportadores.

### 5. Duplicações com potencial de divergência

- Limites de partes e acessores retangulares: referências, DOM, fachadas e 3D.
- Fórmulas de telhados de duas águas: `FloorPlanRoofs`, `FloorPlanWalls.roofLimits()`, `FloorPlanExport.roofMetrics()` e limites da cena 3D. Esses consumidores têm necessidades diferentes — por exemplo, contato da parede sem beiral versus superfície completa — e não devem receber uma única projeção indiscriminadamente.
- Particionamento retangular: `FloorPlanModel.calculateUnionArea()` e `FloorPlanSlabs.collect()` repetem a construção de células por cortes X/Y. Uma operação que retorne a união particionada pode atender a ambos.
- Seleção de deduções por `overlaps`: `calculateNetRoomArea()` e `FloorPlanHeadroom.render()`.
- Expressões: `FloorPlanCoordinates.expression()` gera árvore simbólica e `FloorPlanGeometry.resolveExpression()` avalia diretamente. Compartilham gramática; têm objetivos diferentes. Consolidar parser apenas depois das extrações prioritárias, preservando diagnósticos e regras de nomes.

Nem todo método repetido é duplicação relevante: os delegadores em `main.js` e `metrics.js` podem permanecer como compatibilidade. Não compensa removê-los antes de estabilizar os consumidores.

### 6. Comunicações perdem informação necessária para circulação

`findNaturalCommunications()` calcula `gaps` ao descontar paredes independentes, mas retorna somente a soma dos comprimentos, orientação e IDs. Não retorna intervalos livres, coordenada da passagem ou seus extremos. Duas aberturas separadas podem produzir a mesma largura total de uma única abertura.

Proposta: resultado geométrico contendo cada segmento livre e suas cotas/ambientes. A lista pode continuar mostrando o total. A travessia de zonas deve considerar segmentos efetivos, aberturas explícitas e diferenças de nível; a comunicação natural atual não resolve sozinha toda essa navegação.

### 7. Carregamento e troca de vista recompõem o sistema

`src/main.js:773` concentra normalização, registro, validação, geometria, desenho e listas. O seletor de pisos chama `load()` novamente. `renderPlanFloors()` troca temporariamente coleções e estado de piso; `prepareGlobalLists()` normaliza novamente itens e aberturas. A exportação HTML chama `load()` para capturar cada piso.

Proposta: distinguir preparação do projeto e construção de uma vista. Um resultado preparado por revisão do projeto deve alimentar planta, fachadas, listas e análises. Filtros de vista não devem decidir se uma verificação existe. Não introduzir cache incremental complexo inicialmente: reconstrução determinística por alteração de projeto é suficiente até haver evidência de desempenho.

## Convenções a documentar e preservar

- Metros e cotas absolutas Z; adaptação cartesiana acontece antes da resolução final.
- `bounds()` é envelope; não equivale à ocupação exata de objetos compostos ou rotacionados.
- `geometryParts` precisa distinguir projeção 2D de partes com elevação.
- Espessura atual do telhado é vertical e cresce acima da superfície de contato. Alterar para espessura normal é mudança funcional separada.
- Patamares 3D são planos; a face inferior dos lances é idealizada, sem espessura estrutural presumida.
- Área líquida por sobreposições declaradas, área interna considerando paredes e área com altura livre são métricas diferentes.
- `zones` declarativas, faixas de altura livre e futuras zonas de acesso têm contratos diferentes.
- Tolerâncias de distância, área, volume e apresentação não devem ser fundidas em uma constante única sem análise dimensional.

## Sequência recomendada antes das funcionalidades

1. **Contratos e caracterização:** partes completas, envelopes, rotações, cotas compostas, contexto de referências e resultados atuais da planta ativa. Registrar separadamente limitações atuais e resultados a preservar.
2. **Operações puras compartilhadas:** extrair polígonos/sólidos e particionamento retangular; consolidar construção de geometria de telhados mantendo opções específicas de seus consumidores.
3. **Dados normalizados e resolução:** centralizar partes/limites, explicitar contexto gradualmente e mover derivação de itens/lajes para o domínio. Preservar APIs existentes com adaptadores.
4. **Análises independentes do DOM:** camadas, deduções, altura livre e comunicações com segmentos. Apresentação passa a consumir resultados calculados previamente.
5. **Separar projeto e vista:** preparar dados/análises uma vez por alteração; aplicar seleção de piso e visibilidade na apresentação. Adaptar exportações sem perder a restauração do estado atual.

Depois disso, implementar conectividade das escadas, regiões de acesso e conflitos. Não é necessário modularizar toda a fachada SVG ou remover todos os globals antes de começar essas funcionalidades.

## Critérios de conclusão da preparação

- Análises de domínio executáveis em Node sem elementos HTML nem mocks de estilos/classes.
- Mesmas partes normalizadas alimentam escadas em planta, 3D e futuras zonas.
- Geometria de cobertura compartilhada por altura livre, paredes e consumidores visuais, respeitando seus recortes próprios.
- Resultado das análises independente do piso selecionado e de controles de visibilidade.
- Projeto ativo e exemplos carregam sem referências quebradas; alterações numéricas intencionais são identificadas separadamente da refatoração.
- Testes atuais e novos testes de contrato passam; cada mudança visual é verificada no navegador.
- Cada entrega que alterar HTML/CSS/JS executa `bin/build` e inclui `dist/floor-plan.html` verificado.

## Limites e itens adiáveis

A auditoria identifica riscos por leitura e testes existentes; não demonstra que toda divergência potencial já produz erro visível. Desempenho e vazamentos de recursos não foram perfilados. `downloadMarkdownLegacy()` permanece exposto pela fachada; verificar uso antes de removê-lo. Não priorizar remoção de código legado, divisão apenas por contagem de linhas, troca de sistema de módulos ou unificação geral dos parsers nesta preparação.
