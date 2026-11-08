# Unit of Work

## Problem

Several aggregates must be persisted atomically, and infrastructure code keeps calling save in the middle of business operations.

## Forces

- Transaction boundaries should be explicit.
- Business code should not depend on the ORM.
- Partial writes must not leak.
- ORMs often provide a unit of work already.

## Solution (PHP 8.1+)

```php
interface UnitOfWork
{
    public function register(object $entity): void;
    public function commit(): void;
    public function rollback(): void;
}

final readonly class OrderPlacement
{
    public function __construct(
        private OrderRepository $orders,
        private Inventory $inventory,
        private UnitOfWork $uow,
    ) {}

    public function place(Order $order): void
    {
        $this->orders->add($order);
        $this->inventory->reserve($order);
        $this->uow->commit();
    }
}
```

Keep commits at the application boundary, not inside domain methods.

## Trade-offs

Global state and hidden flushes are easy to misuse. Error handling and retries need care. Many ORMs already own this concern.

## When not to use

- The ORM's entity manager already gives the needed transaction boundary.
- Only one aggregate is written.
- The operation is read-only.

## Testing

Test rollback on failure and commit only after all steps. Use a real database for transaction semantics when possible.

## Refactoring path

1. Identify the transaction boundary.
2. Move saves to the boundary.
3. Introduce an explicit unit of work if the ORM lacks one.
4. Add rollback tests.

## Related patterns

See `repository.md` and `cqrs.md`. For aggregate boundaries, see `ddd-tactical.md`.
