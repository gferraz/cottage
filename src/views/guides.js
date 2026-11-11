const FloorPlanGuides = {
  render(plan, guides = []) {
    if (!plan.guidesLayer) return;
    const svg = "http://www.w3.org/2000/svg";
    const create = (name, attributes = {}) => {
      const element = document.createElementNS(svg, name);
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
      return element;
    };

    guides.forEach((guide, index) => {
      const [xValue, yValue] = guide.pos ?? guide.from ?? [];
      const width = guide.w;
      const lengthValue = guide.l;
      const [toXValue, toYValue] = guide.to ?? [];
      const hasEndpoint = guide.to !== undefined;
      const hasWidth = width !== undefined;
      const hasLength = lengthValue !== undefined;
      let values;
      try {
        values = [xValue, yValue].map((value) => plan.resolve(value));
        if (hasEndpoint) {
          const localOrigin = {
            x0: values[0],
            y0: values[1],
            z0: plan.currentFloorHeight,
          };
          values.push(
            plan.resolve(toXValue, localOrigin),
            plan.resolve(toYValue, localOrigin),
          );
        } else {
          values.push(plan.resolve(hasWidth ? width : lengthValue));
        }
      } catch (error) {
        plan.errors.push({
          index,
          opening: guide,
          category: "guide",
          message: error.message,
        });
        return;
      }

      const validLength = !hasEndpoint && values[2] > 0;
      const validEndpoint =
        hasEndpoint &&
        values.slice(2).every(Number.isFinite) &&
        (values[2] !== values[0] || values[3] !== values[1]);
      if (
        values
          .slice(0, hasEndpoint ? 4 : 3)
          .some((value) => !Number.isFinite(value)) ||
        (!hasEndpoint && hasWidth === hasLength) ||
        (!validLength && !validEndpoint)
      ) {
        plan.errors.push({
          index,
          opening: guide,
          category: "guide",
          message: "Guia precisa de pos e w, l ou to [x, y] válido",
        });
        return;
      }

      const offsetX =
        Number.parseFloat(
          getComputedStyle(plan.root).getPropertyValue("--building-offset-x"),
        ) || 0;
      const offsetY =
        Number.parseFloat(
          getComputedStyle(plan.root).getPropertyValue("--building-offset-y"),
        ) || 0;
      const [localX, localY] = values;
      const x = localX + offsetX;
      const y = localY + offsetY;
      const x2 = hasEndpoint
        ? values[2] + offsetX
        : hasWidth
          ? x + values[2]
          : x;
      const y2 = hasEndpoint
        ? values[3] + offsetY
        : hasWidth
          ? y
          : y + values[2];
      const line = create("line", {
        x1: x,
        y1: y,
        x2,
        y2,
        class: "guide-line",
      });
      line.setAttribute("stroke", plan.themeColor(guide.color));
      if (guide.id) line.dataset.id = guide.id;
      plan.guidesLayer.append(line);

      if (guide.label) {
        const labelGap = 0.25;
        const label = create("text", {
          x,
          y,
          class: "guide-label",
          fill: plan.themeColor(guide.color),
        });
        // Counter-rotate around the line endpoint, rather than the text box:
        // SVG text with an existing rotation otherwise moves away from its guide.
        let angle = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
        const reverseLabel = angle > 90 || angle < -90;
        if (reverseLabel) angle += 180;
        label.setAttribute("dy", -labelGap);
        label.setAttribute("text-anchor", reverseLabel ? "start" : "end");
        label.setAttribute("transform", `rotate(${angle + 180} ${x} ${y})`);
        label.textContent = guide.label;
        plan.guidesLayer.append(label);
      }
    });
  },
};

window.FloorPlanGuides = FloorPlanGuides;
