const FloorPlan3DSite = {
  render({ THREE, scene, rooms, terrainProfile, buildingOffsetY, terrainMaterial }) {
    const terrainBounds = rooms.reduce(
      (bounds, room) => ({
        x0: Math.min(bounds.x0, room.x0()),
        x1: Math.max(bounds.x1, room.x1()),
        y0: Math.min(bounds.y0, room.y0()),
        y1: Math.max(bounds.y1, room.y1()),
      }),
      { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity },
    );
    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(
        terrainBounds.x1 - terrainBounds.x0 + 8,
        terrainBounds.y1 - terrainBounds.y0 + 8,
      ),
      terrainMaterial,
    );
    terrain.position.set(
      (terrainBounds.x0 + terrainBounds.x1) / 2,
      (terrainBounds.y0 + terrainBounds.y1) / 2,
      -0.03,
    );
    if (terrainProfile) {
      const positions = terrain.geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        const siteY =
          terrain.position.y + positions.getY(index) + buildingOffsetY;
        const progress = Math.max(
          0,
          Math.min(
            1,
            (siteY - terrainProfile.frontY) /
              (terrainProfile.rearY - terrainProfile.frontY),
          ),
        );
        const elevation =
          terrainProfile.frontZ +
          progress * (terrainProfile.rearZ - terrainProfile.frontZ);
        positions.setZ(index, elevation);
      }
      positions.needsUpdate = true;
      terrain.geometry.computeVertexNormals();
      terrain.geometry.computeBoundingBox();
      terrain.geometry.computeBoundingSphere();
    }
    terrain.renderOrder = -10;
    scene.add(terrain);
  },
};
