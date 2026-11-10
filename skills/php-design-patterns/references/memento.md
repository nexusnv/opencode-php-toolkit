# Memento

## Problem

An object must support undo or restore without exposing its internal state.

## Forces

- State snapshots may be large.
- The originator owns its invariants.
- History retention needs a policy.
- Serialization format can become a compatibility contract.

## Solution (PHP 8.1+)

```php
final class EditorMemento
{
    public function __construct(private readonly string $content, private readonly int $cursor) {}

    public function restoreInto(Editor $editor): void
    {
        $editor->restore($this->content, $this->cursor);
    }
}

final class Editor
{
    private string $content = '';
    private int $cursor = 0;

    public function memento(): EditorMemento
    {
        return new EditorMemento($this->content, $this->cursor);
    }

    public function restore(string $content, int $cursor): void
    {
        $this->content = $content;
        $this->cursor = $cursor;
    }
}
```

Expose only opaque mementos to the history owner. Apply a retention limit.

## Trade-offs

Memory growth and snapshot cost. Mementos can become a second model that drifts from the real one.

## When not to use

- State is tiny and a value object already captures it.
- Undo is not a product requirement.
- Event sourcing already provides history.

## Testing

Test save/restore round-trips, multiple undo steps, and retention limits. Test invalid or old snapshots.

## Refactoring path

1. Identify state that must survive undo.
2. Capture it in an opaque memento.
3. Add history with a cap.
4. Route undo through restore methods.

## Related patterns

See `command.md` for undoable operations and `event-sourcing.md` for full history.
