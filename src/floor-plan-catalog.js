window.FloorPlanCatalog = {
  colors: {
    furniture: "#d8c19a",
    appliance: "#c7d2dc",
    sanitary: "#d9e8ee",
    circulation: "#f5eede",
    terracotta: "#b15232",
    neutral: "#d8d8d8",
  },
  items: {
    "washing-machine": {
      label: "Lavadora",
      size: [0.6, 0.6, 0.85],
      classes: "appliance washing-machine",
      color: "appliance",
    },
    "queen-bed": {
      label: "Cama Queen",
      size: [1.6, 2.0, 0.55],
      classes: "furniture queen-bed",
      color: "furniture",
    },
    "three-seat-sofa": {
      label: "Sofá de 3 lugares",
      size: [2.1, 0.9, 0.85],
      classes: "furniture three-seat-sofa",
      color: "furniture",
    },
    armchair: {
      label: "Poltrona",
      size: [0.8, 0.85, 0.85],
      classes: "furniture armchair",
      color: "furniture",
    },
    railing: {
      label: "Cerca da varanda",
      size: [1.0, 0.08, 1.1],
      classes: "architectural railing",
      color: "neutral",
    },
  },
  openings: {
    door: { w: 0.8, z0: 0, h: 2.1 },
    opening: { w: 1.0, z0: 0, h: 2.1 },
    window: { w: 0.9, z0: 0.9, h: 1.2 },
  },
};
