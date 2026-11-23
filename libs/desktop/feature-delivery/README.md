# Delivery feature

Nx project: `desktop-feature-delivery`; package: `@evidence-poc/desktop-feature-delivery`.

Owns the delivery hub, incremental diff panel and read-only preview hook.
Preview revision guards, the opening baseline and the automatic delivery status
subscription live for the editor lifetime, not the dialog lifetime.

```tsx
const delivery = useDeliveryHub(desktopApi.projects, rootPath, session, baseDocument);
// The editor passes the sync result only if it matches the current revision.
return <DeliveryHub hub={delivery} sync={currentSyncResult} {...presentationProps} />;
```

The hook uses `deliveryLivePreview` and `onDeliveryStatus` from the typed project
IPC API. It does not write files or invoke a directory picker. Main listens to
accepted editor revisions independently of the hub and syncs the validated
context artifacts. The full authoring preview can differ from the synced subset.

```bash
pnpm exec nx run-many -t test,typecheck,lint -p desktop-feature-delivery
```
