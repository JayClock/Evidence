# Small acceptance-model fixtures

These procurement / additive-deposit model trees are intentionally minimal inputs
for trace hashes, story projection, CLI parsing and export unit tests. They are
**not** runnable backend examples or production contracts. Keep them small so unrelated framework tests do not depend on the
large engineering example's exact scene names or business values.

Real HTTP acceptance and governance use `examples/b2b-escrow/` and its
independent Fastify service.
