# MBI Opportunities Hub Migration Process

This document records the full process used to convert the product from the legacy HTML shell into a Next.js App Router application.

## Goal

Move the product from a legacy `index.html` iframe-based entrypoint to a proper Next.js app while preserving the existing API contract.

## What was done

### 1) Inspected the existing project structure
- Reviewed `package.json` to confirm the stack and available scripts.
- Checked the `app/` directory for the current Next.js structure.
- Inspected the legacy `index.html` to understand the original frontend shell.
- Reviewed `lib/db.ts` and `lib/cors.ts` to confirm shared backend helpers existed.
- Inspected the legacy API files under `api/` to preserve behavior.

### 2) Confirmed the migration gap
- Found that `app/page.tsx` was still reading and rendering the legacy `index.html`.
- Confirmed the app had no App Router API route handlers yet.
- Verified that the product was still depending on the old HTML shell instead of a native Next page.

### 3) Planned the Next.js migration approach
- Keep the shared legacy business logic in `lib/legacy-api.ts`.
- Add an App Router route handler to expose the existing `/api/*` contract.
- Replace the homepage iframe/HTML shell with a real Next.js landing page.
- Keep the app visually polished and verify it in a browser.

### 4) Added App Router API support
- Created `app/api/[...path]/route.ts`.
- Wired it to the shared handler in `lib/legacy-api.ts`.
- Preserved the legacy API behavior through the App Router.

### 5) Replaced the legacy homepage
- Rewrote `app/page.tsx` as a native Next.js landing page.
- Added sections describing the product, the migrated architecture, and the API routes.
- Removed the dependency on `index.html` for the main entrypoint.

### 6) Fixed TypeScript issues
- Ran `npm run typecheck`.
- Found strict null-check errors in `lib/legacy-api.ts`.
- Updated the `rowCount` checks to safely handle nullable values.

### 7) Verified production build
- Ran `npm run build`.
- Confirmed the build completed successfully.

### 8) Verified runtime behavior in the browser
- Started the dev server with `npm run dev`.
- Opened the app in a browser.
- Confirmed the homepage rendered correctly.
- Confirmed the favicon 404 was removed by adding `app/favicon.ico`.

## Completed task checklist

- [x] Inspect current Next.js conversion and API structure
- [x] Inspect legacy product entry and assets
- [x] Inspect app and route structure
- [x] Inspect root project structure
- [x] Inspect Next page/layout and existing API implementation
- [x] Inspect migration notes or prior task context
- [x] Identify remaining migration work
- [x] Inspect TypeScript/Next import setup
- [x] Verify dependencies and app shell
- [x] Inspect DB and CORS helpers
- [x] Read legacy API route implementations
- [x] Confirm TS import paths
- [x] Inspect app shell styles
- [x] Read current homepage implementation fully
- [x] Inspect shared legacy handler exports
- [x] Inspect global styles
- [x] Read full shared legacy handler implementation
- [x] Add App Router API route handlers for legacy endpoints
- [x] Replace iframe homepage with real Next landing page
- [x] Fix TypeScript strict-null errors
- [x] Verify build/type/runtime behavior
- [x] Verify browser runtime behavior
- [x] Remove missing favicon 404

## Notes for future updates

When new migration work is added, update this file with:
- the new task
- the reason for the change
- the files modified
- the verification performed

## Final result

The product now runs as a Next.js App Router app with:
- a native homepage
- preserved API compatibility
- successful typecheck and build
- verified browser rendering
