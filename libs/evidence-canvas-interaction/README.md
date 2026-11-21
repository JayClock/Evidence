# evidence-canvas-interaction

Framework-free geometry for the business journey canvas, tested without React
or the DOM. `computeSwimlaneLayout(graph, density)` is the single layout entry
point: it places entities in lifecycle stages and responsibility lanes, retains
nested Context geometry, and routes modeled relationships and fulfillment pairs.

| Module       | Responsibility                                                                    |
| ------------ | --------------------------------------------------------------------------------- |
| `viewport/`  | `world * zoom + pan` transforms, anchor-preserving zoom, zoom-to-fit.             |
| `ruler/`     | 1-2-5 step ladder and grid-aligned major/minor ticks for both axes.               |
| `layout/`    | Turns a `DomainGraph` into placed Context cards, Fulfillment pairs, nodes, edges. |
| `selection/` | One-hop highlight sets, marquee intersection and pointer hit testing.             |

```bash
nx test evidence-canvas-interaction
nx build evidence-canvas-interaction
```
