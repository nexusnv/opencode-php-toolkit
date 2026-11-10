# Attributes

## Problem

Metadata such as routes, validation or ORM mapping is expressed in comments or parallel configuration and drifts from code.

## Forces

- PHP 8 attributes are native and reflection-readable.
- Attributes should stay declarative, not execute behavior.
- Runtime reflection costs can matter.
- Framework conventions may already cover the need.

## Solution (PHP 8.1+)

```php
#[Attribute(Attribute::TARGET_CLASS)]
final class Route
{
    public function __construct(public readonly string $path) {}
}

#[Route('/invoices')]
final class InvoiceController
{
    // ...
}

$route = (new ReflectionClass(InvoiceController::class))
    ->getAttributes(Route::class)[0]?->newInstance();
```

Keep attribute classes small. Read them in one infrastructure layer, not throughout domain code.

## Trade-offs

Reflection overhead and hidden behavior. Attributes can become configuration in disguise.

## When not to use

- Plain constructor arguments express the same thing.
- The metadata is environment-specific or secret.
- No framework consumes the attribute.

## Testing

Test the attribute reader and the behavior it triggers. Test missing and duplicate attributes.

## Refactoring path

1. Identify metadata duplicated outside code.
2. Add a narrow attribute class.
3. Read it at the infrastructure boundary.
4. Remove the parallel configuration.

## Related patterns

See `dependency-injection.md` and `named-constructors.md`.
