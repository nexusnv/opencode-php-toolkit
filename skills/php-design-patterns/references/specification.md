# Specification

## Problem

Business rules are duplicated across queries, validation and UI, and combining rules with `and`/`or`/`not` becomes hard to read.

## Forces

- Rules should be named and testable independently.
- Rules may need to run in memory and in a database query.
- Database translation can be expensive.
- Not every rule needs a class.

## Solution (PHP 8.1+)

```php
interface Specification
{
    public function isSatisfiedBy(Order $order): bool;
}

final readonly class OverLimit implements Specification
{
    public function __construct(private Money $limit) {}

    public function isSatisfiedBy(Order $order): bool
    {
        return $order->total()->isGreaterThan($this->limit);
    }
}

final readonly class AndSpecification implements Specification
{
    public function __construct(
        private Specification $left,
        private Specification $right,
    ) {}

    public function isSatisfiedBy(Order $order): bool
    {
        return $this->left->isSatisfiedBy($order) && $this->right->isSatisfiedBy($order);
    }
}
```

Keep composition operators small. Database specs need a separate query translation.

## Trade-offs

Class explosion for simple predicates. In-memory composition does not automatically push down to SQL.

## When not to use

- A single method or `match` expresses the rule.
- Rules are only used once.
- The ORM already provides expressive criteria without duplication.

## Testing

Use a truth table per composite operator. Test each leaf rule with boundary values. Test query translation separately.

## Refactoring path

1. Name the repeated predicate.
2. Extract it into a specification class.
3. Compose rules explicitly.
4. Add a query adapter only when needed.

## Related patterns

See `repository.md` for query boundaries and `ddd-tactical.md` for domain rules.
