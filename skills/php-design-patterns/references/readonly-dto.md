# Readonly DTOs

## Problem

Data crosses layers as arrays with implicit keys, causing typos and missing validation.

## Forces

- DTOs should be immutable and typed.
- Constructor promotion reduces boilerplate.
- Validation belongs at the boundary, not in every DTO.
- Deep nesting needs explicit types.

## Solution (PHP 8.1+)

```php
final readonly class CustomerDto
{
    /** @param list<AddressDto> $addresses */
    public function __construct(
        public string $id,
        public string $email,
        public array $addresses = [],
    ) {}
}
```

Use `readonly` classes for transport objects. Keep them free of behavior and persistence logic. Use value objects when validation matters.

## Trade-offs

Mapping code between entities and DTOs. `readonly` is shallow for nested objects and arrays.

## When not to use

- The data is internal to one function.
- The object is an active domain entity.
- An array is the actual boundary format and mapping adds no safety.

## Testing

Test mapping from source and to output. Test nullable and empty collections. Add serializer round-trip tests.

## Refactoring path

1. Extract the array shape into a readonly class.
2. Type and promote the fields.
3. Update call sites and mappers.
4. Add boundary validation.

## Related patterns

See `named-constructors.md`, `php-pattern-adapter` and `ddd-tactical.md`.
