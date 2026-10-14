# PHPUnit vs Pest — quick reference

- PHPUnit 10/11: `phpunit.xml`, attributes (`#[Test]`, `#[DataProvider]`), `--testdox --filter`.
- Pest 2/3: `tests/Pest.php`, `it()`, `dataset()`,arch presets. Runs on PHPUnit engine.
- Data providers over duplication in both. Prefer `assertSame` (strict) over `assertEquals`.
- Coverage: `XDEBUG_MODE=coverage vendor/bin/phpunit --coverage-text --coverage-html=build/coverage`.
