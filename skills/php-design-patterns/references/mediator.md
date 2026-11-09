# Mediator

## Problem

Many components communicate directly, creating a dense web of dependencies and hard-to-follow control flow.

## Forces

- Centralizing interaction reduces coupling.
- The mediator can become a god object.
- Some interactions are naturally one-to-many.
- Domain events may be a better fit than a mediator.

## Solution (PHP 8.1+)

```php
final class CheckoutMediator
{
    public function __construct(
        private readonly Inventory $inventory,
        private readonly Payments $payments,
        private readonly Shipping $shipping,
    ) {}

    public function checkout(Cart $cart): CheckoutResult
    {
        $reservation = $this->inventory->reserve($cart);
        $payment = $this->payments->charge($cart, $reservation);

        return $this->shipping->schedule($cart, $payment);
    }
}
```

Keep the mediator orchestration-only; put rules in the collaborators.

## Trade-offs

Central control flow is easier to trace but can concentrate too much logic. It can hide domain events that other components need.

## When not to use

- Components can communicate through a simple interface.
- The orchestration is one call.
- A domain event bus already provides decoupling.

## Testing

Test the mediator with fake collaborators and assert ordering and failure handling. Test collaborators independently.

## Refactoring path

1. Map the direct interactions.
2. Extract orchestration into a mediator.
3. Replace direct references with mediator calls.
4. Move business rules back into collaborators.

## Related patterns

See `facade.md` for simplified subsystem access and `command.md` for queued operations.
