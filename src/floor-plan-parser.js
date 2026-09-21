const FloorPlanParser = {
  parse(sourceText) {
    const source = String(sourceText).replace(/^\uFEFF/, "");
    let index = 0;
    const fail = (message) => {
      throw new Error(`JSON5: ${message} at position ${index}`);
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
    const parseValue = () => {
      skipSpace();
      const character = source[index];
      if (character === "{") return parseObject();
      if (character === "[") return parseArray();
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
    const parseArray = () => {
      index += 1;
      const values = [];
      skipSpace();
      while (source[index] !== "]") {
        values.push(parseValue());
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
    const parseObject = () => {
      index += 1;
      const value = {};
      skipSpace();
      while (source[index] !== "}") {
        const key = source[index] === '"' || source[index] === "'"
          ? parseString(source[index])
          : parseIdentifier();
        skipSpace();
        if (source[index] !== ":") fail("expected ':'");
        index += 1;
        value[key] = parseValue();
        skipSpace();
        if (source[index] === ",") {
          index += 1;
          skipSpace();
          if (source[index] === "}") break;
        } else if (source[index] !== "}") fail("expected ',' or '}'");
      }
      if (source[index] !== "}") fail("unterminated object");
      index += 1;
      return value;
    };
    const result = parseValue();
    skipSpace();
    if (index !== source.length) fail("unexpected content");
    return result;
  },
};

window.FloorPlanParser = FloorPlanParser;
