# Repository

## Problem

Domain code calls SQL or ORM APIs directly, so persistence details leak into business rules and tests need a database.

## Forces

- The domain needs collection-like access, not query-builder access.
- Tests need an in-memory seam.
- A simple persistence service or DAO is often enough.
- Repository is not promoted in P0; it is a reference because it is frequently overused.

## Solution (PHP 8.1+)

```php
interface OrderRepository
{
    public function get(OrderId $id): Order;
    public function save(Order $order): void;
}

final class DoctrineOrderRepository implements OrderRepository
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function get(OrderId $id): Order
    {
        return $this->em->find(Order::class, $id)
            ?? throw new OrderNotFound($id->value);
    }

    public function save(Order $order): void
    {
        $this->em->persist($order);
    }
}
```

Keep the interface collection-like and small. Do not expose query builders.

`save()` only schedules the aggregate; it does not flush. The application
boundary must flush the same `EntityManagerInterface` instance before the
transaction commits:

```php
$orders->save($order);
$entityManager->flush();
```

Without that flush, a later read from another process will not find the order.

## Trade-offs

One interface per aggregate. Generic repositories blur aggregate boundaries. In-memory implementations can drift from real query semantics.

## When not to use

- A controller or small service reads one table; a DAO or query object is simpler.
- The ORM entity is already the aggregate and no test seam is needed.
- You only need one query; a named query method on the service is enough.

## Testing

Test the in-memory implementation against the same contract as the real one. Cover not-found, persistence round-trip and transaction behavior.

## Refactoring path

1. Extract the queries the domain actually needs.
2. Introduce a narrow repository interface.
3. Move ORM code behind the implementation.
4. Replace direct ORM calls and add contract tests.

## Related patterns

See `ports-adapters.md` for the architectural boundary, and `unit-of-work.md` for transaction scope.
