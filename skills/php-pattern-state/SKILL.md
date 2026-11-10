---
name: PHP State Pattern
description: Move state-dependent PHP behavior out of growing conditionals. Use when an order, subscription or document behaves differently by status and transitions must stay explicit.
---

# PHP State Pattern

## Problem

A class switches on a status field in many methods. Transitions are scattered, invalid
transitions are possible, and adding a status means editing every switch.

## Forces

- The legal transitions and their guards should be visible in one place.
- Some states need different dependencies or side effects.
- A simple finite status set may be expressed with a native enum.
- State data must survive persistence.

## Solution (PHP 8.1+)

Use a native enum when behavior is small and uniform:

```php
enum OrderStatus: string
{
    case Draft = 'draft';
    case Paid = 'paid';
    case Shipped = 'shipped';
    case Cancelled = 'cancelled';

    public function canShip(): bool
    {
        return $this === self::Paid;
    }
}
```

Use state objects when each state carries behavior and dependencies:

```php
interface OrderState
{
    public function pay(Order $order): OrderState;
    public function ship(Order $order): OrderState;
}

final class Paid implements OrderState
{
    public function pay(Order $order): OrderState
    {
        throw new InvalidTransition('Order is already paid.');
    }

    public function ship(Order $order): OrderState
    {
        $order->recordShipment();

        return new Shipped();
    }
}
```

Return the next state or throw a domain exception. Do not let callers set status directly.

## Trade-offs

State classes add indirection. For a handful of statuses with no per-state dependencies, an
enum plus `match` is clearer and cheaper. Persist a stable status value, not object identity.

## When not to use

- The value is only used for display.
- Transitions are linear and enforced by the database or workflow engine.
- A single `match` with no duplication already expresses the rules.

## Testing

Use a transition table data provider. Assert legal transitions, rejected transitions, and
side effects. Cover persistence round-trips for the stored status value.

## Refactoring path

1. List statuses and legal transitions.
2. Replace raw status writes with transition methods.
3. Extract per-state behavior only where it diverges.
4. Delete the old switches and add transition tests.

## Related patterns

See `references/enums-as-state.md` for the enum-first option and
`references/ddd-tactical.md` for aggregate transition guards.
