# Phase 8 — Category FK normalization

## Model

- `Product.category_id` — canonical link to `Category` document
- `Product.category` — denormalized display name (kept for search/filters)

## Backfill

```bash
cd backend
python -m app.seed --backfill-category-ids
```

Matches product `category` text to `Category.name` (case-insensitive).

## Rename propagation

Updating a category name in Settings (`PATCH /categories/{id}`) runs `update_many` on all products with that `category_id`.

## Product API

- Create/update accepts `category_id` or `category` text
- Response includes both `category` and `category_id`
