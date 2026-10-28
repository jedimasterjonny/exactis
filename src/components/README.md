# Components

Four homes, and which one a file belongs in is decided by two independent
questions. Where did it come from, and what is it for?

```
src/components/
  ui/    vendored from the shadcn registry, 1:1, never edited
  kit/   our wrappers over ui/ - the only thing allowed to import it
  app/   our own components, tiered by atomic design
         atoms/ molecules/ organisms/ templates/
```

The routes in `src/app` are the fifth tier, pages, and compose from any tier
beneath them.

## Provenance: ui and kit

`ui/` is upstream's code. Every byte is what `shadcn add --overwrite` writes,
and nothing in it is edited - not to format it, not to satisfy a lint rule, not
to drop an export nothing imports. Prettier, ESLint and knip are switched off
over it; `tsc` and `next build` are not, so what is exempt is style rather than
correctness.

`kit/` is ours. A wrapper re-exports exactly the names the app uses, which is
what keeps upstream churn in the rest from reaching a screen. Most are a single
re-export. One becomes a real component when it has something to add: `badge`
carries the `positive` and `caution` tones this app needs and base-nova does not
ship, and `alert` the `caution` one; `button` spins while its action runs, which
`alert-dialog` passes on to its confirm; `table` makes each table the container
its rows fold by and lines its cells up with a card's edge; and `chart` closes
its tooltip when a finger lands outside it.

A customisation that has to survive an update belongs in the wrapper. Putting it
in the vendored file works until the next refresh silently discards it.

## Tier: the app directory

