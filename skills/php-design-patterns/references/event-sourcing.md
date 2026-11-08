# Event Sourcing

## Problem

The history of changes matters more than the current state, or audit and replay are required.

## Forces

- Events are the source of truth; state is derived.
- Schemas and event versions must evolve safely.
- Replay and snapshots need storage and tooling.
- This is a large architectural commitment.

## Solution (PHP 8.1+)

```php
final readonly class OrderPlaced
{
    public function __construct(
        public OrderId $orderId,
        public CustomerId $customerId,
        public Money $total,
        public DateTimeImmutable $occurredAt,
    ) {}
}

final class Order
{
    private OrderStatus $status = OrderStatus::Draft;

    public static function replay(array $events): self
    {
        $order = new self();
        foreach ($events as $event) {
            $order->apply($event);
        }

        return $order;
    }

    public function apply(object $event): void
    {
        if ($event instanceof OrderPlaced) {
            $this->status = OrderStatus::Placed;
        }
    }
}
```

Persist events append-only. Snapshots are a performance optimization, not the source of truth.

## Trade-offs

Eventual consistency, versioning, replay cost and operational complexity. Queries need projections.

## When not to use

- Current state is enough and audit is not a requirement.
- The team lacks projection and replay experience.
- A simple audit log or temporal table covers the need.

## Testing

Test aggregate replay from event sequences, idempotent projections, and upcasting of old event versions.

## Refactoring path

1. Confirm the audit/replay requirement.
2. Model events and aggregate application.
3. Add an append-only store.
4. Add projections and snapshots only when measured.

## Related patterns

See `cqrs.md`, `memento.md` and `ddd-tactical.md`.
