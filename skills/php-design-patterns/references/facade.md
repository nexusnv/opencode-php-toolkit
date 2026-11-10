# Facade

## Problem

Callers must orchestrate many subsystem classes for one use case, and that orchestration is duplicated.

## Forces

- The subsystem is complex or legacy.
- Callers need one simple entry point.
- A facade must not become a god object.
- Hiding too much removes needed flexibility.

## Solution (PHP 8.1+)

```php
final class InvoiceService
{
    public function __construct(
        private readonly InvoiceRepository $invoices,
        private readonly TaxCalculator $tax,
        private readonly PdfRenderer $pdf,
        private readonly Mailer $mailer,
    ) {}

    public function send(InvoiceId $id): void
    {
        $invoice = $this->invoices->get($id);
        $total = $this->tax->apply($invoice);
        $this->mailer->send($invoice->customer(), $this->pdf->render($invoice, $total));
    }
}
```

Keep the facade at the use-case boundary. Do not let it absorb domain rules.

## Trade-offs

A facade can hide useful subsystem APIs and grow into a god class. It adds a forwarding layer.

## When not to use

- Callers need fine-grained control over the subsystem.
- There is only one subsystem call.
- The facade would only forward methods unchanged.

## Testing

Test the facade with fake subsystems and assert order and error handling. Test subsystem behavior separately.

## Refactoring path

1. Identify the repeated orchestration.
2. Extract it into a facade.
3. Replace duplicated caller code.
4. Move domain rules back into domain objects if they appear.

## Related patterns

See `ports-adapters.md` for boundary isolation and `mediator.md` for many-to-many coordination.
