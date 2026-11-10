# Proxy

## Problem

Access to an object needs lazy loading, access control, remote calls or caching while preserving its interface.

## Forces

- The client should not know whether it holds a real or surrogate object.
- Proxy controls access; decorator adds behavior.
- Lazy initialization must not hide errors.
- PHP has no transparent remote proxy without code generation.

## Solution (PHP 8.1+)

```php
interface Report
{
    public function render(): string;
}

final class LazyReport implements Report
{
    private ?Report $real = null;

    public function __construct(private Closure $factory) {}

    public function render(): string
    {
        return ($this->real ??= ($this->factory)())->render();
    }
}
```

Use a proxy when access is the concern. Keep the factory explicit.

## Trade-offs

Indirection and lazy failure modes. Proxy and Decorator look similar; naming the intent matters.

## When not to use

- Construction is cheap and has no access policy.
- The framework already provides lazy services.
- The proxy must change method signatures; that is an Adapter instead.

## Testing

Test that access is deferred, denied when required, and that failures surface. Assert the real object is constructed once.

## Refactoring path

1. Extract the shared interface.
2. Wrap the real object with the proxy.
3. Inject the proxy at the access boundary.
4. Add access and lazy-loading tests.

## Related patterns

See `php-pattern-decorator` for added behavior and `facade.md` for simplified access to a subsystem.
