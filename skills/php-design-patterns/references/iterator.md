# Iterator

## Problem

A collection needs custom traversal, lazy loading or pagination without exposing its internals.

## Forces

- Traversal may be lazy or expensive.
- PHP already provides `Iterator`, `IteratorAggregate` and generators.
- Multiple concurrent traversals may be needed.
- Rewinding may be impossible for streams.

## Solution (PHP 8.1+)

Prefer `IteratorAggregate` plus a generator:

```php
final class CsvRows implements IteratorAggregate
{
    public function __construct(private string $path) {}

    public function getIterator(): Generator
    {
        $handle = fopen($this->path, 'rb');
        try {
            while (($row = fgetcsv($handle)) !== false) {
                yield $row;
            }
        } finally {
            fclose($handle);
        }
    }
}
```

Use a dedicated `Iterator` only when you need custom `rewind`, `valid` or key semantics.

## Trade-offs

Generators are single-use; concurrent traversal needs separate instances. Lazy errors surface during iteration, not construction.

## When not to use

- A plain array or `iterable` is enough.
- The collection is tiny and eager.
- Traversal order is part of a public contract that is easier to express as an array.

## Testing

Test empty, single and multiple items. Test resource cleanup on early break and exceptions. Test pagination boundaries.

## Refactoring path

1. Identify the traversal logic to hide.
2. Return `iterable` or implement `IteratorAggregate`.
3. Move resource cleanup into `finally`.
4. Replace internal array access at call sites.

## Related patterns

See `composite.md` for recursive structures and `generators.md` for lazy pipelines.
