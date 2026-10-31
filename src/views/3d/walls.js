const FloorPlan3DWalls = {
  render(context) {
    const { plan, openingsByWall } = context;
    const roofLimits = FloorPlanWalls.roofLimits(plan);
    (plan.wallRenderParts || []).forEach((wall) => {
      try {
        const sourceWallId = wall.sourceWallId || wall.id;
        const wallOpenings = openingsByWall.get(sourceWallId) || [];
        const openings = wall.pathSegment === undefined
          ? wallOpenings
          : wallOpenings.filter((opening) => opening.wallSegment === wall.pathSegment);
        const material = wall.color
          ? new context.THREE.MeshLambertMaterial({
              color: plan.themeFillColor(wall.color),
              side: context.THREE.DoubleSide,
            })
          : context.wallMaterial;
        this.renderRoomWall({ ...context, wall, openings, material, roofLimits });
      } catch (error) {
        console.error(`Fachada 3D: falha ao desenhar parede ${wall.id}.`, error);
      }
    });
  },

  renderRoomWall({
    THREE, scene, wall, openings, material, wallLineMaterial,
    windowMaterial, doorMaterial, finite, reportInvalid, roofLimits,
  }) {
    const diagonal = wall.axis === "path";
    const angle = diagonal ? Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0]) : 0;
    const [x0, y0, z0] = diagonal ? [0, -wall.thickness / 2, wall.z0] : wall.pos;
    const [width, depth, height] = diagonal
      ? [Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]), wall.thickness, wall.h]
      : wall.size;
    const alongX = diagonal || wall.axis === "x";
    const length = alongX ? width : depth;
    if (!finite(x0, y0, z0, width, depth, height, length) || length <= 0 || height <= 0) {
      reportInvalid("parede", wall.id);
      return;
    }

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, height);
    shape.lineTo(0, height);
    shape.closePath();
    openings.forEach((opening) => {
      const part = opening.void || opening;
      const holeStart = alongX ? part.x : part.y;
      const wallStart = alongX ? wall.from[0] : wall.from[1];
      const holeX = holeStart - wallStart;
      const holeZ = part.z0 - z0;
      const holeWidth = part.w;
      const holeHeight = part.h;
      if (
        !finite(holeX, holeZ, holeWidth, holeHeight) ||
        holeWidth <= 0 ||
        holeHeight <= 0 ||
        holeX < 0 ||
        holeZ < 0 ||
        holeX + holeWidth > length ||
        holeZ + holeHeight > height
      ) {
        reportInvalid("recorte de parede", opening.id);
        return;
      }
      const hole = new THREE.Path();
      hole.moveTo(holeX, holeZ);
      hole.lineTo(holeX + holeWidth, holeZ);
      hole.lineTo(holeX + holeWidth, holeZ + holeHeight);
      hole.lineTo(holeX, holeZ + holeHeight);
      hole.closePath();
      shape.holes.push(hole);
    });

    // Divide around opening edges before clipping; every piece remains a closed
    // convex solid, including openings that reach the sloping roof.
    const holes = shape.holes.map((hole) => hole.getPoints()).map((points) => ({
      x0: Math.min(...points.map((point) => point.x)),
      x1: Math.max(...points.map((point) => point.x)),
      z0: Math.min(...points.map((point) => point.y)),
      z1: Math.max(...points.map((point) => point.y)),
    }));
    const cuts = [...new Set([0, length, ...holes.flatMap((hole) => [hole.x0, hole.x1])])].sort((a, b) => a - b);
    const vertices = [];
    const wallSolids = [];
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const start = cuts[i], end = cuts[i + 1];
      const active = holes.filter((hole) => hole.x0 < end && hole.x1 > start).sort((a, b) => a.z0 - b.z0);
      let bottom = 0;
      const bands = [];
      active.forEach((hole) => {
        if (hole.z0 > bottom) bands.push([bottom, hole.z0]);
        bottom = Math.max(bottom, hole.z1);
      });
      if (bottom < height) bands.push([bottom, height]);
      bands.forEach(([low, high]) => {
        const faces = FloorPlanWalls.boxFaces(
          alongX ? x0 + start : x0, alongX ? y0 : y0 + start, z0 + low,
          alongX ? x0 + end : x0 + width, alongX ? y0 + depth : y0 + end, z0 + high,
        );
        const worldFaces = diagonal ? faces.map((face) => face.map(([x, y, z]) => [
          wall.from[0] + x * Math.cos(angle) - y * Math.sin(angle),
          wall.from[1] + x * Math.sin(angle) + y * Math.cos(angle), z,
        ])) : faces;
        FloorPlanWalls.roofSolids(worldFaces, roofLimits, wall.roofOnly).forEach((solid) => {
          wallSolids.push(solid);
          solid.forEach((face) => {
            for (let j = 1; j < face.length - 1; j += 1) vertices.push(...face[0], ...face[j], ...face[j + 1]);
          });
        });
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.domainId = wall.id;
    if (wall.pathSegment !== undefined) mesh.userData.pathSegment = wall.pathSegment;
    mesh.renderOrder = 1;
    scene.add(mesh);
    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(
      FloorPlanWalls.outlineSegments(wallSolids).flat(), 3,
    ));
    const outline = new THREE.LineSegments(
      outlineGeometry,
      wallLineMaterial,
    );
    scene.add(outline);

    openings.forEach((opening) => {
      if (!opening.element) return;
      const part = opening.element;
      const feature = new THREE.Mesh(
        new THREE.BoxGeometry(
          alongX ? part.w : 0.04,
          alongX ? 0.04 : part.w,
          part.h,
        ),
        part.type === "window" ? windowMaterial : doorMaterial,
      );
      feature.position.set(
        alongX ? part.x + part.w / 2 : wall.from[0],
        alongX ? wall.from[1] : part.y + part.w / 2,
        part.z0 + part.h / 2,
      );
      feature.renderOrder = 9;
      scene.add(feature);
    });
  },
};
