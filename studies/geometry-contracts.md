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
5. Cálculo de `comfortAreas` ainda ocorre na renderização e pode ser pulado por configuração de exibição. Separar cálculo e desenho será uma entrega posterior.
6. Comunicações naturais atuais retornam largura agregada, sem os intervalos livres. Não bastam para recortar ou propagar uma zona.

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
