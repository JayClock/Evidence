# desktop-feature-inspector

Read-only review of the selected entity. The right pane shows modeled fields,
responsibility, provenance, and fulfillment structure. `Alt+L` or the pane's
ledger button opens the wide, read-only key-data ledger. Its field buttons
select a formula to inspect, and CodeMirror provides selectable, highlighted
CEL source without editing, completion, or submit handlers.

The inspector takes a `DomainGraph` and a selection, not a `ModelSession` or a
write callback. To change node information in the workbench, use the existing
AI modeling and patch review flow; the inspector reflects the updated graph.
This change does not remove model mutation APIs or change the saved FM format.
