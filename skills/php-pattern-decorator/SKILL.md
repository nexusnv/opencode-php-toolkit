---
name: PHP Decorator Pattern
description: Layer behavior around an existing PHP object without subclass explosion. Use when logging, caching, retries or validation must wrap a service and remain independently testable.
---

# PHP Decorator Pattern

## Problem

Cross-cutting behavior (logging, caching, retries, authorization) is duplicated in several
classes, or a subclass is created for every combination of features.

## Forces

- The wrapped object must keep the same contract.
- Features should combine in any order.
- Each layer should be testable alone.
- PHP has no multiple inheritance, so subclass combinations grow quickly.

## Solution (PHP 8.1+)

```php
interface ExchangeRateProvider
{
    public function rate(Currency $from, Currency $to): Rate;
}

final readonly class CachedRates implements ExchangeRateProvider
{
    public function __construct(
        private ExchangeRateProvider $inner,
        private Cache $cache,
    ) {}

    public function rate(Currency $from, Currency $to): Rate
    {
        $key = "rate:{$from->value}:{$to->value}";

        return $this->cache->remember(
            $key,
            fn (): Rate => $this->inner->rate($from, $to),
        );
    }
}

$provider = new CachedRates(
    new RetryingRates(new HttpRates($client)),
    $cache,
);
```

Decorators implement the same interface and forward every other call. Keep each decorator
focused on one behavior.

## Trade-offs

Adds one class per feature and can make stack traces deeper. Order matters and must be
explicit at the composition root. Identity checks (`instanceof`) become unreliable through
wrappers.

## When not to use

- Behavior must change the object's own type or replace its state.
- A single fixed behavior can live directly in the class.
- Framework middleware already provides the same layering for HTTP requests.

## Testing

Use a fake inner implementation and assert the decorator adds behavior once, forwards
arguments, and preserves results and exceptions. Test the composition order separately.

## Refactoring path

1. Extract the shared behavior into a class implementing the service interface.
2. Inject the inner service and forward calls.
3. Replace the original construction with the wrapper stack.
4. Remove duplicated behavior from concrete services.

## Related patterns

Proxy controls access rather than adding behavior. Adapter changes the interface. See
`references/proxy.md` and `references/chain-of-responsibility.md`.
