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
final class Money
{
    public function __construct(public readonly int $minor, public readonly string $currency)
    {
        if ($minor < 0) throw new InvalidArgumentException('Money cannot be negative.');
        if (preg_match('/^[A-Z]{3}$/', $currency) !== 1) {
            throw new InvalidArgumentException('Currency must be an ISO 4217 code.');
        }
    }
}

final class Order
{
    // Example policy: reject orders below 1.00 in their currency.
    private const MINIMUM_TOTAL_MINOR = 100;

    private OrderStatus $status = OrderStatus::Draft;

    /** @param list<Money> $lines */
    private function __construct(
        public readonly OrderId $id,
        private readonly array $lines,
    ) {}

    /** @param list<Money> $lines */
    public static function place(OrderId $id, array $lines): self
    {
        $order = new self($id, $lines);
        $order->assertMinimumTotal();

        return $order;
    }

    private function assertMinimumTotal(): void
    {
        $currency = null;
        $minor = 0;
        foreach ($this->lines as $line) {
            $currency ??= $line->currency;
            if ($line->currency !== $currency) {
                throw new InvalidArgumentException('All lines must use the same currency.');
            }
            $minor += $line->minor;
        }

        if ($minor < self::MINIMUM_TOTAL_MINOR) {
            throw new DomainException('Order total is below the minimum.');
        }
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
