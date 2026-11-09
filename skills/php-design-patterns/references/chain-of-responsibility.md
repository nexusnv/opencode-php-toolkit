# Chain of Responsibility

## Problem

A request must pass through an ordered set of handlers, and each handler may handle it, modify it, or stop the chain.

## Forces

- Handler order matters and should be explicit.
- New handlers should be addable without editing callers.
- Every request must have a defined outcome when nobody handles it.
- Unbounded chains can hide failures.

## Solution (PHP 8.1+)

```php
interface ApprovalHandler
{
    public function handle(Expense $expense): ApprovalResult;
}

final class ManagerApproval implements ApprovalHandler
{
    public function __construct(private readonly ?ApprovalHandler $next = null) {}

    public function handle(Expense $expense): ApprovalResult
    {
        if ($expense->amount->isAtMost(Money::eur(500))) {
            return ApprovalResult::approved('manager');
        }

        return $this->next?->handle($expense)
            ?? ApprovalResult::rejected('no approver');
    }
}
```

Build the chain at the composition root. Make the terminal outcome explicit.

## Trade-offs

Chains are harder to trace and test as a whole. Ordering bugs are silent. Middleware frameworks already implement this pattern for HTTP.

## When not to use

- There is one fixed handler.
- The handlers are a simple list that can be looped over explicitly.
- Failure when unhandled is unacceptable and a direct switch is clearer.

## Testing

Test each handler's decision and forwarding. Test the assembled chain, including the unhandled case and ordering.

## Refactoring path

1. Extract handler logic into uniform classes.
2. Add explicit next links or a middleware pipeline.
3. Assemble the chain in one place.
4. Add order and fallback tests.

## Related patterns

See `php-pattern-decorator` for wrapping behavior and `mediator.md` for centralized coordination.
