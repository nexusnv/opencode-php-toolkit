# Flyweight

## Problem

A large number of similar objects consumes too much memory because intrinsic data is duplicated.

## Forces

- Most object state is shared and immutable.
- Extrinsic state can be passed at call time.
- PHP request lifecycles already release memory between requests.
- Caching introduces lookup cost and lifecycle concerns.

## Solution (PHP 8.1+)

```php
final readonly class Glyph
{
    public function __construct(public string $shape) {}
}

final class GlyphPool
{
    /** @var array<string, Glyph> */
    private array $pool = [];

    public function get(string $shape): Glyph
    {
        return $this->pool[$shape] ??= new Glyph($shape);
    }
}
```

Keep flyweights immutable and small. Never store per-instance context in them.

## Trade-offs

Pool lookup overhead and shared-state bugs. Unbounded pools leak memory.

## When not to use

- Object counts are small.
- The duplicated data is tiny.
- Objects need distinct mutable state.

## Testing

Test that identical keys return the same instance, that different keys differ, and that the pool is bounded.

## Refactoring path

1. Separate intrinsic from extrinsic state.
2. Extract immutable flyweights.
3. Add a bounded factory/pool.
4. Pass extrinsic state per call.

## Related patterns

See `prototype.md` for copying and `object-pool.md` for reusing expensive instances.
