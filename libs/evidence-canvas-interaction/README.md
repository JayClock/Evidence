# evidence-canvas-interaction

Framework-free geometry for the business journey canvas, tested without React
or the DOM. `computeSwimlaneLayout(graph, density)` is the single layout entry
point: it places entities in lifecycle stages and responsibility lanes, retains
nested Context geometry, and routes modeled relationships and fulfillment pairs.

| Module       | Responsibility                                                                  |
| ------------ | ------------------------------------------------------------------------------- |
| `ruler/`     | 1-2-5 step ladder and grid-aligned major/minor ticks for both axes.             |
| `engine/`    | Turns a `DomainGraph` into placed Contexts, fulfillment pairs, nodes and edges. |
| `selection/` | One-hop highlight sets and Context scoping.                                     |

```bash
nx test evidence-canvas-interaction
nx build evidence-canvas-interaction
```
