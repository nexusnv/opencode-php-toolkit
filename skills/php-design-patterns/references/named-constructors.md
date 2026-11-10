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
final class Money
{
    /** Minor-unit exponent for the currencies this example supports. */
    private const MINOR_UNIT_EXPONENT = ['EUR' => 2, 'USD' => 2, 'JPY' => 0, 'KWD' => 3];

    private function __construct(
        public readonly int $minor,
        public readonly string $currency,
    ) {
        if ($minor < 0) {
            throw new InvalidArgumentException('Money cannot be negative.');
        }
        if (!isset(self::MINOR_UNIT_EXPONENT[$currency])) {
            throw new InvalidArgumentException('Unsupported currency.');
        }
    }

    public static function eur(int $minor): self
    {
        return new self($minor, 'EUR');
    }

    public static function fromDecimal(string $amount, string $currency): self
    {
        $exponent = self::MINOR_UNIT_EXPONENT[$currency] ?? null;
        if ($exponent === null) {
            throw new InvalidArgumentException('Unsupported currency.');
        }

        $fraction = $exponent === 0 ? '' : '(?:\.(\d{1,' . $exponent . '}))?';
        if (preg_match('/^(0|[1-9]\d*)' . $fraction . '\z/', $amount, $matches) !== 1) {
            throw new InvalidArgumentException(
                $exponent === 0
                    ? 'Amount must be a whole number for this currency.'
                    : sprintf('Amount must have at most %d fraction digits.', $exponent),
            );
        }

        $whole = filter_var($matches[1], FILTER_VALIDATE_INT);
        $scale = 10 ** $exponent;
        if ($whole === false || $whole > intdiv(PHP_INT_MAX - ($scale - 1), $scale)) {
            throw new InvalidArgumentException('Amount is outside the supported range.');
        }

        $minor = $whole * $scale + (int) str_pad($matches[2] ?? '', $exponent, '0');

        return new self($minor, $currency);
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
