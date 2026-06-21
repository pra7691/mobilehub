---
name: Public legal pages
description: How public Privacy Policy and Terms pages are implemented — routes, API, component
---

## Rule

Public pages live in the admin dashboard SPA (React/wouter) and call the NestJS API with no auth.

**Why:** The admin dashboard Vite SPA is already served at `/` in production, so adding routes to its Router is the simplest path for public static-like pages. A separate static server is not needed.

## API

`GET /api/public/legal/:slug` → `PublicLegalController` in `settings.controller.ts`
- No auth guard
- Slugs: `privacy-policy`, `terms-and-conditions`
- Returns `{ title, content, version, updatedAt }` if published
- Returns 404 if content is unpublished or empty (never leaks draft content)
- Calls the same `SettingsService.getLegal()` used by the mobile app

## Admin dashboard

- Component: `artifacts/admin-dashboard/src/pages/public-page.tsx`
- Routes in `App.tsx`: `/privacy-policy` and `/terms-and-conditions` placed BEFORE `/login` so they are never redirected to the login page

## How to apply

- To add a new public legal-style page: add a row to `app_settings` with `isPublished=true`, add a new slug case in `LEGAL_KEYS` in `settings.service.ts`, add a route in `App.tsx`
- To update content: use Admin Settings → Legal editor in the admin UI
