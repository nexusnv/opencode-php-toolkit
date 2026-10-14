<?php

declare(strict_types=1);

namespace Acme;

final class Calculator
{
    public function add(float $a, float $b): float
    {
        return $a + $b;
    }
}
