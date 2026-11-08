---
name: PHP Adapter Pattern
description: Translate a third-party or legacy PHP interface into the interface your domain owns. Use when integrating payment, mail, storage or legacy APIs without leaking vendor types into application code.
---

# PHP Adapter Pattern

## Problem

Application code calls a vendor or legacy class directly. Vendor types, exceptions and
method names spread through the codebase, so replacing the dependency or faking it in tests
becomes expensive.

## Forces

- The domain should own the interface it depends on.
- The vendor API may be final, awkward, or have different error semantics.
- A boundary may need several operations composed into one domain operation.
- Over-adapting every method creates a large, low-value wrapper.

## Solution (PHP 8.1+)

```php
interface PaymentGateway
{
    public function charge(string $reference, Money $amount): PaymentResult;
}

final readonly class StripeGateway implements PaymentGateway
{
    public function __construct(private StripeClient $stripe) {}

    public function charge(string $reference, Money $amount): PaymentResult
    {
        try {
            $charge = $this->stripe->charges->create([
                'amount' => $amount->minorUnits(),
                'currency' => $amount->currency(),
                'reference' => $reference,
            ]);
        } catch (StripeException $e) {
            return PaymentResult::failed($e->getMessage());
        }

        return PaymentResult::captured($charge->id);
    }
}
```

Keep vendor types out of the port. Translate exceptions and result shapes at the boundary.
Prefer composition over extending a vendor class.

## Trade-offs

One interface plus one adapter per vendor. The port should follow domain needs, not mirror
the vendor API. Too many narrow ports can fragment the dependency.

## When not to use

- The vendor type is already a stable, minimal interface the domain can own.
- The code is a one-off script with no tests and no replacement plan.
- The "adapter" would only rename methods without translating behavior or types.

## Testing

Test the adapter against the real vendor client contract with a fake or recorded fixture,
and test application code against an in-memory port implementation.

## Refactoring path

1. Define the port from the application's needs.
2. Wrap the vendor call in an adapter.
3. Replace direct vendor references with the port.
4. Delete vendor imports outside the adapter and composition root.

## Related patterns

Ports & Adapters is the architectural form; see `references/ports-adapters.md` and
`php-pattern-decorator` for layering behavior on the port.
