# @evidence/server-api

Nest controllers, HAL resources, media-type/error handling, modeling SSE serialization, and the Server-owned OpenAPI source.

## Running unit tests

```sh
pnpm nx test @evidence/server-api --run
```

After changing the HTTP contract, run `pnpm api:generate`, `pnpm api:check`, and `pnpm api:contracts`.
