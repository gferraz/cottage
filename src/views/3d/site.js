const FloorPlan3DSite = {
  render({ THREE, scene, rooms, terrainProfile, buildingOffsetX, buildingOffsetY, terrainMaterial }) {
    if (!rooms.length) return;
    const x0 = Math.min(...rooms.map((room) => room.x0())) - 4;
    const x1 = Math.max(...rooms.map((room) => room.x1())) + 4;
    const y0 = Math.min(...rooms.map((room) => room.y0())) - 4;
    const y1 = Math.max(...rooms.map((room) => room.y1())) + 4;
    const { vertices, indices } = FloorPlanTerrainGeometry.surface(
      terrainProfile, { x0, x1, y0, y1 }, { x: buildingOffsetX, y: buildingOffsetY },
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.position.z = -0.03;
    terrain.receiveShadow = true;
    terrain.renderOrder = -10;
    scene.add(terrain);
  },
};
