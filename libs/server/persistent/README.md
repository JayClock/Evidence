# @evidence/server-persistent

Evidence persistence adapters for Prisma/PostgreSQL and workspace `.evidence` YAML files. The adapter owns its database contract in `prisma/schema.prisma` and versioned `prisma/migrations/`.

## Running unit tests

```sh
pnpm nx test @evidence/server-persistent --run
```

Use temporary databases/directories in tests and keep adapter behavior aligned with the domain ports.
