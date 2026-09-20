const FloorPlanRenderer = {
  clearGenerated(root) {
    root.querySelectorAll(".plan-generated").forEach((element) => element.remove());
  },

  append(root, element) {
    root.append(element);
    return element;
  }
};
