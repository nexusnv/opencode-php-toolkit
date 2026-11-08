# Named Constructors

## Problem

Constructors with several parameters are ambiguous, and callers can create invalid combinations.

## Forces

- Creation intent should be readable at the call site.
- Validation should happen before an object exists.
- PHP allows only one constructor.
- Static constructors must not hide dependencies.

## Solution (PHP 8.1+)

```php
final readonly class Money
{
    private function __construct(
        public int $minor,
        public string $currency,
    ) {}

    public static function eur(int $minor): self
    {
        return new self($minor, 'EUR');
    }

    public static function fromDecimal(string $amount, string $currency): self
    {
        return new self((int) round((float) $amount * 100), $currency);
    }
}
```

Name constructors by intent, validate inside, and keep the real constructor private when invariants must hold.

## Trade-offs

More methods. Static constructors can become a dumping ground and can imply global state.

## When not to use

- The object has one obvious creation path.
- The parameters are already self-describing.
- A factory is needed for polymorphic creation.

## Testing

Test each named constructor's validation and normalization. Test that invalid inputs throw.

## Refactoring path

1. Identify ambiguous constructor calls.
2. Add intent-named static constructors.
3. Make the constructor private when possible.
4. Replace call sites.

## Related patterns

See `readonly-dto.md`, `enums-as-state.md` and `abstract-factory.md`.
