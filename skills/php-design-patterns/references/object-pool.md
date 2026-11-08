# Object Pool

## Problem

Creating and destroying expensive objects, such as connections or workers, dominates runtime.

## Forces

- Objects are expensive to create and safe to reuse.
- PHP-FPM resets state per request, limiting pool value.
- Pooled objects may retain stale state.
- Long-running workers benefit most.

## Solution (PHP 8.1+)

```php
final class ConnectionPool
{
    /** @var list<Connection> */
    private array $idle = [];

    public function __construct(private int $max, private Closure $factory) {}

    public function acquire(): Connection
    {
        return array_pop($this->idle) ?? ($this->factory)();
    }

    public function release(Connection $connection): void
    {
        if (count($this->idle) < $this->max) {
            $this->idle[] = $connection;
        }
    }
}
```

Reset state on release. Bound the pool. Handle failed connections.

## Trade-offs

State leakage, pool exhaustion and lifecycle bugs. Most PHP-FPM apps do not benefit.

## When not to use

- Requests are short-lived and objects are cheap.
- The object cannot be safely reset.
- A persistent connection managed by the extension is enough.

## Testing

Test acquire/release, max size, reset-on-release and failure replacement. Add a leak test under repeated cycles.

## Refactoring path

1. Measure object creation cost.
2. Add a bounded pool at the infrastructure boundary.
3. Reset state on release.
4. Add exhaustion and failure tests.

## Related patterns

See `flyweight.md` for shared immutable state and `singleton.md` for the single-instance anti-pattern.
