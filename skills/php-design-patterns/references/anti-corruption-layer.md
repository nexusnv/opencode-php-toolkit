# Anti-Corruption Layer

## Problem

A legacy system's model leaks into the new domain, and its concepts and types contaminate new code.

## Forces

- The legacy model cannot be changed safely.
- Translation rules are non-trivial and must be tested.
- Both systems must run during migration.
- A thin adapter that mirrors legacy methods is not enough.

## Solution (PHP 8.1+)

```php
interface CustomerDirectory
{
    public function findByEmail(Email $email): ?Customer;
}

final readonly class LegacyCustomerDirectory implements CustomerDirectory
{
    public function __construct(private LegacySoapClient $legacy) {}

    public function findByEmail(Email $email): ?Customer
    {
        $row = $this->legacy->findCustomerByEmail($email->value);
        if ($row === null) return null;

        return new Customer(
            new CustomerId($row['CUST_NO']),
            new Email($row['EMAIL']),
            CustomerTier::fromLegacyCode($row['TIER']),
        );
    }
}
```

Translate types, identifiers, errors and vocabulary at one boundary. Keep legacy types out of the domain.

## Trade-offs

Translation code and mapping tests. It can become a dumping ground if ownership is unclear.

## When not to use

- The integration is a single stable call with no model leak.
- The legacy system is being replaced immediately.
- A plain adapter already isolates the needed surface.

## Testing

Test mapping tables, unknown codes, nulls and legacy error translation. Add contract tests against a legacy fixture.

## Refactoring path

1. Identify leaked legacy types and vocabulary.
2. Define the domain-facing port.
3. Implement translation in one layer.
4. Remove legacy references from the domain and add mapping tests.

## Related patterns

See `php-pattern-adapter`, `strangler-fig.md` and `ports-adapters.md`.
