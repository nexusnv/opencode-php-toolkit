# Visitor

## Problem

Many operations must run over a stable object structure without adding a method to every class for each operation.

## Forces

- The type hierarchy is stable; operations change often.
- Operations need access to concrete node types.
- Adding a node type forces every visitor to change.
- Modern PHP may prefer pattern matching on sealed-ish types.

## Solution (PHP 8.1+)

```php
interface Node
{
    public function accept(NodeVisitor $visitor): mixed;
}

final class NumberNode implements Node
{
    public function __construct(public readonly int $value) {}

    public function accept(NodeVisitor $visitor): mixed
    {
        return $visitor->visitNumber($this);
    }
}

interface NodeVisitor
{
    public function visitNumber(NumberNode $node): mixed;
}
```

Prefer `match` over a closed set of DTOs when the hierarchy is small and internal.

## Trade-offs

Double dispatch and visitor interfaces. Adding a node type breaks all visitors; adding operations is cheap.

## When not to use

- New node types are frequent.
- The hierarchy is closed and `match` is readable.
- The operation needs private state from the nodes.

## Testing

Test each visitor against all node types. Add a test that every node has a visitor case.

## Refactoring path

1. Confirm the type set is stable.
2. Add `accept` to the node interface.
3. Extract operations into visitors.
4. Replace external type switches.

## Related patterns

See `composite.md` for tree structures and `iterator.md` for traversal.
