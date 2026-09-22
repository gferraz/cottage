# Repository Guidelines

## Project Structure & Module Organization

This repository is a self-contained static floor-plan study. The main deliverable is [`floor-plan.html`](floor-plan.html), which contains the page shell, embedded export CSS template, controls, and legend. Application JavaScript and CSS modules live in [`src/`](src/); floor definitions remain in JSON files at the repository root. There is no separate test or build directory.

## Build, Test, and Development Commands

No package manager or build system is configured. Use a local static server when possible:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/floor-plan.html` in a browser. For a quick static check, open the HTML file directly. Before submitting changes, reload the page and verify the plan at desktop and narrow viewport sizes; the layout is driven by CSS custom properties such as `--m`, `--viewport-origin-x`, and `--viewport-origin-y`.

## Coding Style & Naming Conventions

Use two-space indentation, UTF-8 encoding, semantic HTML where practical, and lowercase kebab-case class names (`master-bath`, `mudroom`). Keep geometry in JSON and use the shared `.plan-item` rule to convert meter values using `--m`. Reserve room-specific classes for identity or appearance. Use Portuguese user-facing labels consistently with the current page (`lang="pt-BR"`).

## Testing Guidelines

Domain tests run with Node's built-in test runner (no dependencies):

```sh
node --test test/
```

The tests cover only the pure, DOM-free geometry and validation logic; no jsdom or package manager is used. Manually test every visual change in a current browser, checking room placement, labels, grid scaling, overflow, and legibility. Validate that the document still loads without console errors and that changes to dimensions do not create unintended overlaps.

## Commit & Pull Request Guidelines

No repository Git history is available, so no established commit convention can be inferred. Use short imperative commit subjects, for example `Adjust garage proportions` or `Clarify floor plan legend`. Pull requests should explain the visual or structural change, identify the affected file, include screenshots for layout changes, and describe the browser/viewport used for verification.

## Security & Configuration Tips

The page is static and has no secrets or runtime configuration. Avoid adding external scripts, fonts, or tracking resources without documenting the dependency and its purpose; prefer self-contained HTML/CSS for this lightweight deliverable.
