# Contratos geométricos — etapa preparatória

Este documento registra convenções existentes e o contrato pretendido para as próximas extrações. Não altera o formato dos projetos nem autoriza mudanças de medidas. Deve ser lido junto à [auditoria](geometry-architecture-audit.md).

## Conceitos e limites

| Conceito | Significado | Cuidados |
|---|---|---|
| Definição | Dados originais, parâmetros e referências do projeto | Não substituir fórmulas por resultados nem modificar a entrada durante a resolução. |
| Geometria nominal | Posição, dimensões, rotação e cotas resolvidas | A normalização mantém x/y/w/l quando há rotação; eles não são o envelope mundial do objeto girado. |
| Parte | Componente normalizado de um objeto | Preservar identidade, proprietário, pavimento, elevação e orientação quando existentes. |
| Envelope | Extremos que contêm todas as partes no referencial especificado | Pode incluir vazios; sua área e seu volume não equivalem à ocupação real. |
| Projeção 2D | Região de uma geometria projetada sobre um plano | Não contém, por si só, os dados necessários para colisão 3D. |
| Geometria física | Região ou volume efetivamente ocupado segundo o modelo declarado | Considerar rotação, espessura e recortes; não inventar estrutura ausente. |
| Região de acesso requerida | Espaço adicional derivado de um objeto e de uma regra | Preservar antes dos recortes para permitir identificar obstáculos. |
| Região disponível | Parte utilizável da região requerida após restrições | Manter as interferências que explicam os recortes. |

`bounds()` e `geometry()` não são intercambiáveis: objetos compostos rejeitam a geometria prismática exata. O contrato futuro de envelope físico rotacionado deve ter nome e referencial explícitos, sem reinterpretar silenciosamente os acessores nominais existentes.

## Coordenadas e resolução

- Usar metros e cotas Z absolutas no projeto normalizado.
- A adaptação `coordinate_system: "cartesian"` ocorre no carregamento; manter a distinção entre definição recebida e coordenadas internas.
- Posição sem Z herda a cota do pavimento de resolução; altura omitida vale zero na normalização nominal. Altura visual padrão do renderer não declara uma altura física.
- Referências usadas por itens a cômodos consideram os limites internos conforme a política existente de paredes. Cômodos, zonas e guias mantêm referências nominais. Não reduzir novamente um item que referencia outro item.
- Resolução em outro pavimento e resolução de itens devem devolver o contexto anterior após sucesso ou erro.
- Falhas não devem deixar referências em resolução, escopos de partes ou resultados parciais no cache que impeçam nova tentativa corrigida.
- O contexto explícito futuro deve carregar pavimento/cota, política de referências e escopo de partes. A introdução desse contexto deve preservar os wrappers públicos enquanto os consumidores forem migrados.

## Coberturas, paredes, lajes e escadas

- A superfície de referência atual da cobertura é a face inferior de contato. `solidSurface()` acrescenta espessura verticalmente para cima; não desloca a face inferior nem reduz a altura livre. Espessura perpendicular ao plano será uma mudança funcional distinta, se necessária.
- Coberturas intersectadas e coberturas inferiores retidas devem continuar respeitando os testes existentes. Superfície completa, região sem beiral para contato de paredes e projeção para desenho podem compartilhar a construção básica sem compartilhar necessariamente o mesmo recorte.
- Paredes são definidas por referência e espessura; limites internos para posicionamento de itens não equivalem a uma operação geral de área útil exata.
- Lajes existentes ocupam a faixa abaixo da cota do pavimento, conforme sua espessura. Não ajustar automaticamente a distância entre pavimentos.
- Lances preservam eixo, direção e sentido de subida. Com `risers` explícito, há `risers - 1` pisos no lance; o último espelho chega ao patamar.
- A face inferior atual dos lances é uma inclinação idealizada. Patamares são superfícies sem espessura no 3D atual. Estruturas adicionais exigem parâmetros declarados e testes próprios.

## Áreas e análises

Manter conceitos distintos: área nominal de partes, área da união de projeções, área líquida por sobreposições declaradas, área interna considerando paredes e área por faixa de altura livre.

A subtração atual por `overlaps` é uma política declarativa existente, não uma regra universal de obstáculos. Uma extração estrutural deve preservar essa política antes de acrescentar novas verificações.

O contrato de comunicações para circulação deverá incluir os segmentos livres com posição e pavimento; a soma de larguras permanece uma informação de apresentação. Aberturas separadas não formam automaticamente uma passagem contínua da mesma largura total.

Análises futuras devem receber dados de domínio e retornar resultados sem alterar elementos HTML, estilos ou controles. Seleção de piso e visibilidade não devem determinar a existência dos cálculos ou alertas. Isso é um objetivo da refatoração, ainda não uma propriedade geral do código atual.

## Limitações conhecidas — não consolidar como contrato desejado

