# Repository Guidelines

## Project Structure & Module Organization

This repository is a self-contained static floor-plan study. The main deliverable is [`planta_terreo_estudo.html`](planta_terreo_estudo.html), which contains the page markup, inline CSS, room layout, furniture references, legend, and explanatory text. There are currently no separate source, test, asset, or build directories. Keep small, project-specific changes in this file unless the page grows enough to justify extracting `styles.css`, scripts, or image assets.

## Build, Test, and Development Commands

No package manager or build system is configured. Use a local static server when possible:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/planta_terreo_estudo.html` in a browser. For a quick static check, open the HTML file directly. Before submitting changes, reload the page and verify the plan at desktop and narrow viewport sizes; the layout is driven by CSS custom properties such as `--m`, `--left`, and `--top`.

## Coding Style & Naming Conventions

Use two-space indentation, UTF-8 encoding, semantic HTML where practical, and lowercase kebab-case class names (`master-bath`, `mudroom`). Preserve the existing organization: shared variables and component styles first, followed by layout sections (`FRENTE`, `MEIO`, `FUNDOS`) and furniture/reference styles. Keep dimensions expressed through the existing `--m` scale so proportional measurements remain easy to adjust. Use Portuguese user-facing labels consistently with the current page (`lang="pt-BR"`).

## Testing Guidelines

There is no automated test suite or coverage requirement. Manually test every visual change in a current browser, checking room placement, labels, grid scaling, overflow, and legibility. Validate that the document still loads without console errors and that changes to dimensions do not create unintended overlaps.

## Commit & Pull Request Guidelines

No repository Git history is available, so no established commit convention can be inferred. Use short imperative commit subjects, for example `Adjust garage proportions` or `Clarify floor plan legend`. Pull requests should explain the visual or structural change, identify the affected file, include screenshots for layout changes, and describe the browser/viewport used for verification.

## Security & Configuration Tips

The page is static and has no secrets or runtime configuration. Avoid adding external scripts, fonts, or tracking resources without documenting the dependency and its purpose; prefer self-contained HTML/CSS for this lightweight deliverable.
