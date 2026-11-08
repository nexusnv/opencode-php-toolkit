# Dependency Injection

## Problem

Classes create their own collaborators, making dependencies hidden and tests slow or order-dependent.

## Forces

- Dependencies should be explicit in the constructor.
- Wiring belongs at the composition root.
- A container can hide too much magic.
- PHP has no built-in container; frameworks provide one.

## Solution (PHP 8.1+)

```php
final readonly class ReportService
{
    public function __construct(
        private ReportRepository $reports,
        private Clock $clock,
    ) {}

    public function build(ReportId $id): Report
    {
        return Report::for($this->reports->get($id), $this->clock->now());
    }
}
```

Prefer constructor injection and readonly dependencies. Resolve the graph once at bootstrap; inject the service into controllers, commands and workers.

## Trade-offs

More constructor parameters. Containers add indirection and runtime failures. Service location hides dependencies.

## When not to use

- The dependency is a pure value object.
- The class is a small immutable helper with no external effects.
- Manual wiring in tests is simpler.

## Testing

Inject fakes or test doubles through the constructor. Never use static access to fetch dependencies in tests.

## Refactoring path

1. Replace `new` inside the class with constructor parameters.
2. Move wiring to the composition root.
3. Add readonly and explicit types.
4. Add a container or factory only when the graph grows.

## Related patterns

See `ports-adapters.md` and `singleton.md`.