1. **Resolvido na consolidação de partes:** `getRoomGeometry()` agora agrega cotas do envelope composto a partir das partes. Antes, seus acessores Z podiam devolver `undefined`/`NaN`. O envelope continua nominal e pode conter vazios; não equivale ao volume físico ocupado.
2. `geometryParts` de ambientes permanece como projeção de compatibilidade com x/y/w/l; outros consumidores acrescentam metadados de apresentação. As partes nominais completas agora estão em `normalizedParts`, conforme a entrega descrita abaixo; ainda não representam sólidos físicos recortados ou transformados.
3. `area()` de um composto soma áreas das partes; não garante união sem dupla contagem quando elas se sobrepõem. Não mudar esse significado durante uma extração sem identificar os consumidores.
4. Rotação normalizada não produz automaticamente polígono físico ou envelope rotacionado. `bounds()` não garante essa transformação.
5. **Resolvido na separação da altura livre:** os resultados são preparados para todos os ambientes antes da renderização. `comfort_zones` controla o desenho das faixas, e as tabelas consultam resultados independentes do pavimento selecionado.
6. **Intervalos preservados na extração de comunicações:** os resultados agora incluem os segmentos livres em XYZ, além da largura agregada. Continuam sendo comunicações nas fronteiras nominais; portas explícitas, obstáculos gerais e navegabilidade física exigem análises adicionais.

Essas limitações ficam documentadas em vez de receber testes que exijam perpetuar resultados inválidos. Cada correção futura deve adicionar uma expectativa válida e explicar qualquer diferença numérica intencional.

## Evidência e sequência

`test/geometry-contracts.test.js` acrescenta sete verificações sem DOM:

- Partes em cotas distintas, área ocupada versus envelope e acesso às referências locais/globais.
- Rotação nominal sem alteração da definição recebida.
- Restauração da cota do chamador após normalização bem-sucedida ou falha.
- Restauração da política e do cache após falha em referências de itens.
- Limpeza de recursão e nova tentativa após correção de uma parte inválida.
- Espessura vertical de cobertura, preservação da face inferior e da área por altura livre.
- Escada ativa: quatro partes, cotas intermediárias, conexões, eixo, pisos e espelhos, sem mutação da entrada.

Os testes existentes continuam cobrindo referências internas, interseções de coberturas, lajes, planos inferiores, mudanças de eixo e patamares. O novo arquivo complementa essa cobertura, sem substituí-la.

Próxima entrega: extrair operações puras de polígonos/sólidos e particionamento retangular, preservando as APIs e resultados atuais. Consolidar geometria de coberturas em seguida. Toda mudança de aplicação deverá executar `bin/build`, incluir o distribuível e verificar visualmente as saídas afetadas.

### Extração das operações compartilhadas concluída

`src/models/geometry-operations.js` concentra recorte por plano de polígonos e sólidos convexos, faces de caixa, área projetada XY, retângulos, subtração/união de polígonos convexos e particionamento da união de retângulos alinhados aos eixos. As funções antigas em telhados, paredes e altura livre delegam ao módulo. Áreas e lajes compartilham o particionamento; a seleção de ambientes e exclusão de escadas das lajes permanece no consumidor.

O módulo não acessa DOM, estado da planta ou renderizadores. Mantém a convenção de semiespaço `a*x + b*y + c*z + d <= 0` e as tolerâncias particulares dos algoritmos extraídos. Resultados podem reutilizar vértices da entrada: consumidores não devem modificá-los. Não há suporte novo a polígonos côncavos como cortadores ou sólidos não convexos.

Validação: 227 testes aprovados, incluindo quatro novos testes diretos de união sem dupla contagem, recorte com interpolação de Z, independência do sentido do cortador e fechamento/volume de sólido recortado. Build executado e módulo embutido verificado em `dist/floor-plan.html`. Planta ativa carregada na versão modular e no distribuível, com zero erros do projeto; conferidos pavimento superior e todos os pisos com telhados. Console sem erros JavaScript; observado aviso de compatibilidade do Three.js sobre `PCFSoftShadowMap`, fora do escopo desta extração. Inspeção visual no navegador integrado, viewport aproximado de 663 × 886 pixels, sem comparação automatizada de imagens.

Próxima entrega: consolidar a construção geométrica das coberturas para seus diferentes consumidores, sem modificar suas convenções físicas.

### Construção geométrica das coberturas consolidada

`src/models/roof-geometry.js` passa a conter resolução de bases/pavimentos, construção de coberturas de uma e duas águas, interseções, ajustes de inclinação dos beirais, sólido com espessura e arestas. O módulo não depende de DOM, Three.js ou `FloorPlanRoofs`. As funções públicas existentes em `src/views/roofs.js` permanecem como delegadoras.

`gableGeometry()` centraliza projeção nominal, cumeeira, elevações e planos das águas. Paredes, superfícies intersectadas, planta, fachadas, limites da cena 3D e métricas de exportação reutilizam essa construção. A validação de entrada continua nos consumidores existentes; o construtor não substitui a validação do projeto.

Regras preservadas explicitamente:

- `includeEaves: false` remove o avanço lateral das águas para contato das paredes, mantendo extensões de empena.
- `intersectionBounds` limita o recorte de outras coberturas ao corpo sem extensões de empena; os polígonos desenhados continuam incluindo essas extensões.
- Planos e limites nominais precedem a aplicação de `eaves.pitch`. Para consultar a superfície efetiva, usar os polígonos produzidos por `intersectingSurfaces()`, não os limites nominais do construtor.
- A exportação conserva sua cota herdada do topo declarado da base e a fórmula histórica de área quando `eaves.pitch` está ausente. A inferência de teto dos renderizadores não foi imposta à exportação. Eventuais correções dessas políticas serão mudanças funcionais separadas.
- Espessura vertical e face inferior de contato permanecem inalteradas.

