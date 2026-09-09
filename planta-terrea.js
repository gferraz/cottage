const floor = new FloorPlan({
  root: document.querySelector("#floor-plan"),
  summary: document.querySelector("#area-summary"),
  boundsSummary: document.querySelector("#plan-bounds"),
  downloadButton: document.querySelector("#download-html"),
  jsonInput: document.querySelector("#json-file"),
  scale: 56
});

floor.addRoom({ id: "porch", pos: [3.6, 1.5], size: [8, 2.5], label: "VARANDA", classes: "outdoor porch" });

const houseX0 = 1.3;
const houseY0 = 4;
const living = floor.addRoom({ id: "living", pos: [houseX0, houseY0], size: [4.5, 3.3], label: "SALA DE ESTAR", classes: "living" });
const houseX1 = living.x1();
const entry = floor.addRoom({ id: "entry", pos: [{ from: "living.x1", delta: 0 }, houseY0], size: [1.8, 3.3], label: "ENTRADA", classes: "circulation entry" });
const houseX2 = entry.x1();
const office = floor.addRoom({ id: "office", pos: ["entry.x1", houseY0], size: [3.2, 3.3], label: "ESCRITÓRIO", classes: "office" });
const houseX3 = office.x1();
floor.addItem({ x: houseX3 - 0.2, y: houseY0 + 0.8, w: 0.5, h: 1.8, classes: "fireplace", title: "Lareira" });

const houseY1 = office.y1();
floor.addRoom({ id: "master", pos: [houseX0, houseY1], size: [4.5, 4], label: "SUÍTE MASTER", classes: "master" });
floor.addRoom({ id: "dining", pos: ["entry.x1 - 0.7", "living.y1"], size: [3.9, 4.8], label: "SALA DE JANTAR", classes: "dining" });
floor.addItem({ x: 8.8, y: 8.2, w: 1.05, h: 2.7, classes: "table", title: "Mesa 2,70 × 1,05 m" });

const stairs = floor.addRoom({ x: houseX1, y: houseY1, w: 1.1, h: 4.8, label: "ESCADA ↓", classes: "circulation stair-flight" });
const powder = floor.addRoom({ x: 9, y: 12.1, w: 1.8, h: 2.1, label: "LAVABO", classes: "powder wet" });
floor.addRoom({ x: houseX0, y: 11.3, w: 2.6, h: 3.5, label: "BANHEIRO MASTER", classes: "master-bath wet" });
floor.addRoom({ x: 3.9, y: 11.3, w: 1.9, h: 3.5, label: "CLOSET", classes: "closet" });
floor.addRoom({ x: houseX1, y: stairs.y1(), w: 1.1, h: 2.7, label: "CORR.", classes: "circulation corridor" });

floor.addRoom({ x: houseX0 + 0.5, y: 14.8, w: 5.1, h: 4, label: "COZINHA", classes: "kitchen wet" });
const laundry = floor.addRoom({ x: 6.9, y: powder.y0(), w: 2.1, h: 3, label: "LAVANDERIA", classes: "service laundry wet" });
floor.addRoom({ x: laundry.x0(), y: laundry.y1(), w: laundry.w(), h: 2, label: "DESPENSA", classes: "service pantry" });
floor.addRoom({ x: powder.x0(), y: powder.y1(), w: powder.w(), h: 2.5, label: "MUDROOM", classes: "service mudroom" });

const garage = floor.addRoom({ x: houseX3, y: 10, w: 6.4, h: 6.1, label: "GARAGEM", classes: "is-garage garage" });
floor.addItem({ x: garage.x0() + 1, y: garage.y0() + 1, w: 1.85, h: 4.6, classes: "car", title: "Carro" });
floor.addItem({ x: garage.x0() + 4, y: garage.y0() + 1.1, w: 1.85, h: 4.6, classes: "car", title: "Carro" });
floor.addRoom({ x: 2, y: 18.8, w: 7, h: 2, label: "TERRAÇO TRASEIRO", classes: "outdoor terrace" });

window.floor = floor;
