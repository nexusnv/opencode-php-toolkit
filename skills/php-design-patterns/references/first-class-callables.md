# First-Class Callables

## Problem

A single pure function varies, but a full strategy interface and class are too much ceremony.

## Forces

- PHP 8.1 supports `$callable = $this->method(...)`.
- Closures capture dependencies and state.
- Callables lack named types and can hide signatures.
- Larger algorithms need an interface and tests.

## Solution (PHP 8.1+)

```php
final class PriceCalculator
{
    /** @param Closure(Money): Money $discount */
    public function __construct(private readonly Closure $discount) {}

    public function total(Money $subtotal): Money
    {
        return ($this->discount)($subtotal);
    }
}

$calculator = new PriceCalculator(
    fn (Money $price): Money => $price->multiply(0.9),
);
```

Type the callable with a `Closure` docblock or a small interface. Prefer an interface when the variant has dependencies or many methods.

## Trade-offs

Callables are harder to serialize, mock and name. Signature drift is easy without a type.

## When not to use

- The variant needs several methods.
- The callable must be persisted or queued.
- The behavior is complex enough to need a class.

## Testing

Test the caller with a recording callable. Test the function separately. Add a type assertion for the signature.

## Refactoring path

1. Extract the varying function.
2. Inject it as a typed `Closure`.
3. Replace the conditional.
4. Promote to an interface if the callable grows.

## Related patterns

See `php-pattern-strategy` and `dependency-injection.md`.
