# Enums as State

## Problem

A finite set of statuses is represented by strings or integers, so invalid values and missing transitions are easy.

## Forces

- PHP 8.1 backed enums cover most finite state sets.
- Persistence stores the backing value.
- Behavior may be simple methods or external state objects.
- Enums cannot carry mutable state.

## Solution (PHP 8.1+)

```php
enum PaymentStatus: string
{
    case Pending = 'pending';
    case Captured = 'captured';
    case Refunded = 'refunded';

    public function canRefund(): bool
    {
        return $this === self::Captured;
    }

    public function refund(): self
    {
        if (!$this->canRefund()) {
            throw new InvalidTransition("Cannot refund {$this->value}.");
        }

        return self::Refunded;
    }
}
```

Persist the backing value, not the case name. Validate with `from()` and handle `ValueError` at the boundary.

## Trade-offs

Enum methods can become a home for unrelated logic. Per-state dependencies force state objects.

## When not to use

- The state set is open or database-driven.
- States need injected services.
- The values are display labels only.

## Testing

Use a data provider for transitions and invalid values. Test persistence round-trips and unknown stored values.

## Refactoring path

1. Enumerate valid statuses.
2. Replace strings with a backed enum.
3. Move transition guards into methods.
4. Replace status writes with transition calls.

## Related patterns

See `php-pattern-state` and `ddd-tactical.md`.
