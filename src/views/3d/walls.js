const FloorPlan3DWalls = {
  render(context) {
    const { plan, openingsByWall } = context;
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
        if (wall.axis === "path") {
          context.reportInvalid("parede independente diagonal não representada como prisma", wall.id);
          return;
        }
        this.renderRoomWall({ ...context, wall, openings, material });
      } catch (error) {
        console.error(`Fachada 3D: falha ao desenhar parede ${wall.id}.`, error);
      }
    });
  },

  renderRoomWall({
    THREE, scene, wall, openings, material, wallLineMaterial,
    windowMaterial, doorMaterial, finite, reportInvalid,
  }) {
    const [x0, y0, z0] = wall.pos;
    const [width, depth, height] = wall.size;
    const alongX = wall.axis === "x";
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

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: alongX ? depth : width,
      bevelEnabled: false,
    });
    const transform = alongX
      ? new THREE.Matrix4().set(
          1, 0, 0, x0,
          0, 0, -1, y0 + depth,
          0, 1, 0, z0,
          0, 0, 0, 1,
        )
      : new THREE.Matrix4().set(
          0, 0, 1, x0,
          1, 0, 0, y0,
          0, 1, 0, z0,
          0, 0, 0, 1,
        );
    geometry.applyMatrix4(transform);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.domainId = wall.id;
    if (wall.pathSegment !== undefined) mesh.userData.pathSegment = wall.pathSegment;
    mesh.renderOrder = 1;
    scene.add(mesh);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
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
