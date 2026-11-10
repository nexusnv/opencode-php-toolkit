# Prototype

## Problem

Creating a new object is expensive or requires copying a configured instance with small changes.

## Forces

- Cloning must preserve or intentionally reset internal state.
- Deep vs shallow copy must be explicit.
- `__clone` is easy to get wrong for nested objects.
- Immutable value objects can often be rebuilt instead.

## Solution (PHP 8.1+)

```php
final class ReportTemplate
{
    /** @param list<Section> $sections */
    public function __construct(
        public string $title,
        public array $sections = [],
    ) {}

    public function __clone()
    {
        $this->sections = array_map(
            fn (Section $section): Section => clone $section,
            $this->sections,
        );
    }
}

$copy = clone $template;
$copy->title = 'Monthly report';
```

Implement `__clone` only when nested objects must be detached. Prefer `readonly` objects and rebuild them.

## Trade-offs

Cloning bypasses constructors and validation. Deep-copy rules are easy to forget.

## When not to use

- The object is immutable; create a modified copy with a named constructor.
- Construction is cheap.
- The clone would need most fields reset.

## Testing

Test that clones are independent for nested mutable state and that validation still holds.

## Refactoring path

1. Identify the expensive or configured instance.
2. Decide which state is shared and which is copied.
3. Implement `__clone` for nested objects.
4. Add copy-independence tests.

## Related patterns

See `readonly-dto.md` and `named-constructors.md`.
