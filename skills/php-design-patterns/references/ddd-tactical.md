# DDD Tactical Patterns

## Problem

Domain rules are scattered across services and controllers, and aggregates have no clear invariants or identity.

## Forces

- Invariants must hold inside an aggregate boundary.
- Entities and value objects have different equality semantics.
- Repositories should load and save whole aggregates.
- Tactical DDD without a real domain problem adds ceremony.

## Solution (PHP 8.1+)

```php
final readonly class Money
{
    public function __construct(public int $minor, public string $currency)
    {
        if ($minor < 0) throw new InvalidArgumentException('Money cannot be negative.');
    }
}

final class Order
{
    private OrderStatus $status = OrderStatus::Draft;

    private function __construct(
        public readonly OrderId $id,
        private array $lines = [],
    ) {}

    public static function place(OrderId $id, array $lines): self
    {
        $order = new self($id, $lines);
        $order->assertMinimumTotal();

        return $order;
    }

    public function pay(PaymentId $payment): void
    {
        if ($this->status !== OrderStatus::Draft) {
            throw new InvalidTransition('Only draft orders can be paid.');
        }
        $this->status = OrderStatus::Paid;
    }
}
```

Keep aggregates small. Reference other aggregates by ID. Use value objects for validated values.

## Trade-offs

Aggregate boundaries are hard to get right. Large aggregates cause contention. Anemic models may be appropriate for simple CRUD.

## When not to use

- The application is mostly CRUD with few invariants.
- The team cannot maintain the ubiquitous language.
- Boundaries are still unknown; explore first.

## Testing

Test invariants and transitions on aggregates. Test value-object validation and equality. Test repositories against real persistence.

## Refactoring path

1. Identify invariants and transactional boundaries.
2. Extract value objects.
3. Make aggregate state changes explicit.
4. Add repositories per aggregate root.

## Related patterns

See `repository.md`, `unit-of-work.md` and `enums-as-state.md`.
