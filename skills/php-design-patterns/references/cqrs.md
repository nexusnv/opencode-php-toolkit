# CQRS

## Problem

Read and write models have different shapes and performance needs, and one model serves both badly.

## Forces

- Writes need invariants and transactional consistency.
- Reads need denormalized, fast queries.
- Full CQRS with separate stores is expensive.
- Most applications only need separate query objects.

## Solution (PHP 8.1+)

Start with command/query separation in code, not infrastructure:

```php
final class PlaceOrderHandler
{
    public function __construct(private readonly OrderRepository $orders) {}

    public function __invoke(PlaceOrder $command): OrderId
    {
        $order = Order::place($command);
        $this->orders->save($order);

        return $order->id();
    }
}

final class OrderSummaryQuery
{
    public function __construct(private readonly Connection $db) {}

    /** @return list<OrderSummary> */
    public function forCustomer(CustomerId $id): array
    {
        $rows = $this->db->fetchAllAssociative(
            'SELECT id, total, status FROM order_summary WHERE customer_id = ?',
            [$id->value],
        );

        return array_map(
            static fn (array $row): OrderSummary => new OrderSummary(
                id: (string) $row['id'],
                total: (int) $row['total'],
                status: (string) $row['status'],
            ),
            $rows,
        );
    }
}
```

Only separate stores and projections when read scale or model mismatch justifies it.

## Trade-offs

Two models and eventual consistency when projections are async. More code and operational surface.

## When not to use

- CRUD with balanced read/write needs.
- A single small database and simple invariants.
- The team cannot operate projection lag.

## Testing

Test command handlers for invariants. Test queries against seeded data. If projections exist, test lag and replay.

## Refactoring path

1. Split write and read code paths.
2. Introduce query objects for complex reads.
3. Add projections only when measured needs require them.
4. Document consistency expectations.

## Related patterns

See `event-sourcing.md`, `unit-of-work.md` and `repository.md`.