Validação: 232 testes aprovados, incluindo cinco novos testes em `test/roof-geometry.test.js`, sem carregar o renderer de telhados. Os testes cobrem orientações, planos de contato, beirais assimétricos, segmentos da cumeeira, cotas herdadas e independência do DOM. Comparação antes/depois dos projetos principal e da garagem transversal confirmou preservação de superfícies intersectadas, limites de paredes e métricas de exportação com tolerância de 1e-9. As capturas numéricas usadas nessa comparação são temporárias, não fixtures versionadas.

Build executado e conteúdo do módulo confirmado no distribuível. Inspeção visual da versão modular e portátil no navegador integrado em viewport de 1280 × 720 pixels: carregamento com zero erros do projeto, seleção do pavimento superior e de todos os pisos, telhados, altura livre, perspectiva e elevações. Nenhum erro JavaScript registrado no console durante essas verificações.

Próxima entrega: centralizar as partes e os limites dos objetos normalizados, preservando suas cotas e reduzindo reconstruções nos renderizadores.

### Partes e limites dos ambientes consolidados

`FloorPlanGeometryDomain.normalizeRoomGeometry()` centraliza as partes nominais completas dos ambientes. Cada parte preserva sua geometria resolvida, rotação, classes e parâmetros de escada, com `id`, `ownerId` e `floorId`. O resultado é armazenado em `getRoomGeometry()` como:

- `normalizedParts`: partes completas; ambientes simples têm uma parte.
- `nominalGeometry`: geometria simples ou envelope agregado de um composto.
- `geometryParts`: projeção XY de compatibilidade, mantida com seu formato anterior.
- `partReferences`: acessores das partes dos compostos, mantidos para fórmulas existentes.

`FloorPlanGeometryBox.envelope()` calcula os extremos nominais XYZ; `fromGeometry()` concentra os acessores retangulares e permite entrada preguiçosa para referências adiantadas. A rotação permanece declarada na parte: o envelope não aplica transformação física.

Referências de ambientes, planta, fachadas e perspectiva passam a consumir as partes do cache de domínio. O 3D utiliza as mesmas partes para lances e patamares, sem nova normalização. Objetos temporários/derivados na planta usam o mesmo normalizador sem substituir a definição original no cache. As projeções com elementos HTML continuam separadas dos dados completos de domínio.

Correção funcional intencional: ambientes compostos agora devolvem `z0`, `z1` e `h` válidos, usando o mínimo e máximo das cotas das partes. Essa limitação estava registrada na auditoria. Os envoltórios compostos no DOM recebem essas mesmas cotas. A área continua sendo a soma das partes, e o pedido de geometria prismática exata de um composto continua sendo rejeitado. As alturas padrão usadas apenas para apresentação permanecem nos renderizadores.

Validação: 237 testes aprovados. Cinco novos testes verificam envelope com cotas distintas/negativas, referências preguiçosas, metadados completos e projeção XY preservada, reutilização do cache e ambiente simples com altura nominal zero. O teste existente de composto passou a exigir cotas agregadas válidas. A comparação numérica dos projetos principal e transversal preservou superfícies de cobertura, limites de paredes e métricas de exportação com tolerância de 1e-9; os metadados internos das bases foram excluídos dessa comparação porque o contrato ganhou os novos campos.

Build concluído e conteúdo dos módulos confirmado no distribuível. Verificação no navegador integrado em 1280 × 720 pixels: versões modular e portátil carregaram com zero erros do projeto; conferidos escada em planta, troca para o pavimento superior, todos os pisos, perspectiva e elevações, sem erros JavaScript no console. Não houve comparação automatizada de imagens.

Escopo desta entrega: ambientes simples/compostos e suas partes. Móveis continuam usando a normalização existente; a geração de acessórios e coleta de lajes ainda serão separadas de seus módulos visuais. Não foi introduzida uma API geral de volumes físicos nem cache incremental por edição.

Próxima entrega: explicitar o contexto da resolução geométrica, reduzindo as mudanças temporárias de pavimento e de política de referências sem alterar as fórmulas existentes.

### Contexto de resolução explícito introduzido

`FloorPlanGeometry.context()` e `inContext()` estabelecem um contexto com cota/pavimento, política de referências dos itens, cache de limites internos e escopos locais de partes. Os contextos têm propriedades imutáveis; os mapas de cache permanecem mutáveis durante a resolução. As fachadas de resolução compartilham os mapas do modelo e apontam diretamente para o mesmo proprietário, evitando cadeias de protótipos proporcionais à profundidade do cálculo.

Normalização por pavimento, normalização de itens, resolução de acessórios, resolução de ambientes, partes, validação de pavimentos inativos e preparação das listas globais passaram a usar contextos separados. Esses caminhos não atribuem temporariamente valores a `currentFloorHeight`, `itemReferenceContext` ou `itemRoomBoundsCache` do chamador, nem fazem push/pop na pilha de partes do chamador. Os nomes antigos ficam disponíveis como leituras de compatibilidade nas fachadas.

Limite da migração: referências preguiçosas antigas ainda guardam o resolvedor original em closures. `withReferenceContext()` transmite o contexto por um único ponteiro durante a leitura/chamada dessas referências, restaurando o descritor/valor anterior em `finally`. A ponte é estritamente síncrona e restrita a essa fronteira; não deve envolver renderização ou trabalho assíncrono. A remoção completa dessa ponte exige migrar as fábricas de referências para receber o contexto diretamente. Caches, detecção de recursão e mensagens existentes continuam compartilhados com o modelo.

