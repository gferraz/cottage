# Estudo do pavimento superior

Proposta geométrica para a planta `cottage-ferraz-cesar-front-gables.json5`.

## Quarto Oeste

- Duas camas twin de 0,97 × 1,91 m, com cabeceiras na parede direita.
- Distância entre camas: 0,59 m. Distância dos pés à linha da parede esquerda: 0,93 m (aproximadamente 0,87 m até sua face interna).
- Dois armários baixos de 0,80 × 0,60 × 1,20 m, nos cantos esquerdos, com proposta de portas de correr. Não são roupeiros de altura integral.
- A circulação aos pés fica parcialmente na faixa de menor altura da cobertura. O ajuste em planta não equivale à confirmação de conforto em pé em toda essa largura.
- Janela posterior de 1,20 × 1,20 m, peitoril a 0,90 m do piso superior. O topo fica na cota 5,10 m; a cobertura modelada sobre a abertura fica, no mínimo, na cota aproximada 5,84 m.

## Banheiro

Janela posterior de 0,80 × 0,60 m, com peitoril a 1,50 m do piso. Topo na cota 5,10 m e cobertura acima da abertura a partir de aproximadamente 5,85 m. A janela fica sob o frontão do telhado do escritório. A proposta pressupõe folha operável; o modelo cadastra o vão, sem mecanismo de abertura nem área efetivamente ventilante. A suficiência da iluminação e ventilação ainda depende desse detalhamento.

## Escada e desembarque

O lance superior termina na cota 3,00 m, em y = 9,40 m, entre x = 5,50 e 6,90 m. A sala de estar termina nessa mesma linha e oferece 1,40 m de largura na chegada. A proposta acrescenta um guarda-corpo de 1,10 m de altura na borda frontal restante do vão, sem cruzar a chegada. Fixação, corrimãos e componentes do guarda-corpo ainda precisam de detalhamento.

Amostragem geométrica da cobertura sobre toda a largura de cada trecho (sem espessuras de cobertura/estrutura e sem detalhamento dos degraus):

| Trecho | Menor altura até os planos de cobertura |
| --- | ---: |
| Lance inferior | 2,49 m |
| Patamar inferior | **2,00 m** |
| Lance intermediário | 3,73 m |
| Patamar superior | 4,33 m |
| Lance superior / chegada | 3,33 m |

O patamar inferior tem somente 2,00 m junto à borda externa. Esse valor não tem folga para espessuras ou acabamento. A escada continua pendente de validação em corte construtivo; este estudo não declara atendimento normativo. O desenho `stair-sections.svg` mostra cortes esquemáticos por trecho e o envelope mínimo de cobertura na largura.

O vão deixa uma faixa de apenas 0,10 m entre seu fundo e a parede posterior. Ela não foi considerada circulação; sua solução de fechamento junto à parede precisa ser detalhada. As paredes laterais do vão também exigem verificação das alturas efetivas, sobretudo na faixa baixa do telhado.

## Verificação

As janelas foram resolvidas contra `upper-rear-wall` e comparadas com os planos de cobertura. As quatro peças de mobiliário foram verificadas com rotação aplicada, sem sobreposição entre suas projeções nem saída do quarto. A planta foi inspecionada no navegador em viewport de aproximadamente 663 × 887 px; não houve erros de console. Há um aviso já existente da biblioteca 3D sobre o tipo de sombra.
