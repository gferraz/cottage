// Arithmetic is shared; each caller supplies only its allowed reference lookup.
const FloorPlanExpressions = {
  number(value) {
    if (typeof value === "number") return value;
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const result = Number(value);
    return Number.isFinite(result) ? result : undefined;
  },

  evaluate(expression, resolveReference) {
    const numeric = this.number(expression);
    if (numeric !== undefined && !Number.isFinite(numeric)) {
      throw new Error("A expressão precisa produzir uma medida numérica e finita");
    }
    if (numeric !== undefined && Number.isFinite(numeric)) return numeric;
    const tokens = [];
    const tokenPattern = /^\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][\w.-]*)|([()+\-*/]))/i;
    let source = String(expression).trim();
    while (source.length > 0) {
      const match = source.match(tokenPattern);
      if (!match) throw new Error(`Invalid geometric expression: ${expression}`);
      tokens.push(match[1] ?? match[2]);
      source = source.slice(match[0].length);
    }

    let index = 0;
    const primary = () => {
      const token = tokens[index++];
      if (token === "+") return primary();
      if (token === "-") return -primary();
      if (token === "(") {
        const result = addSubtract();
        if (tokens[index++] !== ")") throw new Error(`Invalid geometric expression: ${expression}`);
        return result;
      }
      if (!token || ["+", "-", "*", "/", ")"].includes(token)) {
        throw new Error(`Invalid geometric expression: ${expression}`);
      }
      const value = FloorPlanExpressions.number(token) ?? resolveReference(token);
      if (!Number.isFinite(value)) throw new Error(`Invalid geometric expression: ${expression}`);
      return value;
    };
    const multiplyDivide = () => {
      let result = primary();
      while (["*", "/"].includes(tokens[index])) {
        const operator = tokens[index++];
        const operand = primary();
        if (operator === "/" && operand === 0) throw new Error("Division by zero in geometric expression");
        result = operator === "*" ? result * operand : result / operand;
      }
      return result;
    };
    const addSubtract = () => {
      let result = multiplyDivide();
      while (["+", "-"].includes(tokens[index])) {
        const operator = tokens[index++];
        const operand = multiplyDivide();
        result += operator === "+" ? operand : -operand;
      }
      return result;
    };

    const result = addSubtract();
    if (index !== tokens.length || !Number.isFinite(result)) {
      throw new Error(`Invalid geometric expression: ${expression}`);
    }
    return result;
  },

  withLocation(error, location) {
    if (!error.location && location) {
      error.location = location;
      error.message = `${FloorPlanParser.formatLocation(location)}: ${error.message}`;
    }
    return error;
  },

  dependencies({ read, label, location, cycleMessage, invalidMessage }) {
    const values = new Map();
    const stack = new Set();
    const evaluate = (key) => {
      if (values.has(key)) return values.get(key);
      try {
        if (stack.has(key)) throw new Error(cycleMessage(label(key)));
        stack.add(key);
        const value = read(key, evaluate);
        if (!Number.isFinite(value)) throw new Error(invalidMessage(label(key)));
        values.set(key, value);
        return value;
      } catch (error) {
        throw this.withLocation(error, location(key));
      } finally {
        stack.delete(key);
      }
    };
    return evaluate;
  },
};

window.FloorPlanExpressions = FloorPlanExpressions;