As fachadas de contexto destinam-se somente à resolução. Não são cópias independentes do projeto e não devem ser usadas para executar `load()`, trocar preferências ou publicar estado de apresentação. O estado de piso da interface e os caminhos de projeção/renderização que ainda fazem alterações temporárias serão tratados nas entregas seguintes.

Validação: 243 testes aprovados. Seis novos testes verificam campos antigos protegidos contra escrita, pilha congelada, aninhamento de pavimentos com sucesso/falha, referências preguiçosas adiantadas a partes locais, restauração de descritor após erro em getter, falha de coleta em listas globais e fachadas sem cadeias de protótipos aninhadas. Comparação dos projetos principal e transversal preservou itens/acessórios, aberturas/janelas, partes normalizadas, coberturas, limites de paredes e métricas de exportação.

Uma cadeia profunda de fachadas foi detectada durante a verificação e corrigida nesta entrega. Uma execução local do diagnóstico dos dois projetos caiu de aproximadamente 0,8 s para 0,24 s depois de achatar essa cadeia; isso é uma observação pontual, não um benchmark de desempenho da aplicação.

Build concluído e conteúdo dos módulos confirmado no distribuível. Versões modular e portátil carregaram com zero erros do projeto. Após a correção da cadeia de fachadas, seleção do pavimento superior e de todos os pisos funcionou sem exceder o tempo de espera da automação; planta inspecionada no navegador integrado em 1280 × 720 pixels, sem erros JavaScript no console.

Próxima entrega: separar as análises de camadas/sobreposições, deduções, altura livre e comunicações de sua apresentação no DOM, em incrementos pequenos.

### Análise de camadas e sobreposições extraída

`src/models/overlap-analysis.js` contém `FloorPlanOverlapAnalysis.analyze({ rooms, items })`. A entrada usa dados simples: identidade, rótulo, pavimento, partes XY e listas de referências `overlapTargets`/`overlayTargets`. Não recebe elementos, estilos, visibilidade ou a instância da interface. O resultado contém mapa de camadas por chave, camadas dos ambientes por índice de entrada, camada máxima, índices dos ambientes em conflito e diagnósticos.

`FloorPlanLayers.updateOverlaps()` permanece como adaptador público: copia os dados relevantes dos elementos atuais, chama a análise e aplica os resultados às classes, estilos, controles e lista de erros. As partes entregues à análise não incluem referências a elementos HTML. A função retorna também o resultado, sem armazenar estado interno entre chamadas.

Regras anteriores preservadas:

- `overlays` constrói dependências de camadas; sozinho não autoriza uma interseção XY.
- `overlaps` de qualquer participante pode autorizar a sobreposição, tanto por ambiente inteiro quanto por parte. Uma lista explícita na parte substitui a lista herdada.
- Diagnósticos distinguem referências/ciclos (`overlap`) de interseções não permitidas (`collision`), com as mensagens anteriores.
- Vários pares de partes geram um único diagnóstico por par de ambientes, mantendo todos os participantes marcados.
- Ambientes identificados em pavimentos diferentes não colidem; contato de borda e sobreposições até a tolerância de 1e-9 são ignorados.
- Móveis participam do grafo de camadas, mas continuam fora da detecção de colisões XY entre ambientes. A extração não introduz uma verificação física 3D, rotação ou obstáculos nas futuras zonas.

Validação: 253 testes aprovados. Nove testes diretos cobrem o grafo, partes, móveis, permissões, deduplicação, pavimentos, tolerância, ciclos, referências ausentes, objetos sem ID, entrada congelada e independência entre chamadas. Um teste adicional analisa todos os pisos dos projetos principal e transversal diretamente das partes normalizadas, sem renderização, com zero erros e a camada esperada da escada.

Build concluído e novo módulo embutido confirmado em `dist/floor-plan.html`. No navegador integrado em 1280 × 720 pixels, versões modular e portátil carregaram com zero erros do projeto; verificados filtros “Acima da camada 0”, “Camada 0” e seleção de todos os pisos, sem erros JavaScript no console. A escada permanece visível isoladamente no filtro acima da camada base.

Limite desta entrega: o cálculo é executável sem DOM, mas o caminho atual da interface ainda o invoca a partir dos elementos renderizados. Preparação global de análises independente da vista será uma integração posterior; não foi acrescentada nesta extração. Deduções, altura livre e comunicações ainda precisam da mesma separação.

Próxima entrega: centralizar as deduções de área compartilhadas e separar o preparo da análise de altura livre do desenho das faixas.

### Deduções compartilhadas e altura livre separada do desenho

`src/models/room-area.js` centraliza a seleção de deduções declaradas por ambiente/parte e o cálculo de área líquida a partir de dados simples. O adaptador público `FloorPlanModel.calculateNetRoomArea()` preserva sua assinatura para referências/elementos existentes. Mantém a área bruta somada das partes e subtrai a união das interseções dos recortes, sem descontar duplicatas duas vezes.

O escopo de pavimento é explícito: altura livre usa `sameFloor: true`; o adaptador histórico da área líquida continua usando as coleções fornecidas pelo chamador, sem acrescentar um filtro de pavimento. Isso evita introduzir uma mudança silenciosa na semântica da área líquida durante a extração.

