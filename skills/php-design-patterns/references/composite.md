# Composite

## Problem

Code must treat a single item and a group of items uniformly, such as a menu with submenus or a price with bundles.

## Forces

- Leaves and containers share operations.
- Recursive traversal must stay simple.
- Depth and cycles can cause runaway recursion.
- Not every container operation makes sense on a leaf.

## Solution (PHP 8.1+)

```php
interface PriceComponent
{
    public function total(): Money;
}

final readonly class LineItem implements PriceComponent
{
    public function __construct(private Money $price) {}

    public function total(): Money { return $this->price; }
}

final readonly class Bundle implements PriceComponent
{
    /** @param list<PriceComponent> $parts */
    public function __construct(private array $parts) {}

    public function total(): Money
    {
        return array_reduce(
            $this->parts,
            fn (Money $sum, PriceComponent $part): Money => $sum->plus($part->total()),
            Money::zero(),
        );
    }
}
```

Decide whether invalid operations on leaves throw or return a neutral result, and document it.

## Trade-offs

Uniformity can hide type differences. Recursive structures are harder to validate and serialize. Deep trees need cycle detection.

## When not to use

- The hierarchy is fixed and two levels deep.
- Leaves and containers genuinely need different APIs.
- A flat list plus a grouping query is enough.

## Testing

Test empty, single-leaf and nested containers. Add a cycle or depth-limit test if users can build the tree.

## Refactoring path

1. Extract the shared operation.
2. Introduce a leaf and a container implementation.
3. Replace special-case traversals with the shared call.
4. Add depth and cycle guards.

## Related patterns

See `visitor.md` for operations added across a stable tree and `iterator.md` for traversal.