| tier         | what it is                                                   | here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atoms/`     | whole: one control, graphic, text, table or box              | `balance-dates`, `cell-select`, `curve-chart`, `delta-value`, `field`, `field-row`, `figure-input`, `glide-chart`, `house-prices-pull`, `ledger`, `legend-table`, `note`, `pin-bar`, `row-action`, `row-lock`, `row-opener`, `screen-body`, `screen-header`, `screen-label`, `segment-bar`, `share-bar`, `source-dates`, `span-bar`, `span-ruler`, `spread-bar`, `tile-grid`, `worksheet`, `year-age`, `year-strip`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `molecules/` | atoms joined to do one job together                          | `age-field`, `app-nav`, `caution`, `confirm-dialog`, `dialog-frame`, `empty-state`, `export-menu`, `figure-field`, `folded-lines`, `labelled-switch`, `milestone-chips`, `month-field`, `radio-choice`, `row-actions`, `scenario-banner`, `screen-tabs`, `section-header`, `select-field`, `stat-tile`, `text-field`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `organisms/` | a distinct section: a region, a dialog and its form, a chart | `account-dialog`, `account-fields`, `account-ledger`, `balance-sheet`, `car-dialog`, `car-fields`, `cash-flow-card`, `chance-board`, `chance-tile`, `child-list`, `cma-worksheet`, `cogitator-board`, `custom-rates`, `edit-dialog`, `employment-fields`, `expense-schedule`, `folded-cell`, `futures-count`, `futures-drawn`, `futures-fan`, `futures-outcomes`, `glide-path`, `house-dialog`, `house-fields`, `household-import`, `income-schedule`, `inflation-source`, `line-fields`, `loan-fields`, `milestone-dialog`, `milestone-list`, `milestone-spreads`, `money-flow`, `month-end`, `owner-list`, `plan-assumptions`, `progress-chart`, `progress-points`, `progress-year`, `projection-board`, `projection-chart`, `rate-set`, `sacrifice-fields`, `scenario-menu`, `schedule-rows`, `section-card`, `state-pension`, `target-allocation`, `target-table`, `theme-toggle` |
| `templates/` | a page's layout: what goes where, not what it shows          | `app-frame`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

A component composes what is below it, never above, and only an organism
composes beside it. Organisms may compose organisms, as the cards compose the
section card and the dialogs the edit dialog, and `bun run cycles` catches the
loop that freedom makes possible.

## Placing a new component

Ask what it is for before what it imports. The tiers are Brad Frost's, from
[_Atomic Design_](https://atomicdesign.bradfrost.com/chapter-2/), and he calls
them "a mental model" rather than a sequence, so a tier names the part a
component plays in the interface rather than how deep it sits in the import
graph. Neither its size nor its state decides: a 134-line bar that is one mark
is an atom, and a button that calls a server action and raises a toast is still
one control.

Ask these in order and stop at the first yes.

1. Does it lay out a whole page, placing organisms and knowing which goes where
   but not the content they show? It is a template, since Frost's templates
   "place components into a layout and articulate the design's underlying
   content structure", leaving the content to the page. Only a page-level layout
   is one, as `app-frame` lays out the shell; the frame of a card or a dialog
   never is.
2. Is it a distinct section of a screen or of the shell, made of several units,
   its own or slotted in by its caller? It is an organism, since Frost's
   organisms "form distinct sections of an interface", as his header holds a
   logo, a navigation and a search form. The screen's header is one, the band
   each screen opens with, and so are a card and what it holds, a run of tiles,
   a schedule's rows, a dialog with its form and the set of fields that is a
   dialog's body. A card's header and a dialog's frame are not, being the head
   and the frame of a section rather than sections of their own. Nor is a unit
   that does one job, however wide it runs: a nav or a row of tabs, or a banner,
   a caution, an empty state, a tile or a dialog asking one question, each
   saying one thing, as the alert that Frost's Pattern Lab files among its
   molecules does. A chart is an organism, a figure assembled from series,
   scales and markers and read through a tooltip or the keys. A single mark,
   bar, track or ruler drawn beside the words that state it is not a chart but
   one graphic, which is an atom.
3. Is it atoms joined to do one job together? It is a molecule. Frost's atoms
   are abstract until they are combined, when they "suddenly have purpose": in
   his search form the label names the input and the button submits it, so the
   three search together. It need hold no control of its own. Several controls
   acting as one are a molecule: a nav's links, a button and its menu, a row of
   tabs or chips, a pencil and a bin, or a dialog's Cancel and confirm. So is a
   label with its input, as a field with its control or a radio with its
   description, and so is a surface whose parts say one thing: an icon over a
   title and a sentence, a scenario's name beside the way back out of it, a
   label over a figure, a card's label, title and line, or a dialog frame's
   eyebrow, title, body and footer.
4. Otherwise it is an atom, what Frost calls an element that "can't be broken
   down any further without ceasing to be functional": one control, one graphic,
   one block of text, one table or list of the caller's rows, or one layout box.
   A glyph hidden from the accessibility tree decorates the text it sits in
   rather than being a part of its own, and a slider whose track is drawn as a
   picture, hidden the same way, is still one control. A year over the age
   reached in it is one block of text, one fact shown two ways. An atom may wrap
   one primitive, from `kit/` or from Base UI directly, to give it this app's
   grammar, or the two halves of one control, as `figure-input` wraps Base UI's
   number field, which parses and steps, and the kit's input, which draws it.
   `field` is an atom though it holds a label and a hint, because Base UI wires
   both through context to a control `field` does not own, so neither works
   apart. `field` with its control is the molecule, which is why `select-field`
   and `month-field` render Base UI's `Field.Control` themselves.

Then check what it imports. Frost's hierarchy is still built up, an organism
from molecules, atoms and other organisms and a molecule from atoms, so the
imports set a floor under the tier. An atom imports none of the components in
`app/`, a molecule only atoms, and an organism or a template anything below a
template, and only an organism imports its own tier. A page may import any of
them, and no component imports a page. A component can sit above the floor its
imports set, never below it, and where the role puts it below, the role missed a
unit. Either the component goes up, as a molecule that imports a molecule is an
organism, and the check runs again on whatever imports it, since one promotion
can lift the next; or, where an organism would need a template, it is drawing a
page, and the page-shaped part moves up into the route. The floor wins, because
the lint holds it and a role is judged, so a control that composes a molecule is
an organism even where it is no section of its own.

A useful check, though it only runs one way. An atom imports at most one `kit/`
wrapper. A molecule reaches the rest of what it draws through the atoms it
composes, so it imports at most two, as `export-menu` does the dropdown menu and
the sidebar's button; an organism imports at most three. So a proposed atom
reaching for two is probably a molecule, a molecule reaching for three is
probably an organism, and either may hold a part still to be lifted out, as the
dialog frame was out of the edit dialog. The floor is zero at every tier, so a
low count says nothing: many of the organisms import no wrapper at all, because
one built out of molecules and organisms rather than primitives, as most of the
`*-fields` and `*-dialog` here are, reaches for them at one remove. Not all are:
`house-fields` takes the kit's button beside what it composes,
`milestone-dialog` the kit's button and radio group, and `edit-dialog` gives the
dialog frame its buttons. The count is of `kit/` imports alone, so it does not
see a component reaching Base UI directly, as `figure-input` does for its number
field and `year-strip` for its slider.

If a component seems to belong in two tiers it is usually two components.

## What is enforced, and by what

A component's role is judged, by the questions above. Nothing else here relies
on being remembered.

- `no-restricted-imports` bars everything outside `kit/` from importing
  `@/components/ui/*`, bars each tier from importing a tier above it and - for
  every tier but organisms - from importing its own, and bars everything outside
  `src/app` from importing `@/app/*`: the routes are the top tier, so a server
  action lives under `src/actions` and a store under `src/store`, where an
  organism or a template can reach them.
- The same rule bars a relative import in a component, leaving `@/` as the only
  way one component names another. The tier bans are patterns over `@/…`
  specifiers, so without this one an import that reached past its tier could
  pass simply by being spelled relatively. A test keeps the relative spelling
  for its own subject, which is a reach rather than an edge.
- `bun run cycles` catches the loop that the permitted same-tier edge makes
  possible. It is oxlint rather than ESLint's `import/no-cycle`, which walked
  the import graph once per file and cost 76% of the lint's rule time.
- `.github/workflows/vendor.yml` re-runs `shadcn add --overwrite` weekly and
  opens a pull request if `ui/` has drifted from the registry. That check is
  what the style exemptions rest on.
- knip reports a wrapper export nothing imports, which is what keeps `kit/`
  narrowed to the app's actual surface.

Coverage is 100% per file everywhere except `ui/`, which is excluded because it
is not ours to cover. See AGENTS.md for the reasoning, and the `shadcn-add`
skill for taking or updating a component.
