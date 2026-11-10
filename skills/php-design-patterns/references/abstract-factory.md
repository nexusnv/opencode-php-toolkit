# Abstract Factory

## Problem

A family of related objects must be created together, such as a UI kit or a storage set, without callers knowing the concrete family.

## Forces

- Products in a family must stay consistent.
- Families may be selected from configuration.
- Constructor wiring can explode.
- Named constructors or a container often replace this pattern.

## Solution (PHP 8.1+)

```php
interface FileStoreFactory
{
    public function writer(): FileWriter;
    public function reader(): FileReader;
}

final class S3StoreFactory implements FileStoreFactory
{
    public function __construct(private readonly S3Client $client) {}

    public function writer(): FileWriter { return new S3Writer($this->client); }
    public function reader(): FileReader { return new S3Reader($this->client); }
}
```

Select one factory at the composition root. Keep product interfaces small.

## Trade-offs

One factory per family and one interface per product. Adding a product changes every factory.

## When not to use

- Only one product varies.
- The container can wire the family directly.
- The products are unrelated.

## Testing

Test each factory family with a contract test for every product interface. Test that a family is never mixed.

## Refactoring path

1. Group the related products.
2. Extract product interfaces.
3. Add a factory per family.
4. Select the factory at the composition root.

## Related patterns

See `bridge.md`, `factory-method` concepts in `named-constructors.md`, and `dependency-injection.md`.
