---
name: Currency formatting
description: Shared INR currency formatting utilities — location and usage rule for admin and mobile
---

## Rule

Never use inline `₹${amount.toFixed(2)}` — always import the shared utility.

**Why:** Locale-aware formatting (en-IN) produces `₹1,234.50` instead of `₹1234.50`. Centralising avoids drift between pages.

## Admin dashboard

```ts
import { formatINR } from "@/lib/utils";
// formatINR(1234.5) → "₹1,234.50"
```

File: `artifacts/admin-dashboard/src/lib/utils.ts`

## Mobile

```ts
import { formatINR } from "@/utils/formatCurrency";
// formatINR(1234.5) → "₹1,234.50"
```

File: `artifacts/mobile/utils/formatCurrency.ts`

## How to apply

- Any new admin page showing a money amount: import `formatINR` from `@/lib/utils`
- Any new mobile screen showing a money amount: import `formatINR` from `@/utils/formatCurrency`
- Both functions have identical signatures: `formatINR(amount: number): string`
