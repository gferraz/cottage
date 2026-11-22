// Sequential stair definitions are compiled to the same rectangles as explicit stairs.
const FloorPlanStairPath = {
  isPath(stair) {
    return Boolean(stair?.parts?.some(part => part.direction !== undefined ||
      (part.to !== undefined && !Array.isArray(part.to)) || part.run !== undefined));
  },

  generate(plan, stair) {
    const epsilon = 1e-7;
    const localReferences = new Map();
    plan = FloorPlanGeometry.inContext(plan, {
      partScopes: [...FloorPlanGeometry.context(plan).partScopes, localReferences],
    });
    const vectors = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
    const fail = (part, message) => { throw new Error(`Escada ${stair.id}, parte ${part.id}: ${message}`); };
    const number = (value, part, name, positive = true) => {
      const result = plan.resolve(value);
      if (!Number.isFinite(result) || (positive && result <= 0)) fail(part, `${name} precisa ser um número ${positive ? 'positivo' : 'finito'}`);
      return result;
    };
    if (!Array.isArray(stair.pos) || stair.pos.length < 2 || stair.pos.length > 3) fail(stair, 'pos precisa ser [x, y] ou [x, y, z]');
    if (stair.rotation) fail(stair, 'o percurso aceita somente direções ortogonais, sem rotation');
    let p = stair.pos.slice(0, 2).map(value => number(value, stair, 'pos', false));
    let z = number(stair.pos[2] ?? plan.currentFloorHeight ?? 0, stair, 'cota inicial', false);
    const settings = ['width', 'riser', 'tread', 'type', 'steps', 'colors', 'walls'];
    const parts = stair.parts.map((part, index) => ({
      ...Object.fromEntries(settings.filter(key => stair[key] !== undefined).map(key => [key, stair[key]])),
      ...part, id: part.id ?? `${stair.id}-part-${index + 1}`,
    }));
    const widthOf = part => part.type === 'solid-flared' && part.to !== undefined
      ? Math.max(...(part.steps?.widths ?? []).map(value => number(value, part, 'largura')))
      : number(part.width ?? 1.2, part, 'width');
    const result = [];
    let incoming;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (['from', 'size', 'rectangle', 'pos', 'copy', 'orientation', 'rotation', 'x', 'y', 'w', 'l', 'z0', 'h', 'inset', 'outset', 'parts'].some(key => part[key] !== undefined)
        || Array.isArray(part.to)) fail(part, 'não misture percurso e coordenadas explícitas');
      const flight = part.to !== undefined;
      if (part.kind !== undefined && part.kind !== (flight ? 'flight' : 'landing')) fail(part, 'kind incompatível com to');
      const next = parts[index + 1];
      let direction = part.direction;
      if (!direction && !flight) {
        if (!incoming || !next || !vectors[next.direction]) fail(part, 'informe direction para o patamar');
        const nextVector = vectors[next.direction];
        if (incoming[0] * nextVector[0] + incoming[1] * nextVector[1] === -1) fail(part, 'informe direction do patamar entre lances opostos');
        direction = Object.keys(vectors).find(key => vectors[key] === incoming);
      }
      const d = vectors[direction];
      if (!d) fail(part, 'direction precisa ser +x, -x, +y ou -y');
      const width = widthOf(part);
      let endZ = z, run, risers;
      const solid = part.type === 'solid-flared' && flight;
      if (flight) {
        endZ = number(part.to, part, 'to', false);
        if (endZ <= z + epsilon) fail(part, 'to precisa estar acima da cota de partida');
        const riser = number(part.riser ?? 0.17, part, 'riser');
        const tread = number(part.tread ?? 0.28, part, 'tread');
        risers = solid ? part.steps?.widths?.length : part.risers ?? Math.max(2, Math.round((endZ - z) / riser));
        if (!Number.isInteger(risers) || risers < 2) fail(part, 'informe pelo menos dois espelhos');
        if (solid && part.risers !== undefined && part.risers !== risers) fail(part, 'risers precisa coincidir com steps.widths');
        run = number(part.run ?? (risers - (solid ? 0 : 1)) * tread, part, 'run');
      } else run = number(part.run ?? width, part, 'run');

      let x, y, w, l, exit;
      if (flight) {
        if (incoming && (d[0] !== incoming[0] || d[1] !== incoming[1])) fail(part, 'mudança de direção exige um patamar');
        exit = [p[0] + d[0] * run, p[1] + d[1] * run];
        x = Math.min(p[0], exit[0]) - (d[0] ? 0 : width / 2);
        y = Math.min(p[1], exit[1]) - (d[1] ? 0 : width / 2);
        w = d[0] ? run : width; l = d[1] ? run : width;
      } else {
        if (!incoming || !next || next.to === undefined || !vectors[next.direction]) fail(part, 'patamar precisa estar entre dois lances');
        const outgoing = vectors[next.direction];
        const nextWidth = widthOf(next);
        const previous = result.at(-1);
        const entryWidth = previous.type === 'solid-flared' ? previous.steps.widths.at(-1) : previous.pathWidth;
        const parallel = d[0] * incoming[0] + d[1] * incoming[1];
        if (parallel < 0) fail(part, 'direction do patamar não pode voltar sobre o lance de entrada');
        const depth = parallel ? run : width;
        const cross = parallel ? width : run;
        // Each interface must fit on its actual face. For a U turn both
        // flights meet the cross face; depth is independent of flight width.
        const outgoingAcross = outgoing[0] * incoming[0] + outgoing[1] * incoming[1] === 0;
        if (cross + epsilon < entryWidth || (outgoingAcross ? depth : cross) + epsilon < nextWidth) {
          fail(part, 'run ou width insuficiente para conectar os lances');
        }
        const transverse = [-incoming[1], incoming[0]];
        const sign = d[0] * transverse[0] + d[1] * transverse[1];
        const offset = parallel ? -cross / 2 : sign > 0 ? -entryWidth / 2 : entryWidth / 2 - cross;
        const a = [p[0] + transverse[0] * offset, p[1] + transverse[1] * offset];
        const b = [a[0] + incoming[0] * depth + transverse[0] * cross,
          a[1] + incoming[1] * depth + transverse[1] * cross];
        x = Math.min(a[0], b[0]); y = Math.min(a[1], b[1]);
        w = Math.abs(a[0] - b[0]); l = Math.abs(a[1] - b[1]);
        exit = [x + w / 2, y + l / 2];
        const axis = outgoing[0] ? 0 : 1;
        exit[axis] = axis === 0 ? (outgoing[0] > 0 ? x + w : x) : (outgoing[1] > 0 ? y + l : y);
        if (!parallel && outgoing[0] * incoming[0] + outgoing[1] * incoming[1] !== 0) {
          const crossCenter = offset + (sign > 0 ? cross - nextWidth / 2 : nextWidth / 2);
          exit[1 - axis] = p[1 - axis] + transverse[1 - axis] * crossCenter;
        }
        incoming = outgoing;
      }
      const geometry = { ...part, kind: flight ? 'flight' : 'landing',
        classes: [...new Set(String(part.classes ?? '').split(/\s+/).filter(value => value && !['stair-flight', 'stair-landing'].includes(value))), flight ? 'stair-flight' : 'stair-landing'].join(' '),
        x, y, w, l, z0: z, z1: endZ, h: endZ - z, pathWidth: width,
        ...(flight ? { risers, stairAxis: d[0] ? 'horizontal' : 'vertical', stairDirection: d[0] + d[1] > 0 ? 'forward' : 'reverse', stairRise: 'up' } : {}),
      };
      if (flight) FloorPlanGeometry.stairSteps(geometry);
      result.push(geometry);
      localReferences.set(part.id, FloorPlanGeometryBox.fromGeometry(geometry, { label: part.id }));
      localReferences.set(stair.id, { partReferences: localReferences });
      p = exit; z = endZ;
      if (flight) incoming = d;
    }
    this.validate(result, stair.id);
    return result;
  },

  validate(parts, ownerId) {
    const epsilon = 1e-7;
    const analysis = FloorPlanStairConnectivity.analyze(parts.map(part => ({ ...part, ownerId })), []);
    for (let index = 1; index < parts.length; index++) {
      const a = JSON.stringify([ownerId, parts[index - 1].id]), b = JSON.stringify([ownerId, parts[index].id]);
      const previous = analysis.nodes[index - 1], current = analysis.nodes[index];
      const end = previous.ends.find(end => end.role === 'upper');
      const start = current.ends.find(end => end.role === 'lower');
      const covered = (end, landing) => {
        const axis = end.axis;
        const min = axis === 'x' ? landing.x : landing.y;
        const max = min + (axis === 'x' ? landing.w : landing.l);
        return end.start[axis] >= min - epsilon && end.end[axis] <= max + epsilon;
      };
      const fullWidth = end && start
        ? end.axis === start.axis && Math.abs(end.start[end.axis] - start.start[start.axis]) <= epsilon
          && Math.abs(end.end[end.axis] - start.end[start.axis]) <= epsilon
        : end ? covered(end, parts[index]) : start ? covered(start, parts[index - 1]) : true;
      if (!fullWidth) throw new Error(`Escada ${ownerId}: conexão sem largura suficiente entre ${parts[index - 1].id} e ${parts[index].id}`);
      if (!analysis.edges.some(edge => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a))) {
        throw new Error(`Escada ${ownerId}: partes ${parts[index - 1].id} e ${parts[index].id} desconectadas`);
      }
    }
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.l, b.y + b.l) - Math.max(a.y, b.y);
      // Parts at distinct elevations may legitimately share their plan footprint.
      if (overlapX > epsilon && overlapY > epsilon && Math.min(a.z1, b.z1) >= Math.max(a.z0, b.z0) - epsilon) {
        throw new Error(`Escada ${ownerId}: interseção indevida entre ${a.id} e ${b.id}`);
      }
    }
  },
};
window.FloorPlanStairPath = FloorPlanStairPath;
