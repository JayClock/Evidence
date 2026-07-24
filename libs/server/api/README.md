# @evidence/server-api

Nest controllers, HAL resources, media-type/error handling, and the Server-owned OpenAPI source. Local Pi agents run only in Evidence Desktop.

## Running unit tests

```sh
pnpm nx test @evidence/server-api --run
```

After changing the HTTP contract, run `pnpm api:generate`, `pnpm api:check`, and `pnpm api:contracts`.
