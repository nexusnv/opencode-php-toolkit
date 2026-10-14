<?php

declare(strict_types=1);

namespace Acme\Tests;

use Acme\Calculator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class CalculatorTest extends TestCase
{
    public static function addCases(): array
    {
        return [
            'zeros' => [0.0, 0.0, 0.0],
            'positives' => [1.5, 2.5, 4.0],
        ];
    }

    #[DataProvider('addCases')]
    public function testAdd(float $a, float $b, float $expected): void
    {
        self::assertSame($expected, (new Calculator())->add($a, $b));
    }
}
