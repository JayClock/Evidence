# Delivery feature

Nx project: `desktop-feature-delivery`; package: `@evidence-poc/desktop-feature-delivery`.

Owns the delivery hub, incremental diff panel and read-only preview hook.
Preview revision guards and the opening baseline live for the editor lifetime,
not the dialog lifetime. The application supplies persisted artifact status.

```tsx
const delivery = useDeliveryHub(desktopApi.projects, rootPath, session, baseDocument);
// The editor passes the sync result only if it matches the current revision.
return <DeliveryHub hub={delivery} sync={currentSyncResult} {...presentationProps} />;
```

The hook uses only the read-only `deliveryLivePreview` IPC. Main syncs validated
context artifacts and acceptance cases from confirmed disk revisions, regardless
of whether the hub is open. The full authoring preview can differ from the
synced API subset.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-delivery
```
