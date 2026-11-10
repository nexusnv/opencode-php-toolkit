---
name: PHP Strategy Pattern
description: Replace conditional algorithm selection with interchangeable PHP strategies. Use when pricing, shipping, validation or export behavior varies by implementation and the variants change independently.
---

# PHP Strategy Pattern

## Problem

A class grows `if`/`switch` branches for each algorithm variant, and every new variant edits
the same class. The variants have different dependencies and are hard to test in isolation.

## Forces

- Variants change at different rates and may be added by different teams.
- The caller should not know which implementation it uses.
- Some variants need injected dependencies; a closure is too small for those.
- PHP 8.1 first-class callables are enough when a variant is a single pure function.

## Solution (PHP 8.1+)

```php
interface ShippingCost
{
    public function for(Order $order): Money;
}

final class FlatRateShipping implements ShippingCost
{
    public function __construct(private readonly Money $rate) {}

    public function for(Order $order): Money
    {
        return $this->rate;
    }
}

final class WeightBasedShipping implements ShippingCost
{
    public function __construct(private readonly WeightTable $table) {}

    public function for(Order $order): Money
    {
        return $this->table->costFor($order->weight());
    }
}

final class Checkout
{
    public function __construct(private readonly ShippingCost $shipping) {}

    public function total(Order $order): Money
    {
        return $order->subtotal()->plus($this->shipping->for($order));
    }
}
```

Choose the implementation at the composition root (container, factory or named
constructor). Do not select it from the strategy itself.

## Trade-offs

Adds an interface and wiring. For one stable algorithm, a method is simpler. For a single
pure function, a `Closure` parameter is smaller than a class.

## When not to use

- Only one implementation exists and no second one is planned.
- The branching is over data mapping that `match` expresses clearly.
- The variants differ only by configuration values; pass a value object instead.

## Testing

Test each strategy against the same contract using a data provider. Test the caller with a
small fake strategy; assert the selected strategy at the composition root.

## Refactoring path

1. Extract each branch into a method with the same signature.
2. Introduce an interface and one class per branch.
3. Replace the conditional with an injected implementation.
4. Delete the conditional and its tests.

## Related patterns

Strategy is often confused with State (behavior changes with internal state) and Adapter
(interface translation). See `php-design-patterns` for Decorator and Template Method.