`src/models/headroom-analysis.js` contém o cálculo puro das áreas cumulativas por altura, região coberta e faixas disjuntas, incluindo as posições dos rótulos. Não consulta configuração de visibilidade, DOM ou instância da interface. `src/views/headroom.js` desenha esses resultados sem calcular interseções ou áreas; remove desenhos anteriores para permitir reaplicação sem duplicação.

`FloorPlanHeadroom.prepare()` coleta as partes normalizadas e os itens de todos os pavimentos, calcula as superfícies uma vez e grava `headroomResults`, antes do desenho da planta. O método público `calculate()` continua delegando ao cálculo puro, e `render()` delega à apresentação. As tabelas passam a consultar o mapa global de resultados. `comfortAreas` permanece disponível nos ambientes desenhados como compatibilidade.

Mudança funcional intencional: desabilitar `comfort_zones` deixa de impedir o cálculo. As tabelas também mostram resultados dos pisos que não estão selecionados. A visibilidade das faixas e da legenda continua obedecendo à configuração existente. Áreas nominais, dimensões, espessuras e regras de dedução não foram alteradas.

Validação: 261 testes aprovados. Oito testes adicionais cobrem seleção por ambiente/parte, substituição de permissões herdadas, escopo de pavimento, recortes sobrepostos, entradas congeladas, conservação da região coberta pelas faixas, preparo global e independência de visibilidade/piso selecionado. Uma comparação temporária reproduziu exatamente áreas líquidas, áreas por altura e polígonos cobertos de todos os ambientes dos projetos principal e transversal.

Build concluído e módulos embutidos confirmados no distribuível. As versões de cache dos scripts foram sincronizadas para impedir a mistura de módulos antigos com o novo contrato. No navegador integrado em 1280 × 720 pixels, as versões modular e portátil carregaram com zero erros do projeto e sem erros JavaScript. Uma prévia temporária com faixas ocultas mostrou zero SVGs de altura livre e 30 linhas de resultados iguais às da versão visível; os valores permaneceram iguais após a troca de pavimento. A prévia temporária foi removida após a verificação.

Limites mantidos: altura livre considera as coberturas modeladas e as deduções declaradas; ainda não é uma consulta geral a escadas, lajes e todos os sólidos superiores. A área líquida continua sendo a métrica declarativa existente, não uma área interna física universal. A normalização/preparação do projeto ainda é refeita quando a interface chama `load()`.

Próxima entrega: extrair a análise de comunicações naturais para dados de domínio e preservar os segmentos livres com posição, orientação e pavimento, além da largura agregada usada na lista.

### Comunicações naturais extraídas com segmentos livres

`src/models/communications.js` contém a análise de fronteiras e recortes por paredes independentes. `analyze(rooms, walls)` recebe somente dados: lados com estado, coordenada e intervalo, pavimento/cota dos ambientes e trajetos/espessuras/cotas das paredes. Não consulta listas, elementos ou seleção de vista. `fromReferences()` adapta os acessores existentes ao formato de dados, sem consultar o DOM; `prepare()` usa as referências globais do modelo antes de desenhar.

Cada comunicação mantém `id`, participantes, rótulos, orientação e `length` agregado. Acrescenta `floorId`, `z0`, coordenada da fronteira, lados de origem/destino e `segments`, com extremos `from`/`to` em XYZ e comprimento individual. Os segmentos percorrem o eixo tangente em ordem crescente; não descrevem um sentido de caminhada entre ambientes. Duas passagens de 1 m permanecem duas passagens, mesmo que a soma seja igual à de uma abertura contínua de 2 m.

O método antigo em `FloorPlanLists` delega ao domínio. A lista e a exportação Markdown consultam os resultados preparados e filtram o pavimento sem recalcular a geometria. `FloorPlan.findNaturalCommunications()` preserva a consulta sobre os ambientes da vista atual; `communicationResults` e `naturalCommunications` preparados contêm o conjunto global. A preparação não depende da existência de um destino HTML para a lista.

Regras mantidas: lados sólidos impedem comunicação natural; paredes independentes bloqueiam trechos alinhados quando alcançam o piso, respeitando escopo e meia espessura; paredes em cotas/pavimentos incompatíveis não bloqueiam o trecho. A análise preserva os critérios e tolerâncias existentes. Não foi adicionada nova interpretação de portas, janelas ou vãos verticais.

Validação: 269 testes aprovados. Sete testes diretos verificam segmentos horizontais/verticais em XYZ, passagens separadas, trajetos invertidos/duplicados, escopo e elevação de paredes, espessura, lados sólidos/virtuais, dados sem pavimento e entrada congelada. Um teste adicional prepara os projetos principal e transversal sem renderização e verifica independência da seleção de piso: 13 + 5 comunicações no principal e 14 + 8 no transversal.

Comparação temporária antes/depois preservou exatamente IDs, rótulos, ordem, orientações e comprimentos anteriores nos dois projetos. O preparo global reproduziu os resultados das consultas por piso, incluindo os novos segmentos. Build concluído e novo módulo embutido confirmado no distribuível. No navegador integrado em 1280 × 720 pixels, versões modular e portátil carregaram com zero erros do projeto e sem erros JavaScript; os mesmos 18 textos de comunicações do projeto principal permaneceram após selecionar o pavimento superior e todos os pisos.

