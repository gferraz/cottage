# Plantas históricas com erros

Verificação em 12/11/2026, carregando os 16 arquivos `.json`/`.json5` de `archive/` na aplicação atual, em navegador, com cada pavimento ativo. Foram verificados os diagnósticos de carregamento/validação e as falhas de renderização reportadas pela aplicação. Não foi feita revisão visual individual de cada planta.

Os 15 arquivos abaixo foram movidos de `archive/` para `archive/broken/`, sem alteração de conteúdo. “Com erros” inclui carregamentos parciais com geometria ou referências inválidas; não significa necessariamente que o parser rejeitou o arquivo inteiro. Avisos de depreciação e colisões isoladas não motivaram a separação.

| Arquivo | Principais motivos |
| --- | --- |
| `cottage-ferraz-cesar-before-organization.json5` | Abertura aponta para o cômodo inexistente `playroom`. |
| `cottage-ferraz-cesar-espelhada.json` | Geometria de `hall-roof-base` não resolvida; `living` não se conecta a `vestibule.left`. |
| `cottage-ferraz-cesar-front-closet.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `cottage-ferraz-cesar-front-gable.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `cottage-ferraz-cesar-side-closet.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `cottage-ferraz-cesar-side-gable.json` | Nenhuma parede corresponde à abertura em `porch.top`. |
| `cottage-ferraz-cesar-transversal-gables.json5` | Abertura aponta para o cômodo inexistente `playroom`. |
| `cottage-ferraz-cesar-v260915.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `cottage-ferraz-cesar-x1-x0.json5` | Não é possível determinar o volume vertical de `stair-arrival`. |
| `cottage-front-lavaboy.json5` | Referência inexistente a `playroom`, aberturas sem parede e conexões inválidas entre cômodos; também há colisões. |
| `cottage-main-floor.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `planta-terrea-estudo.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `planta-terrea.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `quarto-na-frente.json` | Piso(s) sem `z0`/`ceiling_height` válidos; paredes sem volume vertical. |
| `segundo-pavimento.json` | Piso sem `z0`/`ceiling_height` válidos; paredes sem volume vertical e abertura com largura não positiva. |

O arquivo `archive/cottage-ferraz-cesar-front-gables.json5` permaneceu no local original: carregou sem erros em todos os pavimentos, com quatro avisos de depreciação. Os arquivos HTML e CSS históricos não fizeram parte desta verificação.
