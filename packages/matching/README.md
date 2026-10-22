# @homeward/matching

Pure matching logic (spec §5): compares a listing's criteria with an adopter's private household answers and explains every result. No I/O; the same inputs always give the same result.

```ts
const { summary, criteria } = evaluateMatch({ criteria, adoptionFee, household, distanceKm });
// summary: 'strong' | 'possible' | 'conflicts'
// criteria[i]: { kind, level, state: 'match' | 'conflict' | 'unknown', criterion, adopter }
```

## Rules

**Unknown** always means the adopter hasn't answered (or the comparison isn't possible). It is never guessed.

| Criterion                               | Match                                                   | Conflict                               |
| --------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| Children                                | No children; or children allowed and youngest ≥ min age | Adults-only; or youngest < min age     |
| Other animals                           | That kind of animal isn't in the home, or is allowed    | It's in the home and not allowed       |
| Experience                              | Adopter's level ≥ minimum (none < some < experienced)   | Below the minimum                      |
| Home type / setting                     | Adopter's value is in the allowed list                  | Not in the list                        |
| Garden                                  | Has a garden (fully fenced, if required)                | No garden; or not secure when required |
| Step-free                               | Home is step-free                                       | It isn't                               |
| Landlord permission                     | Owner; or renter with permission                        | Renter without permission              |
| Time alone                              | Typical hours alone ≤ maximum                           | More than the maximum                  |
| Medical care, diet, behavioural support | Willing                                                 | Not willing                            |
| Distance                                | Within the maximum distance                             | Further away                           |
| Home visit, several visits              | Agrees                                                  | Doesn't                                |
| **Fee** (derived)                       | Fee ≤ adopter's maximum (same currency)                 | More than their maximum                |

- **Levels:** each criterion is `required` or `preferred`; any other value counts as preferred. A fixed adoption fee counts as required; a suggested donation as preferred. Different currencies aren't converted, so they're unknown.
- **New criterion types** this version doesn't know are reported as unknown, never guessed.
- **Summary:** any required conflict → `conflicts`. Every required criterion matched, no preferred conflicts and at least one match → `strong`. Anything else → `possible`.
- **Privacy:** results carry the adopter's answers only when they were actually compared, never for unknowns. The adopter sees them; an organisation sees them only through a share link the adopter sends (#42).