Limites: a análise continua usando os lados do envelope nominal dos ambientes compostos. Não resolve sua fronteira côncava exata, paredes diagonais, obstáculos de mobiliário, largura física de ombreiras, altura livre ou acesso por portas explícitas. Os segmentos são uma base geométrica para análises futuras, não uma prova de circulação utilizável ou de conformidade.

Próxima entrega: separar a preparação do projeto da construção da vista, para reduzir recomputação e dependência da seleção de pavimento antes de introduzir as zonas automáticas.

### Preparação do projeto separada da construção da vista

`src/models/project.js` reúne a preparação de uma revisão: normalização da configuração, referências, geometria em cache, validação de elementos por pavimento, listas globais, altura livre, comunicações e coleta de lajes. `prepareProject(config)` executa essa sequência sem criar documento ou vista. Cada nova chamada invalida explicitamente a revisão anterior; não há detecção automática de edição em objetos já preparados.

`load(config, options)` continua sendo a entrada pública para carregar/recarregar um projeto e configurar seu viewport inicial. `renderView(options)` reconstrói somente a apresentação a partir da revisão preparada. `selectFloor(id)` passa a usar essa operação, sem chamar `load()`, reprocessar referências ou refazer altura livre/comunicações. A seleção corrente pertence à apresentação; `config.activeFloor` permanece uma indicação inicial da configuração.

O preparo guarda as referências de domínio antes que os renderizadores as substituam por elementos HTML. Antes de cada desenho, os mapas de referências/ambientes são restaurados, mantendo a identidade dos mapas e do cache geométrico. `clearView()` descarta os elementos e contadores da vista; `clear()` também invalida a preparação. Erros de preparo e de validação de pisos inativos são reutilizados, enquanto elementos visíveis continuam emitindo seus diagnósticos no caminho de renderização, evitando duplicação de mensagens.

A exportação HTML usa `captureFloorViews()` para desenhar e capturar cada piso com a mesma preparação. Um `finally` restaura pavimento, modo de todos os pisos, modo multi-pisos e filtro de camadas, inclusive se a captura falhar. Câmera, opções solares e viewport não são reinicializados pelas trocas de vista. A troca normal de pavimento mantém o reinício do filtro de camadas usado anteriormente, para evitar ocultar todo um piso sem camadas superiores.

Validação: 277 testes aprovados. Oito novos testes verificam preparação sem DOM, seleção sem recarga, restauração de referências sem reconstrução de cache, reutilização de diagnósticos, invalidação explícita por revisão, os dois projetos existentes e captura/restauração da exportação com sucesso e falha. Uma comparação temporária preservou itens, aberturas, partes, coberturas e métricas dos dois projetos.

Build concluído e módulos embutidos confirmados no distribuível. Uma prévia instrumentada em navegador integrado de 1280 × 720 pixels confirmou uma única preparação e uma única análise de altura após seleção do pavimento superior, todos os pisos e exportação HTML; as identidades dos dados preparados e os valores das tabelas permaneceram iguais. Nenhum erro do projeto ou JavaScript foi registrado. O HTML exportado foi inspecionado: contém duas plantas, perspectiva rasterizada e nenhum script. A prévia temporária foi removida.

Limites: a vista ainda recalcula suas camadas, áreas de apresentação e projeções e reconstrói terreno/fachadas. A preparação reutiliza coletores sem DOM que ainda residem em módulos de visualização, como `FloorPlanSlabs.collect()` e derivação de acessórios; suas localizações não foram alteradas nesta entrega. A ponte síncrona de referências preguiçosas permanece. O snapshot é interno à revisão corrente, não um formato serializável nem uma cópia independente para rollback.

Próxima entrega: estabelecer a infraestrutura de zonas derivadas e a conectividade das escadas, usando os dados normalizados e as análises agora separados da vista.

## Infraestrutura de zonas derivadas e contatos de escadas

`src/models/stair-connectivity.js` analisa partes nominais sem DOM, usando as cotas absolutas, eixo, direção e sentido já normalizados. Retorna nós com identidade de proprietário/parte, extremidades inferior e superior dos lances (segmentos XYZ de largura completa), pavimentos coincidentes com cada extremidade e arestas de contato. Contatos incluem lance/patamar, lances consecutivos e patamares adjacentes em nível. Sobreposição apenas em canto, contato lateral de lance e diferença de cota não estabelecem uma aresta. A identidade não depende da ordem das partes.

Essas arestas são candidatos geométricos, não uma certificação de circulação: ainda não verificam paredes, largura mínima, obstáculos, estrutura, altura livre ou sentido de acesso. Os segmentos representam os limites nominais dos lances, não a superfície física do primeiro/último piso. Não se inferem pavimentos intermediários por proximidade: só cotas coincidentes com tolerância de 1e-7 m. Rotação não nula, lance plano, geometria inválida e identidade duplicada produzem diagnósticos locais, sem bloquear projetos antigos. A escada externa plana dos estudos permanece carregável, mas não é tratada como lance vertical válido. Ainda não há resolução de contatos rotacionados ou sobreposições entre patamares.

`src/models/derived-zones.js` define uma coleção independente da vista: origem, regra, pavimento, categoria (`comfort`, `circulation`, `safety`), polígonos horizontais XYZ requeridos, região disponível e interferências. A região requerida é copiada e preservada. `available: null` significa análise de restrições pendente; não equivale a região vazia nem livre. A identidade usa origem/regra/pavimento; regras diferentes para extremidades ou componentes devem usar identificadores distintos. Duplicatas e polígonos sem área ou com cotas inconsistentes são rejeitados. A validação não é um motor geral de polígonos: os produtores deverão gerar polígonos simples.

