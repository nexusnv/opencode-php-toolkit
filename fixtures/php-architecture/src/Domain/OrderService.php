<?php
namespace App\Domain;

use App\Infrastructure\Database;

final class OrderService
{
    public function __construct(private Database $database) {}

    public function execute(string $kind): void
    {
        switch ($kind) {
            case 'one': break;
            case 'two': break;
            case 'three': break;
        }
        $service = new class {};
    }
}
