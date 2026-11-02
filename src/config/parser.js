const FloorPlanParser = {
  locations: new WeakMap(),
  propertyLocations: new WeakMap(),

  location(value, property) {
    if (!value || typeof value !== "object") return;
    return property === undefined ? this.locations.get(value) : this.propertyLocations.get(value)?.get(property);
  },

  copyLocation(source, target) {
    const location = this.location(source);
    if (location) this.locations.set(target, location);
    const properties = this.propertyLocations.get(source);
    if (properties) this.propertyLocations.set(target, properties);
    return target;
  },

  errorLocation(error, config) {
    const direct = this.location(error.opening);
    if (direct) return direct;
    const seen = new Set();
    const find = (value) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (error.id && value.id === error.id) return this.location(value);
      for (const child of Object.values(value)) {
        const found = find(child);
        if (found) return found;
      }
    };
    return find(config);
  },

  formatLocation(location) {
    return `${location.file || "JSON5"}:${location.line}:${location.column} · ${location.path || "$"}`;
  },

  parse(sourceText, { filename = "" } = {}) {
    const source = String(sourceText).replace(/^\uFEFF/, "");
    let index = 0;
    let activePath = "";
    const locationAt = (offset, path) => {
      const lines = source.slice(0, offset).split("\n");
      return { file: filename, line: lines.length, column: lines.at(-1).length + 1, path };
    };
    const fail = (message) => {
      const location = locationAt(index, activePath);
      const error = new Error(`${this.formatLocation(location)}: ${message}`);
      error.location = location;
      throw error;
    };
    const skipSpace = () => {
      while (index < source.length) {
        if (/\s/.test(source[index])) index += 1;
        else if (source.startsWith("//", index)) {
          index = source.indexOf("\n", index + 2);
          if (index < 0) index = source.length;
        } else if (source.startsWith("/*", index)) {
          const end = source.indexOf("*/", index + 2);
          if (end < 0) fail("unterminated comment");
          index = end + 2;
        } else break;
      }
    };
    const parseString = (quote) => {
      index += 1;
      let value = "";
      while (index < source.length) {
        const character = source[index++];
        if (character === quote) return value;
        if (character !== "\\") {
          value += character;
          continue;
        }
        if (index >= source.length) fail("unterminated string");
        const escaped = source[index++];
        const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" };
        if (escapes[escaped] !== undefined) value += escapes[escaped];
        else if (escaped === "u") {
          value += String.fromCharCode(Number.parseInt(source.slice(index, index + 4), 16));
          index += 4;
        } else value += escaped;
      }
      fail("unterminated string");
    };
    const parseIdentifier = () => {
      const match = source.slice(index).match(/^[A-Za-z_$][\w$-]*/);
      if (!match) fail("expected a property name");
      index += match[0].length;
      return match[0];
    };
    const parseValue = (path = "") => {
      skipSpace();
      activePath = path;
      const character = source[index];
      if (character === "{" || character === "[") {
        const location = locationAt(index, path);
        const value = character === "{" ? parseObject(path) : parseArray(path);
        this.locations.set(value, location);
        return value;
      }
      if (character === '"' || character === "'") return parseString(character);
      const token = source.slice(index).match(/^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|true|false|null|NaN|Infinity)/)?.[0];
      if (!token) fail("expected a value");
      index += token.length;
      if (token === "true") return true;
      if (token === "false") return false;
      if (token === "null") return null;
      if (token === "NaN") return Number.NaN;
      if (token === "Infinity") return Number.POSITIVE_INFINITY;
      return Number(token);
    };
    const parseArray = (path) => {
      index += 1;
      const values = [];
      skipSpace();
      while (source[index] !== "]") {
        values.push(parseValue(`${path}[${values.length}]`));
        skipSpace();
        if (source[index] === ",") {
          index += 1;
          skipSpace();
          if (source[index] === "]") break;
        } else if (source[index] !== "]") fail("expected ',' or ']'");
      }
      if (source[index] !== "]") fail("unterminated array");
      index += 1;
      return values;
    };
    const parseObject = (path) => {
      index += 1;
      const value = {};
      const properties = new Map();
      skipSpace();
      while (source[index] !== "}") {
        const propertyStart = index;
        const key = source[index] === '"' || source[index] === "'"
          ? parseString(source[index])
          : parseIdentifier();
        skipSpace();
        if (source[index] !== ":") fail("expected ':'");
        index += 1;
        activePath = path ? `${path}.${key}` : key;
        properties.set(key, locationAt(propertyStart, activePath));
        value[key] = parseValue(activePath);
        skipSpace();
        if (source[index] === ",") {
          index += 1;
          skipSpace();
          if (source[index] === "}") break;
        } else if (source[index] !== "}") fail("expected ',' or '}'");
      }
      if (source[index] !== "}") fail("unterminated object");
      index += 1;
      this.propertyLocations.set(value, properties);
      return value;
    };
    const result = parseValue();
    skipSpace();
    if (index !== source.length) fail("unexpected content");
    return result;
  },
};

window.FloorPlanParser = FloorPlanParser;