A preparação do projeto calcula `stairConnectivity` uma vez por revisão e inicia `derivedZones` vazia. Nenhuma zona automática é gerada ou desenhada nesta entrega; as zonas manuais existentes mantêm seu caminho atual. As novas análises não dependem de piso selecionado ou preferência visual. A limpeza integral do projeto também limpa esses resultados.

Validação: 285 testes aprovados. Novos casos cobrem eixos e sentidos, cotas absolutas, contatos laterais/cantos/desníveis, escada em U com dois patamares, lances consecutivos, ordem das partes, diagnósticos, preservação da entrada e contrato das zonas. Os dois estudos atuais possuem quatro partes internas, três contatos e duas extremidades coincidentes com pavimentos. Build concluído e módulos conferidos no distribuível; navegador verificou o carregamento inicial sem erros de console. Não houve mudança visual nem comparação de imagens nesta entrega.

Próxima entrega: gerar as regiões requeridas de acesso inferior e superior com profundidade configurável de referência de 1,20 m, preservando sua origem e distinguindo restrições ainda não analisadas. Recortes e conflitos precisam considerar limites físicos antes de afirmar que uma região está disponível.

### Requisitos de abrangência e visibilidade definidos pelo usuário

- A geração deve descobrir todas as escadarias a partir de suas partes e conexões normalizadas, inclusive futuras escadarias, sem depender de IDs do estudo atual, posição fixa, número de lances ou pavimentos específicos. Geometrias ainda não suportadas devem produzir diagnóstico explícito em vez de uma zona presumida.
- As zonas automáticas de escadas devem aparecer somente quando o usuário selecionar **Camada 0** e a escadaria de origem estiver efetivamente oculta pelo filtro. Selecionar Camada 0 não basta se a própria escadaria pertencer à camada 0 e continuar visível. Com todas as camadas ou com a escadaria visível, essas zonas ficam ocultas. A implementação deverá consultar a camada efetiva da origem, incluindo suas partes, sem fixar toda escada na camada 1.
- Essa regra substitui a proposta inicial de um seletor independente para exibir zonas de escadas. Ela controla exclusivamente o desenho; geração e análise de conflitos permanecem ativas mesmo com as zonas ocultas. Não se aplica às zonas de móveis ou às faixas de altura livre existentes.
- A geração e a apresentação dessas zonas ainda estão pendentes. A infraestrutura entregue não desenha zonas automáticas.

## Geração e exibição inicial dos acessos de escadas

`src/models/stair-access.js` gera regiões requeridas para extremidades de lances coincidentes com pavimentos e sem contato com outra parte da escada. Usa a largura nominal inteira do lance e prolongamento externo de `stair_access_depth` metros (parâmetro na raiz do projeto, padrão 1.2; exige número finito positivo). Não depende dos IDs, posição ou quantidade de escadarias do estudo. As identidades incluem proprietário, parte, extremidade e pavimento. Alterações geométricas ou de profundidade são recalculadas na preparação de uma nova revisão.

A preparação também reutiliza `FloorPlanOverlapAnalysis` para obter as camadas das origens, incluindo escadas definidas em outro pavimento. Quando a origem está renderizada, prevalecem as camadas efetivas de suas partes. `src/views/stair-access.js` desenha as regiões requeridas nos pavimentos correspondentes, sem adicioná-las às referências editáveis, áreas de cômodos ou grafo de colisões nominais. O filtro mostra uma zona apenas em Camada 0 e quando todas as partes suportadas de sua escadaria estão em camadas superiores. Escadas na camada 0 mantêm as zonas ocultas. O piso de chegada mantém o seletor de camadas disponível mesmo quando a origem está em outro piso. Não foi criado seletor adicional.

As faixas têm contorno tracejado, hachura e rótulo “Acesso”, inclusive no CSS da exportação HTML. O título identifica a região como requerida, com restrições ainda pendentes. `available` continua nulo; ainda não há recorte por paredes, mobiliário ou altura livre nem alertas de conflitos dessas regiões. Não se declara largura útil física a partir da largura nominal. A geração atual não resolve acessos além de patamares terminais, contatos parciais, partes rotacionadas ou cotas de chegada sem pavimento declarado. Essas extensões devem preservar a descoberta genérica de escadas e vir acompanhadas de testes; não se pode presumir disponibilidade a partir do desenho atual.

Validação: 292 testes aprovados, incluindo geração independente de IDs, eixos/sentidos, múltiplas escadas, recálculo com profundidade e posição distintas, cotas, exclusão de conexões intermediárias, política de visibilidade e disponibilidade do seletor no piso de chegada. Os dois estudos existentes preparam dois acessos da escada interna, um por pavimento, além do acesso externo coincidente com o térreo (oculto porque sua origem permanece na camada 0). Build concluído e novos módulos/CSS incluídos no distribuível. No navegador integrado em 1280 × 720, conferidos térreo, dormitórios, todos os pisos e alternância Todas/Camada 0; acessos exibidos apenas no estado previsto, sem erros de console. Inspeção visual confirmou contorno, rótulo e orientação da anotação na planta rotacionada.

Próxima entrega: completar os acessos em patamares terminais e tratar as regiões requeridas com limites físicos e obstáculos, preservando os polígonos originais e a independência da visibilidade antes de introduzir alertas de circulação.

