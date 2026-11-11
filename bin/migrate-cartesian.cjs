const fs = require('node:fs');
const root = require('node:path').resolve(__dirname, '..');
globalThis.window=globalThis;
for(const file of ['config/parser','config/catalog','config/coordinates'])require(`${root}/src/${file}.js`);
const source=FloorPlanParser.parse(fs.readFileSync(`${root}/cottage-ferraz-cesar.json5`,'utf8'));
const converted=FloorPlanCoordinates.reflectX(source);
converted.coordinate_system='cartesian';
// Format as JSON5 with section comments and compact coordinate arrays. All
// expressions remain strings and all parameters retain their original values.
const sections={config:'Configuração',parameters:'Parâmetros preservados',terrain:'Terreno cadastral',building:'Implantação no terreno',zones:'Zonas de referência',floors:'Pavimentos e cômodos',walls:'Paredes independentes',roofs:'Telhados',guides:'Guias de desenho'};
const keyText = (key) => /^[\w$]+$/.test(key) ? key : JSON.stringify(key);
const inline = (value) => {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  return `{ ${Object.entries(value).map(([key, child]) => `${keyText(key)}: ${inline(child)}`).join(', ')} }`;
};
const format = (value, level = 0, prefix = 0, comma = false) => {
  const compact = inline(value);
  if (!value || typeof value !== 'object') return compact;
  const indent = '  '.repeat(level), next = indent + '  ';
  if (level > 0 && indent.length + prefix + compact.length + Number(comma) <= 120) return compact;
  if (Array.isArray(value)) {
    return `[\n${value.map((child, index) => next + format(child, level + 1, 0, index < value.length - 1)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  return `{\n${entries.map(([key, child], index) => {
    const name = keyText(key);
    const comment = level === 0 && sections[key] ? `${next}// ${sections[key]}\n` : '';
    return `${comment}${next}${name}: ${format(child, level + 1, name.length + 2, index < entries.length - 1)}`;
  }).join(',\n')}\n${indent}}`;
};
const {$schema,...rest}=converted;
const output={$schema,coordinate_system:'cartesian',...rest};
const header=`// Versão paramétrica cartesiana de cottage-ferraz-cesar.json5.\n// X cresce da esquerda para a direita; Y cresce da frente aos fundos (baixo para cima).\n// X = 0 na lateral direita do corpo principal; a geometria à esquerda usa X negativo.\n// Fórmulas, parâmetros e IDs são preservados; o original não é substituído.\n// walls e openings: left = x0; right = x1. top/bottom continuam frente/fundos.\n// Beirais longitudinais: left/right = x0/x1; transversais: frente/fundos.\n// from/to preservam o sentido dos lances de escada; não precisam estar em ordem crescente.\n// Terreno cadastral e building permanecem no referencial de implantação.\n\n`;
if (require.main === module) {
  fs.writeFileSync(`${root}/cottage-ferraz-cesar-cartesiana-parametrica.json5`, header + format(output) + '\n');
}
module.exports = { format };
