# @evidence/ui

Shared React UI library for Evidence.

This library is configured for the official shadcn/ui and AI Elements source-owned component layout:

- `src/components/ui/` — shadcn/ui components
- `src/components/ai-elements/` — AI Elements components
- `src/lib/utils.ts` — shared `cn()` utility used by generated components
- `src/styles.css` — Tailwind v4 + shadcn theme tokens

## CLI usage

From the workspace root:

```sh
pnpm ui:shadcn add dialog
pnpm ui:ai-elements message
```

Equivalent direct commands:

```sh
pnpm --filter @evidence/ui exec shadcn add dialog
cd libs/ui && pnpm exec elements add message
```

For shadcn commands that support `--cwd`, this also works:

```sh
pnpm dlx shadcn@latest add dialog -c libs/ui
```

Consumers should import `@evidence/ui/styles.css` once in their app stylesheet.
