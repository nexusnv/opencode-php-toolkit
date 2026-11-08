---
name: PHP Design Patterns
description: Problem-first PHP design-pattern guidance. Use when behavior varies by implementation, external interfaces need adapting, behavior needs incremental extension, object behavior depends on state, or a named pattern (strategy, adapter, decorator, state, repository) is requested.
---

# PHP Design Patterns

Start from the engineering problem, then choose the smallest solution. Gang of Four
names are vocabulary, not a checklist. Idiomatic PHP 8.1+ (enums, readonly DTOs, named
constructors, first-class callables, composition) usually beats a classic pattern.

## Problem to pattern

| Engineering problem | Relevant patterns/concepts |
| --- | --- |
| Behavior varies by implementation | Strategy, polymorphism, first-class callables |
| Integrating different external interfaces | Adapter, Ports & Adapters |
| Behavior needs incremental extension | Decorator, middleware |
| Object behavior depends on state | State, state machine, native enums |
| Changes need to notify interested components | Observer, Domain Events |
| Object construction is complex | Builder, Factory Method, named constructors |
| Persistence needs an explicit boundary | Repository, persistence gateway, DAO |
| Infrastructure needs isolation | Ports & Adapters, Dependency Injection |
| Legacy integration needs a seam | Anti-Corruption Layer, Strangler Fig |
| Traversal over a heterogeneous structure | Visitor, Iterator |
| Undo/redo or queued operations | Command, Memento |
| Query/report complexity | CQRS, read models |
| Transaction boundaries across aggregates | Unit of Work |
| Cross-cutting concerns | Decorator, Proxy, middleware |
| Complex subsystem | Facade |

## Selection rule

Introduce a pattern only when all four hold:

1. A named pain exists: variation, coupling, construction complexity, or a boundary leak.
2. The forces are understood: change frequency, number of variants, test seams, team size,
   PHP version.
3. The pattern removes more complexity than it adds.
4. You can state the trade-off and the rejected simpler option.

Say what you are **not** doing as clearly as what you are doing.

## Guardrails

- Avoid Singleton for application-wide dependency management.
- Avoid Service Locator; it hides dependencies.
- Prefer composition when it makes dependencies and behavior clearer.
- Do not add an interface or factory without a real second implementation or test seam.
- Repository is not automatically good. A simple persistence service or DAO may be enough.
- Inheritance and static methods are not automatically bad; judge coupling, testability and
  clarity.
- If a pattern makes tests harder, reconsider the pattern.

## Core skills

Read one of these when the prompt names a promoted pattern:

- `php-pattern-strategy` for interchangeable algorithms.
- `php-pattern-adapter` for translating a third-party or legacy interface.
- `php-pattern-decorator` for layered behavior without subclassing.
- `php-pattern-state` for behavior that changes with an object's state.

## References

Read at most two reference files per task, only after the problem is clear:

- `references/repository.md`, `references/ports-adapters.md` — persistence and infrastructure
  boundaries.
- `references/command.md`, `references/composite.md`, `references/facade.md`,
  `references/proxy.md`, `references/chain-of-responsibility.md` — request handling and
  structure.
- `references/specification.md`, `references/unit-of-work.md`, `references/cqrs.md`,
  `references/event-sourcing.md`, `references/ddd-tactical.md` — domain and data concerns.
- `references/anti-corruption-layer.md`, `references/strangler-fig.md` — legacy seams.
- `references/null-object.md`, `references/template-method.md`, `references/visitor.md`,
  `references/iterator.md`, `references/mediator.md`, `references/memento.md`,
  `references/flyweight.md`, `references/bridge.md`, `references/abstract-factory.md`,
  `references/prototype.md`, `references/singleton.md`, `references/object-pool.md` — classic
  catalog entries.
- `references/dependency-injection.md`, `references/enums-as-state.md`,
  `references/readonly-dto.md`, `references/named-constructors.md`,
  `references/first-class-callables.md`, `references/generators.md`,
  `references/attributes.md`, `references/traits-vs-composition.md` — PHP 8.1+ idioms that
  often replace a pattern.
