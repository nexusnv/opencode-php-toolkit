# Template Method

## Problem

Several classes share the same algorithm skeleton but differ in a few steps.

## Forces

- The step order must not be overridden.
- Subclasses should override only the variable steps.
- Inheritance couples subclasses to the base class.
- Composition often replaces this pattern in PHP.

## Solution (PHP 8.1+)

```php
abstract class Importer
{
    final public function import(string $path): ImportReport
    {
        $rows = $this->read($path);
        $valid = array_values(array_filter($rows, fn (array $row): bool => $this->isValid($row)));
        $this->persist($valid);

        return new ImportReport(count($rows), count($valid));
    }

    abstract protected function read(string $path): array;
    abstract protected function isValid(array $row): bool;
    abstract protected function persist(array $rows): void;
}
```

Mark the template `final` so the skeleton cannot be broken. Keep hooks small.

## Trade-offs

Inheritance is rigid; a subclass cannot change the order or reuse one step. One hierarchy per variation axis.

## When not to use

- The steps can be injected as collaborators.
- More than one axis varies.
- The base class would need many optional hooks.

## Testing

Test the template once with a recording subclass. Test each concrete subclass's overridden steps.

## Refactoring path

1. Extract the shared skeleton.
2. Move variable steps into abstract or overridable methods.
3. Make the template final.
4. Consider replacing inheritance with injected steps.

## Related patterns

See `php-pattern-strategy` for composition and `php-pattern-decorator` for layered behavior.
