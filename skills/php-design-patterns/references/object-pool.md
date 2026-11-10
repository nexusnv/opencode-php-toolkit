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

    /** @var SplObjectStorage<Connection, null> */
    private SplObjectStorage $checkedOut;

    /** Number of connections this pool created and has not discarded. */
    private int $live = 0;

    public function __construct(
        private readonly int $max,
        private readonly Closure $factory,
    ) {
        $this->checkedOut = new SplObjectStorage();
    }

    public function acquire(): Connection
    {
        while ($connection = array_pop($this->idle)) {
            try {
                if ($connection->isValid()) {
                    $this->checkedOut->attach($connection);

                    return $connection;
                }
            } catch (Throwable) {
                // Fall through and discard the broken connection.
            }
            $this->live -= 1;
        }

        if ($this->live >= $this->max) {
            throw new RuntimeException('Connection pool exhausted.');
        }

        $this->live += 1;
        try {
            $connection = ($this->factory)();
            if (!$connection instanceof Connection) {
                throw new UnexpectedValueException('Factory must return a Connection.');
            }
            if ($this->checkedOut->contains($connection)) {
                throw new LogicException('Factory returned a checked-out connection.');
            }
            if (!$connection->isValid()) {
                throw new RuntimeException('Factory returned an invalid connection.');
            }
            $this->checkedOut->attach($connection);
        } catch (Throwable $e) {
            $this->live -= 1;
            throw $e;
        }

        return $connection;
    }

    public function release(Connection $connection): void
    {
        if (!$this->checkedOut->contains($connection)) {
            throw new LogicException('Connection was not acquired from this pool.');
        }
        $this->checkedOut->detach($connection);

        try {
            $connection->reset();
        } catch (Throwable) {
            $this->live -= 1;

            return;
        }

        $this->idle[] = $connection;
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
