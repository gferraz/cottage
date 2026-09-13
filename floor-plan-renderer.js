class FloorPlanRenderer {
  static clearGenerated(root) {
    root.querySelectorAll(".plan-generated").forEach((element) => element.remove());
  }

  static append(root, element) {
    root.append(element);
    return element;
  }
}
