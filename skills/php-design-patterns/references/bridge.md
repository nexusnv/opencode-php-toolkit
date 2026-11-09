# Bridge

## Problem

A class varies along two independent dimensions, such as a report type and an output format, causing a subclass matrix.

## Forces

- Both dimensions change independently.
- Composition should replace the subclass explosion.
- The abstraction should not depend on the implementation details.
- Two dimensions may be resolvable with configuration instead.

## Solution (PHP 8.1+)

```php
interface Formatter
{
    public function format(ReportData $data): string;
}

final class HtmlFormatter implements Formatter { /* ... */ }

abstract class Report
{
    public function __construct(protected readonly Formatter $formatter) {}

    abstract public function data(): ReportData;

    public function render(): string
    {
        return $this->formatter->format($this->data());
    }
}

final class SalesReport extends Report
{
    public function data(): ReportData { /* ... */ }
}
```

Abstraction and implementation vary through composition, not inheritance.

## Trade-offs

More interfaces. The split is only worth it when both dimensions genuinely vary.

## When not to use

- One dimension is fixed.
- A simple strategy parameter is enough.
- The abstraction would only forward to the implementation.

## Testing

Test each implementation against the interface and each abstraction with a fake implementation. Add a combination matrix test for rendering.

## Refactoring path

1. Identify the two variation axes.
2. Extract the implementation interface.
3. Compose the implementation into the abstraction.
4. Delete the subclass combinations.

## Related patterns

See `php-pattern-strategy` and `abstract-factory.md`.
