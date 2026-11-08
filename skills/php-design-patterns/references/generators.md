# Generators

## Problem

A transformation pipeline builds large arrays or needs to process streams lazily.

## Forces

- Memory should stay bounded.
- Generators are single-use and forward-only.
- Errors surface during iteration.
- Some operations need look-ahead or sorting.

## Solution (PHP 8.1+)

```php
/**
 * @param iterable<array<string, string>> $rows
 * @return Generator<int, Customer>
 */
function customers(iterable $rows): Generator
{
    foreach ($rows as $row) {
        yield new Customer($row['id'], $row['email']);
    }
}

foreach (customers($rows) as $customer) {
    process($customer);
}
```

Compose small generators. Close resources in `finally`. Materialize only when sorting or counting requires it.

## Trade-offs

Single-use and hard to rewind. Stack traces cross generator boundaries. Mixing lazy and eager steps can surprise.

## When not to use

- The result is small and reused.
- Random access or sorting is required.
- The pipeline is simpler as an array.

## Testing

Test lazy consumption, resource cleanup on break, empty input and exceptions mid-stream.

## Refactoring path

1. Identify a loop that builds an array.
2. Convert it to `yield`.
3. Compose with other generators.
4. Keep the boundary `iterable`.

## Related patterns

See `iterator.md` and `object-pool.md` for resource lifecycle.
