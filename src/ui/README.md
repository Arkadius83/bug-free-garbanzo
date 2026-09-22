# V3 UI Primitives

The V3 UI layer provides visual shells only. Application features provide all labels, values, media, callbacks, status data, and routing behavior.

## Available primitives

- `Button`: `primary`, `secondary`, `ghost`, and `icon`; supports `default`, `active`, and `disabled`.
- `StatusBadge`: neutral, cyan, purple, success, warning, and danger tones.
- `SurfacePanel`: standard, highlight, selected, and KPI surface variants.
- `Input`, `Textarea`, `Select`: native controls with optional label, helper text, error text, required, read-only, and disabled states.
- `Tabs`: controlled tabs with native button semantics and disabled tabs.
- `Toggle`: controlled native checkbox switch with an optional label.
- `Modal`: controlled dialog with backdrop close, Escape close, focused close control, body, and footer slots.
- `MediaSurface`: square, portrait, or landscape media frame with empty, highlight, and selected states.
- `DataTableShell` and `DataTableRow`: responsive semantic table shell with hover, selected-row, and empty states.

## Usage rules

- Prefer these primitives before creating feature-local visual shells.
- Keep product content in React props and children. Do not render product text into image assets.
- Use actual domain state to select visual states. Do not use `active`, `success`, or `selected` as decoration.
- Keep feature behavior, requests, routing, and persistence outside `src/ui`.
- Add a primitive only when it represents a reusable V3 shell, rather than a single screen-specific layout.
