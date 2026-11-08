# Command

## Problem

A user action or queued operation needs to be represented as a value so it can be validated, logged, retried or undone.

## Forces

- The operation must survive a queue or process boundary.
- Undo/redo or audit history is required.
- Commands must stay small and serializable.
- A command is not the same as a domain event.

## Solution (PHP 8.1+)

```php
final readonly class RefundPayment
{
    public function __construct(
        public PaymentId $paymentId,
        public Money $amount,
        public string $reason,
    ) {}
}

final readonly class RefundPaymentHandler
{
    public function __construct(private PaymentGateway $gateway) {}

    public function __invoke(RefundPayment $command): RefundResult
    {
        return $this->gateway->refund($command->paymentId, $command->amount);
    }
}
```

Serializers and validators live at the edge. Handlers may be sync or queued without changing the command.

## Trade-offs

One class per operation. Invokers and handlers add indirection. For a single in-process action, a method call is simpler.

## When not to use

- The operation has no queue, audit or undo requirement.
- A domain method already expresses the action clearly.
- You would only wrap the method in a one-field DTO.

## Testing

Test handlers with fake ports. Test command validation separately. For undo, test command/memento round-trips.

## Refactoring path

1. Extract the action arguments into a readonly command.
2. Move execution into an invokable handler.
3. Route the caller through the invoker or queue.
4. Add serialization and idempotency tests.

## Related patterns

See `memento.md` for undo state and `cqrs.md` when commands are separated from queries.
