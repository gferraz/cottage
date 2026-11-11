const FloorPlanCoordinates = {
  // Small arithmetic trees keep references and parameters symbolic during an
  // axis change. No user expression is evaluated as JavaScript.
  expression(value) {
    if (typeof value === "number") return value;
    const tokens = String(value).match(/[A-Za-z_][\w.-]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?|[()+*/-]/gi) ?? [];
    if (tokens.join("") !== String(value).replace(/\s/g, "")) throw new Error(`Expressão geométrica inválida: ${value}`);
    let index = 0;
    const primary = () => {
      const token = tokens[index++];
      if (token === "-") return this.negate(primary());
      if (token === "+") return primary();
      if (token === "(") {
        const node = sum();
        if (tokens[index++] !== ")") throw new Error(`Expressão geométrica inválida: ${value}`);
        return node;
      }
      if (!token || [")", "*", "/"].includes(token)) throw new Error(`Expressão geométrica inválida: ${value}`);
      return Number.isFinite(Number(token)) ? Number(token) : token;
    };
    const product = () => {
      let node = primary();
      while (["*", "/"].includes(tokens[index])) node = this.operation(tokens[index++], node, primary());
      return node;
    };
    const sum = () => {
      let node = product();
      while (["+", "-"].includes(tokens[index])) node = this.operation(tokens[index++], node, product());
      return node;
    };
    const result = sum();
    if (index !== tokens.length) throw new Error(`Expressão geométrica inválida: ${value}`);
    return result;
  },

  negate(node) {
    if (typeof node === "number") return -node || 0;
    if (node?.op === "neg") return node.a;
    if (node?.op === "+") return this.operation("+", this.negate(node.a), this.negate(node.b));
    if (node?.op === "-") return this.operation("+", this.negate(node.a), node.b);
    return { op: "neg", a: node };
  },

  operation(op, a, b) {
    if (typeof a === "number" && typeof b === "number") {
      if (op === "/" && b === 0) throw new Error("Divisão por zero na transformação dos eixos");
      return Number(({ "+": () => a + b, "-": () => a - b, "*": () => a * b, "/": () => a / b }[op]()).toPrecision(15));
    }
    if (op === "+" || op === "-") {
      const terms = new Map();
      let constant = 0;
      const collect = (node, sign) => {
        if (typeof node === "number") constant += sign * node;
        else if (node?.op === "neg") collect(node.a, -sign);
        else if (node?.op === "+" || node?.op === "-") {
          collect(node.a, sign);
          collect(node.b, node.op === "-" ? -sign : sign);
        } else {
          const key = this.format(node);
          const term = terms.get(key) ?? { node, count: 0 };
          term.count += sign;
          terms.set(key, term);
        }
      };
      collect(a, 1);
      collect(b, op === "-" ? -1 : 1);
      let result = null;
      for (const { node, count } of terms.values()) {
        if (!count) continue;
        const term = Math.abs(count) === 1 ? node : { op: "*", a: Math.abs(count), b: node };
        result = result === null ? (count < 0 ? this.negate(term) : term)
          : { op: count < 0 ? "-" : "+", a: result, b: term };
      }
      constant = Number(constant.toPrecision(15));
      if (result === null) return constant;
      return constant === 0 ? result : { op: constant < 0 ? "-" : "+", a: result, b: Math.abs(constant) };
    }
    if (op === "*" && (a === 0 || b === 0)) return 0;
    if ((op === "*" || op === "/") && b === 1) return a;
    return { op, a, b };
  },

  map(node, replace) {
    if (typeof node === "string") return replace(node);
    if (typeof node === "number") return node;
    if (node.op === "neg") return this.negate(this.map(node.a, replace));
    return this.operation(node.op, this.map(node.a, replace), this.map(node.b, replace));
  },

  format(node, parent = 0) {
    if (typeof node !== "object") return String(node);
    const precedence = node.op === "neg" ? 3 : ["*", "/"].includes(node.op) ? 2 : 1;
    const text = node.op === "neg" ? `-${this.format(node.a, precedence)}`
      : `${this.format(node.a, precedence)} ${node.op} ${this.format(node.b, precedence + (node.op === "-" || node.op === "/" ? 1 : 0))}`;
    return precedence < parent ? `(${text})` : text;
  },

  scalar(value) {
    if (typeof value !== "string" || !/(?:\.(?:x0|x1|xc|x)\b|\bx0\b)/.test(value)) return value;
    const node = this.map(this.expression(value), (name) => {
      if (name === "x0") return this.negate(name);
      const match = name.match(/^(?!params\.)(.+)\.(x0|x1|xc|x)$/);
      if (!match) return name;
      const axis = { x0: "x1", x1: "x0", x: "x1", xc: "xc" }[match[2]];
      return this.negate(`${match[1]}.${axis}`);
    });
    return typeof node === "number" ? node : this.format(node);
  },

  arithmetic(op, a, b) {
    const result = this.operation(op, this.expression(a), this.expression(b));
    return typeof result === "number" ? result : this.format(result);
  },

  negative(value) {
    const result = this.negate(this.expression(value));
    return typeof result === "number" ? result : this.format(result);
  },

  reflectX(config, catalog = window.FloorPlanCatalog) {
    const preserved = new Set(["terrain", "building", "parameters", "id", "label", "title", "summary", "$schema", "classes", "color"]);
    const visit = (value, key) => {
      if (preserved.has(key)) return structuredClone(value);
      if (!value || typeof value !== "object") return this.scalar(value);
      const result = Array.isArray(value) ? value.map((child) => visit(child))
        : Object.fromEntries(Object.entries(value).map(([name, child]) => [name, visit(child, name)]));
      return window.FloorPlanParser?.copyLocation(value, result) ?? result;
    };
    const result = visit(config);
    const side = (value) => value === "left" ? "right" : value === "right" ? "left" : value;
    const point = (values) => [this.negative(values[0]), ...values.slice(1)];
    const houseWalls = config.config?.room_wall_sides === "house";
    if (houseWalls) delete result.config.room_wall_sides;
    if (result.viewport?.origin) result.viewport.origin[0] = this.arithmetic("-", this.negative(result.viewport.origin[0]), result.viewport.size[0]);
    const widthOf = (entry) => entry.size?.[0] ?? entry.w ?? catalog?.items?.[entry.type]?.size?.[0];
    const opening = (entry, owner) => {
      const match = typeof entry.from === "string" && entry.from.match(/^(.*\.)(left|right|top|bottom)$/);
      const wall = match?.[2] ?? entry.from;
      const positionKey = ["dx", "position", "x"].find((key) => entry[key] !== undefined);
      if (["top", "bottom"].includes(wall) && positionKey) {
        const roomId = match ? match[1].slice(0, -1) : owner;
        const width = entry.w ?? entry.length ?? result.config?.openings?.[entry.type ?? "door"]?.w ?? catalog?.openings?.[entry.type ?? "door"]?.w;
        if (!roomId || width === undefined) throw new Error("A transformação da abertura precisa do cômodo e da largura");
        entry[positionKey] = this.arithmetic("-", this.arithmetic("-", `${roomId}.w`, entry[positionKey]), width);
      }
      if (typeof entry.from === "string") entry.from = (match?.[1] ?? "") + side(wall);
      if (entry.rectangle || entry.pos) geometry(entry);
    };
    const geometry = (entry) => {
      if (entry.rectangle) {
        const [a, y, b, y1] = entry.rectangle;
        // x0 in a rectangle's far endpoint refers to its first point. Expand
        // it before exchanging the endpoints, so local offsets retain meaning.
        const expand = (value) => {
          if (typeof value !== "string") return value;
          return this.format(this.map(this.expression(value), (name) => name === "x0" ? this.expression(this.negative(a)) : name));
        };
        entry.rectangle = [this.negative(expand(b)), y, this.negative(a), expand(y1)];
      }
      if (entry.pos) {
        const width = widthOf(entry) ?? 0;
        entry.pos = point(entry.pos);
        entry.pos[0] = this.arithmetic("-", entry.pos[0], width);
      }
      if (Array.isArray(entry.from)) entry.from = point(entry.from);
      if (Array.isArray(entry.to)) entry.to = point(entry.to);
      if (entry.path?.points) entry.path.points = entry.path.points.map(point);
      if (entry.rotation !== undefined) {
        entry.rotation = typeof entry.rotation === "number" ? ((360 - entry.rotation) % 360 + 360) % 360 : this.negative(entry.rotation);
      }
      if (!houseWalls && Array.isArray(entry.walls)) entry.walls = entry.walls.map(side);
      else if (!houseWalls && entry.walls && typeof entry.walls === "object") {
        entry.walls = Object.fromEntries(Object.entries(entry.walls).map(([key, value]) => [side(key), value]));
      }
      for (const key of ["inset", "outset"]) if (entry[key]?.length === 5) [entry[key][1], entry[key][3]] = [entry[key][3], entry[key][1]];
      entry.parts?.forEach(geometry);
      entry.openings?.forEach((item) => opening(item, entry.id));
    };
    const roofDefaults = result.config?.roofs ?? {};
    const roof = (entry) => {
      // Defaults shared by longitudinal and transverse roofs cannot share a
      // single reflected side order. Keep their formulas on each roof instead.
      for (const key of ["eave", "rake", "slope"]) if (entry[key] === undefined && roofDefaults[key] !== undefined) entry[key] = structuredClone(roofDefaults[key]);
      if (roofDefaults.eaves || entry.eaves) {
        const legacy = entry.eave === undefined ? {} : { left: Array.isArray(entry.eave) ? entry.eave[0] : entry.eave, right: Array.isArray(entry.eave) ? entry.eave[1] : entry.eave };
        entry.eaves = { ...roofDefaults.eaves, ...legacy, ...entry.eaves };
      }
      if ((entry.type ?? roofDefaults.type) === "shed" && entry.orientation === "longitudinal" && entry.slope === undefined) entry.slope = "right";
      geometry(entry);
      if (entry.base && typeof entry.base === "object") geometry(entry.base);
      if (entry.orientation === "longitudinal") {
        if (entry.eaves) [entry.eaves.left, entry.eaves.right] = [entry.eaves.right, entry.eaves.left];
        if (Array.isArray(entry.eave)) entry.eave.reverse();
        if (entry.slope) entry.slope = side(entry.slope);
      } else if (Array.isArray(entry.rake)) entry.rake.reverse();
    };
    const floor = (entry) => {
      entry.rooms?.forEach(geometry);
      entry.items?.forEach(geometry);
      entry.zones?.forEach(geometry);
      entry.guides?.forEach(geometry);
      entry.walls?.forEach(geometry);
      entry.roofs?.forEach(roof);
      entry.openings?.forEach((item) => opening(item));
      entry.windows?.forEach((item) => opening(item));
    };
    floor(result);
    result.floors?.forEach(floor);
    for (const key of ["eaves", "eave", "rake", "slope"]) delete roofDefaults[key];
    return result;
  },
};

window.FloorPlanCoordinates = FloorPlanCoordinates;
