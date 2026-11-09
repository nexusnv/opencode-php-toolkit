# Singleton (Anti-Pattern Note)

## Problem

Code needs one shared instance, often for configuration, logging or a database connection.

## Forces

- PHP-FPM shares nothing between requests; a singleton is per-request only.
- Hidden global state makes tests order-dependent.
- Dependency injection is usually clearer.
- Some framework bootstrapping legitimately needs one instance.

## Solution (PHP 8.1+)

Prefer constructor injection:

```php
final class Config
{
    public function __construct(private readonly array $values) {}

    public function get(string $key): mixed
    {
        return $this->values[$key] ?? throw new MissingConfig($key);
    }
}
```

If a process-wide instance is truly required, keep it at the composition root and inject it. Avoid static `getInstance()` access from domain code.

## Trade-offs

A singleton is easy to call but hard to replace, test and parallelize. Static access hides dependencies.

## When not to use

- As application-wide dependency management.
- As a substitute for passing a dependency.
- In domain or application code.

## Testing

Tests become order-dependent when singletons mutate. Prefer injecting fresh instances per test.

## Refactoring path

1. Replace `getInstance()` calls with constructor parameters.
2. Create the instance once at the composition root.
3. Add a static-analysis rule that forbids new singleton access.

## Related patterns

See `dependency-injection.md` and `object-pool.md` for bounded reuse.
