# Components

Four homes, and which one a file belongs in is decided by two independent
questions. Where did it come from, and what does it compose?

```
src/components/
  ui/    vendored from the shadcn registry, 1:1, never edited
  kit/   our wrappers over ui/ - the only thing allowed to import it
  app/   our own components, tiered by atomic design
         atoms/ molecules/ organisms/ templates/
```

The routes in `src/app` are the fifth tier, pages, and compose organisms and
templates.

## Provenance: ui and kit

`ui/` is upstream's code. Every byte is what `shadcn add --overwrite` writes,
and nothing in it is edited - not to format it, not to satisfy a lint rule, not
to drop an export nothing imports. Prettier, ESLint and knip are switched off
over it; `tsc` and `next build` are not, so what is exempt is style rather than
correctness.

`kit/` is ours. A wrapper re-exports exactly the names the app uses, which is
what keeps upstream churn in the rest from reaching a screen. Most are a single
line. One becomes a real component when it has something to add: `badge` carries
the `positive` and `caution` tones this app needs and base-nova does not ship.

A customisation that has to survive an update belongs in the wrapper. Putting it
in the vendored file works until the next refresh silently discards it.

## Tier: the app directory

| tier         | what it is                                       | here                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atoms/`     | one presentational job, composes nothing of ours | `delta-value`, `empty-state`, `field`, `field-row`, `figure-input`, `labelled-switch`, `note`, `row-action`, `screen-body`, `screen-header`, `section-header`, `span-bar`, `tile-grid`                                                                                                                                                                                                      |
| `molecules/` | atoms combined into one reusable control         | `age-field`, `app-nav`, `confirm-dialog`, `edit-dialog`, `money-field`, `month-field`, `rate-field`, `row-actions`, `section-card`, `select-field`, `stat-tile`, `term-field`, `text-field`, `theme-toggle`, `year-field`                                                                                                                                                                   |
| `organisms/` | a whole region of a screen                       | `account-dialog`, `account-fields`, `account-ledger`, `account-table`, `asset-table`, `car-dialog`, `car-fields`, `cash-flow-card`, `employment-fields`, `expense-schedule`, `house-dialog`, `house-fields`, `income-schedule`, `line-fields`, `loan-fields`, `owner-list`, `payment-order`, `progress-points`, `projection-board`, `projection-chart`, `sacrifice-fields`, `schedule-rows` |
| `templates/` | the shell a page sits in                         | `app-frame`                                                                                                                                                                                                                                                                                                                                                                                 |

A component composes what is below it, and beside it, never above.
Organism-on-organism is the one same-tier edge this allows, and there are
nineteen of them: `account-ledger` on `account-dialog`, `account-table`,
`asset-table`, `car-dialog`, `house-dialog`, `owner-list` and `payment-order`,
`account-dialog` on `account-fields` and `sacrifice-fields`, `car-dialog` on
`car-fields`, `house-dialog` on `house-fields`, each of `car-fields` and
`house-fields` on `loan-fields`, `income-schedule` on `employment-fields`, each
of the two schedules on both `line-fields` and `schedule-rows`, and
`projection-board` on `projection-chart`.

## Placing a new component

Ask what it composes, not how big it is. Size correlates but does not decide.

1. Does it compose none of our components and hold no state of its own? It is an
   atom. An atom may wrap one primitive, from `kit/` or from Base UI directly as
   `field` does, to give it this app's grammar.
2. Does it combine atoms, or more than one `kit/` primitive, into one control,
   or give a control state of its own? It is a molecule. `theme-toggle` is one
   atom, the labelled switch, and is a molecule because it reads and sets the
   theme.
3. Does it own a region of a screen - a table with its empty state, a schedule
   with its dialogs? It is an organism.
4. Does it arrange regions without knowing what goes in them? It is a template.

A useful check: the tiers correlate with how much `kit/` a component reaches
for. An atom imports at most one wrapper, a molecule one or two, and the
organisms take one to five, most of them three or more. A proposed atom that
needs four wrappers is probably a molecule or an organism.

If a component seems to belong in two tiers it is usually two components.

## What is enforced, and by what

Nothing here relies on being remembered.

- `no-restricted-imports` bars everything outside `kit/` from importing
  `@/components/ui/*`, bars each tier from importing a tier above it, and bars
  everything outside `src/app` from importing `@/app/*`: the routes are the top
  tier, so a server action lives under `src/actions` and a store under
  `src/store`, where an organism or a template can reach them.
- `bun run cycles` catches the loop that the permitted same-tier edge makes
  possible. It is oxlint rather than ESLint's `import/no-cycle`, which walked
  the import graph once per file and cost 76% of the whole lint run.
- `.github/workflows/vendor.yml` re-runs `shadcn add --overwrite` weekly and
  opens a pull request if `ui/` has drifted from the registry. That check is
  what the style exemptions rest on.
- knip reports a wrapper export nothing imports, which is what keeps `kit/`
  narrowed to the app's actual surface.

Coverage is 100% per file everywhere except `ui/`, which is excluded because it
is not ours to cover. See AGENTS.md for the reasoning, and the `shadcn-add`
skill for taking or updating a component.
