# Null Object

## Problem

Callers repeatedly check for `null` collaborators, and the null branch duplicates no-op behavior.

## Forces

- A missing collaborator should behave as a safe no-op.
- The no-op must not hide configuration errors.
- The interface must make the neutral behavior meaningful.
- Null Objects are not a substitute for failing fast.

## Solution (PHP 8.1+)

```php
interface AuditLog
{
    public function record(AuditEvent $event): void;
}

final class NullAuditLog implements AuditLog
{
    public function record(AuditEvent $event): void
    {
        // Intentionally discards events.
    }
}
```

Inject `NullAuditLog` only where logging is genuinely optional. Prefer an explicit `?AuditLog` when absence is meaningful to the caller.

## Trade-offs

Silent failures if the dependency was required. Discoverability suffers because the no-op is easy to miss.

## When not to use

- Missing the collaborator is a bug.
- The neutral behavior is complex or stateful.
- Returning `null` and letting the caller decide is clearer.

## Testing

Test that the null implementation satisfies the interface contract and performs no side effects. Test that required wiring fails fast.

## Refactoring path

1. Identify repeated null checks with identical no-op behavior.
2. Add an explicit null implementation.
3. Inject it at the optional boundary.
4. Keep required dependencies non-nullable.

## Related patterns

See `dependency-injection.md` and `php-pattern-strategy` for interchangeable behavior.
