# Strangler Fig

## Problem

A legacy subsystem must be replaced incrementally while it keeps serving traffic.

## Forces

- A big-bang rewrite is too risky.
- Old and new implementations must coexist.
- Routing between them must be observable and reversible.
- Data migration is often harder than code migration.

## Solution (PHP 8.1+)

Put a facade or router in front of both implementations. Move one use case at a time.

```php
interface InvoiceExporter
{
    public function export(Invoice $invoice): string;
}

final readonly class MigratingExporter implements InvoiceExporter
{
    public function __construct(
        private InvoiceExporter $legacy,
        private InvoiceExporter $replacement,
        private FeatureFlags $flags,
    ) {}

    public function export(Invoice $invoice): string
    {
        return $this->flags->enabled('new-invoice-export')
            ? $this->replacement->export($invoice)
            : $this->legacy->export($invoice);
    }
}
```

Add metrics and a rollback switch for every migrated slice. Delete the old path after verification.

## Trade-offs

Temporary duplication and dual-write complexity. Feature flags become permanent debt if not removed.

## When not to use

- The legacy surface is small enough to replace in one change.
- There is no way to route or compare traffic.
- The replacement cannot run in parallel.

## Testing

Test both implementations against the same contract before switching. Add routing tests and a comparison test on real fixtures.

## Refactoring path

1. Identify a small vertical slice.
2. Put a router or facade in front.
3. Implement and verify the replacement slice.
4. Switch traffic, observe, then delete the legacy slice.

## Related patterns

See `anti-corruption-layer.md` and `facade.md`.
