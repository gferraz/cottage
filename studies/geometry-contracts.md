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

1. `getRoomGeometry()` mantém x/y/w/l no envelope composto, mas não agrega sua elevação; seus acessores Z podem devolver `undefined`/`NaN`. As referências individuais das partes preservam cotas válidas. Não usar o Z desse envelope como volume físico.
2. `geometryParts` de ambientes é frequentemente uma projeção com apenas x/y/w/l; outros consumidores acrescentam metadados diferentes. Ainda não existe um contrato único de partes físicas completas.
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
