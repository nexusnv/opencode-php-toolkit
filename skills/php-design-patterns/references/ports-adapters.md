# Ports & Adapters

## Problem

Business rules depend on frameworks, databases, queues or vendor SDKs, so changes in infrastructure force changes in the domain.

## Forces

- The domain should be testable without infrastructure.
- Multiple adapters (HTTP, CLI, queue) may drive the same use case.
- This is an architectural boundary, not the object-level Adapter pattern.
- A full hexagonal layout is more than a small app needs.

## Solution (PHP 8.1+)

Define driving ports (use-case interfaces) and driven ports (repository, gateway, clock). Adapters implement driven ports; controllers, commands and workers call driving ports.

```php
interface Clock { public function now(): DateTimeImmutable; }

final readonly class SystemClock implements Clock
{
    public function now(): DateTimeImmutable { return new DateTimeImmutable(); }
}

final readonly class PlaceOrder
{
    public function __construct(
        private OrderRepository $orders,
        private Clock $clock,
    ) {}

    public function __invoke(PlaceOrderCommand $command): OrderId
    {
        $order = Order::place($command, $this->clock->now());
        $this->orders->save($order);

        return $order->id();
    }
}
```

Dependencies point inward. The domain owns the interfaces; infrastructure imports the domain.

## Trade-offs

Adds interfaces and mapping code. Too many tiny ports fragment the model. Keep ports at real boundaries, not around every class.

## When not to use

- A short-lived script or prototype with one adapter.
- The framework is the product and the domain is thin.
- The port only mirrors an ORM method with no translation value.

## Testing

Test use cases with in-memory adapters. Test each adapter against its real technology with integration tests. Verify dependency direction with Deptrac or PHPArkitect.

## Refactoring path

1. Identify infrastructure imports in the domain.
2. Extract the needed interface next to the domain.
3. Implement an adapter in infrastructure.
4. Wire it at the composition root and enforce the dependency rule.

## Related patterns

Use `php-pattern-adapter` for interface translation and `dependency-injection.md` for wiring. See the `php-architecture` skill for layer rules.
