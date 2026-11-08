# Traits vs Composition

## Problem

Shared behavior is needed across unrelated classes, and inheritance is unavailable or would create a bad hierarchy.

## Forces

- Traits copy methods into a class and cannot carry state safely.
- Composition makes dependencies explicit.
- Traits are useful for orthogonal, stateless helpers.
- Method conflicts and hidden coupling are easy.

## Solution (PHP 8.1+)

Prefer composition:

```php
interface Clock { public function now(): DateTimeImmutable; }

final readonly class Timestamped
{
    public function __construct(private Clock $clock) {}

    public function stamp(): string
    {
        return $this->clock->now()->format(DATE_ATOM);
    }
}
```

Use a trait only for small, stateless, orthogonal behavior with no dependencies:

```php
trait FormatsMoney
{
    private function format(Money $money): string
    {
        return number_format($money->minor / 100, 2).' '.$money->currency;
    }
}
```

## Trade-offs

Traits flatten into the class and are invisible in the type system. Composition adds an object and wiring.

## When not to use

- The behavior needs dependencies.
- Two traits define the same method or property.
- The trait would be used by only one class.

## Testing

Test trait behavior through each using class. Test composed collaborators independently.

## Refactoring path

1. Identify duplicated methods.
2. Extract a stateless helper.
3. Inject it instead of using a trait when dependencies exist.
4. Add a conflict check for remaining traits.

## Related patterns

See `php-pattern-strategy`, `dependency-injection.md` and `php-pattern-decorator`.
