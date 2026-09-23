/**
 * Shared rectangular-geometry contract for normalized application objects.
 * A bounding box is always available; exact rectangular geometry is only
 * available for objects that are actually one rectangle.
 */
const FloorPlanGeometryBox = {
  attach(target, { compound = false, label = "object" } = {}) {
    const value = (name, fallback) => {
      if (typeof target[name] === "function") return target[name]();
      if (target[name] !== undefined) return Number(target[name]);
      return fallback;
    };

    if (typeof target.x0 !== "function" && target.x !== undefined)
      target.x0 = () => Number(target.x);
    if (typeof target.x1 !== "function" && target.x !== undefined && target.w !== undefined)
      target.x1 = () => Number(target.x) + Number(target.w);
    if (typeof target.y0 !== "function" && target.y !== undefined)
      target.y0 = () => Number(target.y);
    if (typeof target.y1 !== "function" && target.y !== undefined && target.l !== undefined)
      target.y1 = () => Number(target.y) + Number(target.l);
    target.bounds ??= () => {
      const x0 = value("x0", 0);
      const y0 = value("y0", 0);
      const z0 = value("z0", 0);
      const x1 = value("x1", x0);
      const y1 = value("y1", y0);
      const z1 = value("z1", z0);
      return FloorPlanGeometryBox.fromValues({
        x: x0,
        y: y0,
        w: x1 - x0,
        l: y1 - y0,
        z0,
        h: z1 - z0,
      });
    };
    const exactGeometry = () => {
      if (compound)
        throw new Error(
          `Rectangular-prism geometry does not apply to compound object "${label}"; use bounds() or geometryParts`,
        );
      return target.bounds();
    };
    if (compound) target.geometry = exactGeometry;
    else target.geometry ??= exactGeometry;
    return target;
  },

  fromValues({ x, y, w, l, z0 = 0, h = 0 }) {
    const x0 = Number(x);
    const y0 = Number(y);
    const width = Number(w);
    const length = Number(l);
    const baseZ = Number(z0);
    const height = Number(h);
    const box = {
      x0: () => x0,
      x1: () => x0 + width,
      xc: () => x0 + width / 2,
      y0: () => y0,
      y1: () => y0 + length,
      yc: () => y0 + length / 2,
      z0: () => baseZ,
      z1: () => baseZ + height,
      zc: () => baseZ + height / 2,
      w: () => width,
      l: () => length,
      h: () => height,
      area: () => width * length,
    };
    box.bounds = () => box;
    box.geometry = () => box;
    return box;
  },
};

window.FloorPlanGeometryBox = FloorPlanGeometryBox;