## Correção de escopo: altura livre sob escadas

O usuário esclareceu que “zonas das escadas” significa as mesmas faixas de altura livre usadas nos telhados, **não regiões de acesso antes/depois dos degraus**. Esta seção substitui a entrega anterior de acessos: geração de retângulos de 1,20 m, parâmetro `stair_access_depth`, módulos de acesso e rótulo “Acesso” foram removidos da aplicação. A infraestrutura genérica de zonas derivadas e contatos permanece disponível, sem gerar regiões de circulação.

`src/models/stair-headroom.js` prepara `stairHeadroomResults` para todas as escadarias suportadas e pavimentos abaixo de suas faces inferiores. Reutiliza `FloorPlanWalls.stairUndersidePlane()`, inclusive seu ajuste para espelhos explícitos, exatamente como o recorte do 3D. Patamares seguem a superfície horizontal de espessura zero já modelada. Não se inventa espessura estrutural. A análise reutiliza `FloorPlanHeadroomAnalysis` e considera a face limitante mais baixa em sobreposições, incluindo as coberturas existentes. Os resultados são preparados uma vez por revisão, independentemente da vista ou dos filtros.

`src/views/stair-headroom.js` desenha exclusivamente a projeção sob os lances e patamares. O desenho de polígonos foi consolidado em `FloorPlanHeadroomView.appendBands()`, compartilhado com os telhados. Cores e limites são os mesmos: abaixo de 1,30 m, 1,30–2,10 m, 2,10–3,00 m e a partir de 3,00 m; rótulos sob escadas: `1,3−`, `1,3+`, `2,1+`, `3+`. Faixas sem área não recebem rótulo. O seletor Camada 0 mostra essas projeções somente quando todas as partes suportadas da origem estão ocultas pelo filtro; Todas e Acima da camada 0 mantêm-nas ocultas. Não há faixas de acesso no pavimento superior apenas por ser o destino da escada.

O cálculo é genérico por proprietário, partes e cotas, sem IDs ou posições específicos do estudo. Continua limitado às partes ortogonais e à face inferior idealizada existente; rotação/estrutura não suportadas não recebem geometria inventada. A análise considera superfícies superiores, não circulação nem ocupação de móveis. Não redefine as áreas úteis declarativas ou as tabelas existentes de altura sob os telhados. Interferências de lajes intermediárias, estrutura física adicional e alertas de altura requerem etapas próprias. A espessura futura deverá alterar a face inferior de domínio compartilhada.

A exportação HTML mantém o filtro escolhido durante as capturas dos pavimentos, para preservar a opção de mostrar as faixas em Camada 0, e restaura o estado original. O CSS portátil inclui as projeções SVG e a tipografia dos rótulos.

Validação: 293 testes aprovados. Cobertura inclui as quatro faixas e sua partição, eixos/sentidos, espelhos explícitos, patamares, cotas absolutas, múltiplos proprietários, interseções de faces inferiores/coberturas, geometrias não suportadas, política de exibição, preservação das análises e apresentação compartilhada. Os dois estudos preparam faixas da escada interna no térreo. No estudo atual não há região 3+ sob a escada, pois sua face inferior não alcança 3 m sobre o térreo. Build concluído e módulos/CSS confirmados no distribuível. Navegador integrado em 1280 × 720: conferidos cores/rótulos na planta rotacionada, Camada 0, Todas, Acima da camada 0, todos os pisos e ausência de projeção sob essa escada no piso dos dormitórios; sem erros JavaScript.

## Regra final: acessos e altura livre coexistem

Esclarecimento posterior do usuário: **os acessos também são desejados**, como regiões distintas das faixas de altura livre. A remoção dos acessos descrita na seção anterior foi revertida. Esta é a regra vigente:

- Acessos de aproximação/saída: aparecem quando a escadaria de origem está renderizada e visível. A seleção Camada 0 não os oculta por si só: se a origem pertencer à camada 0 e continuar visível, seus acessos continuam visíveis.
- Altura livre sob a escada: mantém a regra Camada 0 com a origem oculta, usando 1,3−, 1,3+, 2,1+ e 3+.
- As duas análises são preparadas independentemente da exibição. Não há mudança nas faixas sob telhados.

Restaurados `src/models/stair-access.js`, `src/views/stair-access.js`, as regiões em `derivedZones` e o parâmetro raiz `stair_access_depth` (padrão 1.2 m). A geração continua genérica por partes/extremidades/pavimentos, sem IDs específicos. Os acessos são requeridos, com `available: null`; não foram recortados por paredes/obstáculos. Permanecem as limitações anteriormente registradas para patamares terminais, contatos parciais e rotações. A visualização exige uma origem presente na vista: não presume que uma escada definida em outro piso esteja desenhada no piso selecionado.

Validação: 296 testes aprovados, build e distribuível atualizados. Novos testes verificam geometria genérica dos acessos, profundidade, sentido, múltiplas origens, exclusão de extremidades conectadas e alternância entre acessos da origem visível e altura sob a origem oculta. No navegador em 1280 × 720, com Todas: escada interna e acesso visíveis, altura sob ela oculta; com Camada 0: acesso interno oculto e altura visível. O acesso externo continua visível porque a escada externa está na camada 0. Sem erros JavaScript; conferidos contorno e orientação do rótulo “Acesso”.
