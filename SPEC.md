# FAMILY DINNER PLANNER — Technical Specification Document

**Version:** 1.0
**Date:** February 13, 2026
**Status:** Ready for Development

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Authentication & Users](#3-authentication--users)
4. [Database Schema](#4-database-schema)
5. [Core Feature: Recipe Management](#5-core-feature-recipe-management)
6. [Core Feature: Weekly Meal Planning](#6-core-feature-weekly-meal-planning)
7. [Core Feature: Role Assignment](#7-core-feature-role-assignment)
8. [Core Feature: Shopping List Generation](#8-core-feature-shopping-list-generation)
9. [Core Feature: Week Templates](#9-core-feature-week-templates)
10. [AI Integration](#10-ai-integration)
11. [tRPC API Procedures](#11-trpc-api-procedures)
12. [State Management (Zustand)](#12-state-management-zustand)
13. [User Experience Flows](#13-user-experience-flows)
14. [UI/UX Specifications](#14-uiux-specifications)
15. [Edge Cases & Business Rules](#15-edge-cases--business-rules)
16. [Future Features (Stubbed)](#16-future-features-stubbed-for-now)
17. [Recommended Build Sequence](#17-recommended-build-sequence)
18. [Assumptions & Constraints](#18-assumptions--constraints)

---

## 1. Project Overview

A collaborative family dinner planning web application for 9+ family members. The app enables families to plan weekly dinners by slotting recipes into each day of the week, assigning cooking roles (owner + support team), and generating consolidated shopping lists from all planned meals.

### Core Problem

Coordinating nightly family dinners across 9+ people requires tracking what meals are planned, who is cooking, what ingredients are needed, and ensuring nothing falls through the cracks. This app replaces ad-hoc group text coordination with a structured, visual planning tool.

### Design Philosophy

**"Smart whiteboard"** — the app should feel flexible and low-friction. Minimal restrictions, minimal validations, maximum flexibility. Anyone can do anything. Warnings over blockers. Speed of use is paramount.

### Key Capabilities

- Create, import, and manage a shared recipe library
- Plan weekly dinners via drag-and-drop calendar interface
- Assign an owner and support team to each meal
- Scale recipe servings per meal instance
- Generate AI-consolidated shopping lists with flexible quantities
- Save and load weekly meal templates for recurring plans

---

## 2. Tech Stack

| Layer            | Technology                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| Framework        | Next.js (App Router) with TypeScript                                     |
| UI Components    | shadcn/ui (Radix primitives + Tailwind CSS)                              |
| Styling          | Tailwind CSS                                                             |
| State Management | Zustand                                                                  |
| API Layer        | tRPC (end-to-end type safety)                                            |
| Authentication   | Clerk (Email/Password + Google SSO)                                      |
| Database         | Neon (Serverless Postgres)                                               |
| ORM              | Drizzle ORM (T3 stack standard)                                          |
| AI Processing    | Anthropic Claude Haiku (recipe extraction + shopping list consolidation) |
| Deployment       | Vercel                                                                   |
| Env Management   | T3 Env (@t3-oss/env-nextjs)                                              |
| Drag & Drop      | dnd-kit (touch + mouse support)                                          |

---

## 3. Authentication & Users

### Auth Provider: Clerk

- Sign-in methods: **Email/Password** and **Google SSO**
- All authenticated users have equal permissions (no roles, no admin)
- User identity provided via Clerk user ID throughout the application
- Clerk middleware protects all routes — no public pages except sign-in/sign-up
- Use Clerk's React components for sign-in/sign-up UI (`<SignIn />`, `<SignUp />`)
- User profile data (name, avatar) pulled from Clerk — no separate user table needed

### Permission Model

Flat permissions. Every authenticated user can:

- Create, edit, and delete any recipe (subject to deletion rules)
- Assign/unassign any user (including themselves) to any meal as owner or support
- Create, edit, and clear meal plans for any week
- Generate, edit, and manage shopping lists
- Create and load week templates

### User Count

Expected: 9+ family members. The system should comfortably support up to ~25 concurrent users without performance concerns. This is a family-scale application, not a multi-tenant SaaS.

---

## 4. Database Schema

Use Drizzle ORM to define and migrate all schemas. All tables use UUID primary keys. Timestamps use ISO 8601. Soft deletes (`deleted_at`) on recipes to preserve historical data.

### Table: `recipes`

| Column       | Type         | Nullable | Notes                           |
| ------------ | ------------ | -------- | ------------------------------- |
| `id`         | UUID         | No       | Primary key, auto-generated     |
| `name`       | VARCHAR(255) | No       | Recipe display name             |
| `servings`   | INTEGER      | No       | Base serving count (default: 4) |
| `complexity` | INTEGER      | No       | 1–5 scale                       |
| `tags`       | TEXT[]       | Yes      | Array of string tags            |
| `photo_urls` | TEXT[]       | Yes      | Array of image URLs             |
| `source_url` | TEXT         | Yes      | Link to original recipe source  |
| `notes`      | TEXT         | Yes      | Freeform Markdown content       |
| `created_by` | VARCHAR(255) | No       | Clerk user ID of creator        |
| `created_at` | TIMESTAMP    | No       | Auto-set on creation            |
| `updated_at` | TIMESTAMP    | No       | Auto-updated on modification    |
| `deleted_at` | TIMESTAMP    | Yes      | Soft delete — null = active     |

### Table: `ingredients`

| Column            | Type         | Nullable | Notes                                   |
| ----------------- | ------------ | -------- | --------------------------------------- |
| `id`              | UUID         | No       | Primary key                             |
| `recipe_id`       | UUID         | No       | FK → recipes.id (CASCADE delete)        |
| `amount`          | DECIMAL      | No       | Numeric quantity (e.g., 1.5)            |
| `unit`            | VARCHAR(50)  | No       | cups, tbsp, tsp, grams, oz, whole, etc. |
| `ingredient_name` | VARCHAR(255) | No       | Display name of ingredient              |
| `sort_order`      | INTEGER      | No       | Order within recipe ingredient list     |

### Table: `meal_plans`

| Column          | Type         | Nullable | Notes                                         |
| --------------- | ------------ | -------- | --------------------------------------------- |
| `id`            | UUID         | No       | Primary key                                   |
| `date`          | DATE         | No       | **UNIQUE** — one meal per day                 |
| `recipe_id`     | UUID         | No       | FK → recipes.id                               |
| `serving_scale` | DECIMAL      | No       | Multiplier (e.g., 2.0 = double). Default: 1.0 |
| `owner_id`      | VARCHAR(255) | Yes      | Clerk user ID. Nullable (warning shown).      |
| `support_ids`   | TEXT[]       | Yes      | Array of Clerk user IDs for support team      |
| `created_at`    | TIMESTAMP    | No       | Auto-set                                      |
| `updated_at`    | TIMESTAMP    | No       | Auto-updated                                  |

**Constraint:** UNIQUE on `date` (one dinner per day).

### Table: `week_templates`

| Column       | Type         | Nullable | Notes                 |
| ------------ | ------------ | -------- | --------------------- |
| `id`         | UUID         | No       | Primary key           |
| `name`       | VARCHAR(255) | No       | Template display name |
| `created_by` | VARCHAR(255) | No       | Clerk user ID         |
| `created_at` | TIMESTAMP    | No       | Auto-set              |

### Table: `week_template_meals`

| Column          | Type    | Nullable | Notes                               |
| --------------- | ------- | -------- | ----------------------------------- |
| `id`            | UUID    | No       | Primary key                         |
| `template_id`   | UUID    | No       | FK → week_templates.id (CASCADE)    |
| `day_of_week`   | INTEGER | No       | 0=Sunday, 1=Monday, ..., 6=Saturday |
| `recipe_id`     | UUID    | No       | FK → recipes.id                     |
| `serving_scale` | DECIMAL | No       | Multiplier. Default: 1.0            |

> **Note:** Templates store recipes and scales only — NOT role assignments.

### Table: `shopping_lists`

| Column             | Type      | Nullable | Notes                  |
| ------------------ | --------- | -------- | ---------------------- |
| `id`               | UUID      | No       | Primary key            |
| `week_start_date`  | DATE      | No       | Sunday of the week     |
| `generated_at`     | TIMESTAMP | No       | When AI generation ran |
| `last_modified_at` | TIMESTAMP | No       | Last manual edit       |

### Table: `shopping_list_items`

| Column             | Type         | Nullable | Notes                              |
| ------------------ | ------------ | -------- | ---------------------------------- |
| `id`               | UUID         | No       | Primary key                        |
| `shopping_list_id` | UUID         | No       | FK → shopping_lists.id             |
| `ingredient_name`  | VARCHAR(255) | No       | Consolidated name                  |
| `estimated_amount` | VARCHAR(255) | No       | Flexible range, e.g. "3–4 onions"  |
| `source_recipes`   | TEXT[]       | Yes      | Recipe names for reference         |
| `certainty`        | DECIMAL      | No       | 0–1 AI confidence score            |
| `store_group`      | VARCHAR(100) | Yes      | Manual group (Produce, Meat, etc.) |
| `already_have`     | BOOLEAN      | No       | Default: false                     |
| `checked`          | BOOLEAN      | No       | Default: false                     |
| `manually_edited`  | BOOLEAN      | No       | Default: false                     |
| `notes`            | TEXT         | Yes      | User-added notes                   |

### Database Indexes

- `meal_plans.date` — primary query pattern for weekly views
- `recipes.name` — search/filter support
- `meal_plans.recipe_id` — FK joins and deletion checks
- `shopping_lists.week_start_date` — weekly lookup
- `recipes.deleted_at` — filter out soft-deleted records

---

## 5. Core Feature: Recipe Management

### 5.1 Manual Recipe Creation

A form-based creation flow that prioritizes speed and simplicity.

**Form Fields:**

- Name (text input, required)
- Base Servings (number input, required, default: 4)
- Complexity (1–5 slider or radio group, required)
- Tags (multi-select with autocomplete from existing tags)
- Photo(s) (file upload, optional, multiple allowed)
- Source URL (text input, optional — link to original recipe page)
- Notes (textarea with Markdown support, optional)

**Ingredient List Builder:**

- Dynamic rows: add/remove ingredient rows
- Each row has three fields: Amount (number), Unit (dropdown or freetext), Ingredient Name (text)
- Rows are drag-reorderable
- Unit dropdown should include common units: cups, tbsp, tsp, oz, lb, grams, kg, whole, pinch, dash, cloves, cans, etc.
- Allow freetext unit entry for uncommon units

### 5.2 Recipe Import: From Image

1. User clicks "Import from Photo" button
2. User uploads or captures a photo of a recipe (handwritten card, cookbook page, etc.)
3. Image is sent to Anthropic Claude Haiku with an extraction prompt
4. AI extracts: recipe name, servings, and ingredients (amount, unit, name)
5. Extracted data is displayed in the same editable form as manual creation
6. User reviews, corrects any OCR/extraction errors, then saves
7. On AI failure: show empty form with error message — user can fill manually

### 5.3 Recipe Import: From URL

1. User clicks "Import from URL" button
2. User pastes a recipe URL (e.g., allrecipes.com, food network, etc.)
3. Backend fetches the page content
4. Page content sent to Anthropic Claude Haiku for extraction
5. Same editable review form flow as image import
6. Source URL is auto-populated from the input URL

### 5.4 Recipe Editing

- Any authenticated user can edit any recipe
- Form identical to creation form, pre-filled with existing data
- Editing a recipe automatically propagates to all FUTURE meal plan instances that reference it
- Serving scale on existing meal plan instances is NOT affected by base recipe edits

### 5.5 Recipe Deletion

- Check if recipe is in any upcoming meal plans (date >= today)
- If yes: block deletion with error message: "Cannot delete — this recipe is assigned to upcoming meals. Remove it from meal plans first."
- If no: show confirmation dialog, then soft-delete (set `deleted_at` timestamp)
- Soft-deleted recipes preserved for historical meal plan data

### 5.6 Recipe Grid/List View

Displayed below the weekly calendar. This is the primary interface for browsing recipes and dragging them onto the calendar.

**Sorting Options (dropdown):**

- Most recently used (in meal plans)
- Least recently used
- Most frequently used (all-time count)
- Most underused (lowest frequency)
- Alphabetical (A–Z)
- Newest created

**Filtering:**

- By tags (multi-select chips)
- By complexity (range slider 1–5)
- Search by name (text input with debounced query)

**Recipe Card Display:**

- Photo thumbnail (or placeholder if no photo)
- Recipe name
- Complexity indicator (1–5 dots or stars)
- Tag chips
- Drag handle for drag-and-drop to calendar

---

## 6. Core Feature: Weekly Meal Planning

### 6.1 Calendar View

- Week starts on **Sunday**, ends Saturday
- 7-day horizontal grid layout
- Each day cell shows: date, assigned recipe name (or empty slot), serving scale indicator (e.g., "x2"), owner avatar + name, stacked support avatars (show count if > 3), warning icon if no owner assigned
- Navigation: previous/next week arrows
- Past weeks are viewable and editable

### 6.2 Drag-and-Drop Interaction

- Drag recipes from the recipe grid below → drop onto a calendar day to assign
- Drag between calendar days to move a meal
- Click a recipe on the calendar to open the Meal Detail Modal
- Use dnd-kit library for both mouse and touch device support

### 6.3 Meal Detail Modal

Opened when clicking an assigned meal on the calendar.

- Recipe name with link to view full recipe details
- Serving scale adjuster: stepper or input field (0.5x, 1x, 1.5x, 2x, etc.)
- Owner assignment: dropdown of all family members + "Unassigned" option
- Support assignment: multi-select of family members, add/remove freely
- "Remove meal from this day" button
- Save changes button

### 6.4 Week-Level Actions

**"Clear week"**

- Removes all meals from the current week view
- Requires confirmation dialog: "This will remove all 7 meals from this week. Are you sure?"

**"Copy week"**

- Opens modal with week picker (calendar or dropdown)
- Copies all meals from selected source week to current week
- Copies: recipes, serving scales, AND role assignments

**"Save as template"**

- Opens modal to name the template
- Saves current week's recipes and serving scales (NOT assignments)

**"Load template"**

- Dropdown of saved templates
- Confirmation dialog: "Replace current week's meals?"
- Loads recipes and scales, clears existing meals

**"Generate shopping list"**

- Triggers shopping list generation for the current week (see Section 8)

---

## 7. Core Feature: Role Assignment

### Assignment Rules

- Two roles: **Owner** (singular) and **Support** (multiple)
- Anyone can assign or unassign anyone, including themselves
- No maximum on support team size
- Owner field can be null — shows warning but does NOT block meal planning
- Assignments are stored per meal plan instance (per date)
- No permissions hierarchy — flat access for all users

### UI Indicators

- **Owner:** highlighted avatar/name with an "Owner" badge
- **Support:** regular-sized avatars in a stacked row
- **No owner:** warning icon (yellow/orange) with tooltip "No owner assigned for this meal"

---

## 8. Core Feature: Shopping List Generation

### 8.1 Generation Process

1. User clicks "Generate shopping list" for a given week
2. Backend collects all ingredients from that week's meal plans. For each meal: recipe ingredients × `serving_scale`
3. The raw consolidated ingredient list is sent to Anthropic Claude Haiku with a structured prompt
4. Haiku returns JSON with: `ingredientName`, `estimatedAmount` (flexible range string), `sourceRecipes[]`, `consolidationCertainty` (0–1)
5. Backend creates a ShoppingList record with the AI-generated items
6. UI displays the shopping list view

### AI Consolidation Prompt (Example)

The prompt should instruct Haiku to intelligently combine similar ingredients across different units and forms. For example, "1 cup diced onions" + "2 whole onions" should become approximately "3–4 onions" with an appropriate certainty score. The output must be structured JSON for reliable parsing.

### 8.2 Shopping List UI

**Header:** Week date range (e.g., "Feb 9–15, 2026")

**Grouping:**

- Default: all items in one flat list
- Manual grouping: drag items into named store groups (e.g., "Produce", "Meat", "Dairy", "Pantry")
- Store groups can be created, renamed, and deleted

**Each item displays:**

- Checkbox (checked/unchecked state)
- Ingredient name
- Estimated amount (flexible range)
- Source recipes (expandable — shows which meals need this ingredient)
- Certainty indicator if < 0.8 (e.g., "⚠️ AI estimate — verify")
- "Already have" toggle (excludes from active list but keeps for reference)
- Notes field (manual freetext)
- Inline edit button (edit amount/name directly)

**Actions:**

- "Export" button — **STUBBED:** shows toast "Export feature coming soon"
- "Clear all checkmarks" button
- "Add custom item" button (for items not from recipes)

---

## 9. Core Feature: Week Templates

### Creating Templates

- From current week view: "Save as template" button
- Modal prompts for template name
- Saves: recipe assignments per day-of-week + serving scales
- Does NOT save: owner/support assignments

### Loading Templates

- "Load template" dropdown in week view toolbar
- Select a template → confirmation dialog "Replace current week's meals?"
- Loads recipes and scales, clears existing meal plan for that week

### Copying Past Weeks (Not Templates)

- "Copy week" button → modal with week picker
- Copies ALL data: recipes, scales, AND role assignments
- This is distinct from templates — templates are reusable patterns; copy is a one-time duplication

---

## 10. AI Integration

### Provider & Model

- **Provider:** Anthropic
- **Model:** Claude Haiku (cost-effective for extraction tasks)
- **SDK:** `@anthropic-ai/sdk` (official Node.js SDK)
- API key stored in environment variables via T3 env management

### Use Case 1: Recipe Extraction from Image

- **Input:** Base64-encoded image of recipe
- **Prompt:** Extract recipe name, servings, and structured ingredient list (amount, unit, name) from this image
- **Output:** Structured JSON matching the recipe creation form schema
- **Error handling:** if extraction fails or confidence is low, return empty form with error message

### Use Case 2: Recipe Extraction from URL

- **Input:** Fetched HTML/text content of a recipe webpage
- **Prompt:** Extract recipe name, servings, and structured ingredient list from this webpage content
- **Output:** Same structured JSON as image extraction
- **Note:** many recipe sites use structured data (JSON-LD schema.org/Recipe) — the AI should handle both structured and unstructured page content

### Use Case 3: Shopping List Consolidation

- **Input:** Array of all ingredients from the week's meals, pre-scaled by serving multiplier
- **Prompt:** Consolidate similar ingredients, combine quantities across different units intelligently, return flexible ranges
- **Output:** JSON array with `ingredientName`, `estimatedAmount`, `sourceRecipes[]`, `consolidationCertainty` (0–1)
- **Key intelligence:** "1 cup diced onions" + "2 whole onions" → "~3–4 onions" with certainty 0.7

### Error Handling & UX

- Show loading spinner/skeleton during AI processing
- Rate limit protection: queue requests, show "please wait" if throttled
- Fallback on any AI failure: present empty/editable form so user can proceed manually
- All AI-generated content is always presented in an editable form for human verification

---

## 11. tRPC API Procedures

All procedures are authenticated via Clerk middleware. Use tRPC's `protectedProcedure` for all routes.

### Recipe Procedures

| Procedure                | Type     | Description                                             |
| ------------------------ | -------- | ------------------------------------------------------- |
| `recipe.create`          | mutation | Create recipe with ingredients                          |
| `recipe.update`          | mutation | Update recipe + ingredients, propagates to future plans |
| `recipe.delete`          | mutation | Soft delete (blocked if in upcoming plans)              |
| `recipe.getById`         | query    | Single recipe with ingredients                          |
| `recipe.list`            | query    | Paginated list with sort/filter/search                  |
| `recipe.importFromImage` | mutation | Send image to Haiku, return extracted data              |
| `recipe.importFromUrl`   | mutation | Fetch URL + send to Haiku, return extracted data        |

### Meal Plan Procedures

| Procedure            | Type     | Description                                    |
| -------------------- | -------- | ---------------------------------------------- |
| `mealPlan.create`    | mutation | Assign recipe to a date                        |
| `mealPlan.update`    | mutation | Update scale, owner, support for a date        |
| `mealPlan.delete`    | mutation | Remove meal from a date                        |
| `mealPlan.getWeek`   | query    | Get all meals for a given week (by start date) |
| `mealPlan.copyWeek`  | mutation | Copy meals from source week to target week     |
| `mealPlan.clearWeek` | mutation | Delete all meal plans for a given week         |

### Template Procedures

| Procedure             | Type     | Description                         |
| --------------------- | -------- | ----------------------------------- |
| `weekTemplate.create` | mutation | Save current week as named template |
| `weekTemplate.list`   | query    | List all saved templates            |
| `weekTemplate.load`   | mutation | Apply template to a target week     |
| `weekTemplate.delete` | mutation | Delete a saved template             |

### Shopping List Procedures

| Procedure                  | Type     | Description                                |
| -------------------------- | -------- | ------------------------------------------ |
| `shoppingList.generate`    | mutation | Collect ingredients + AI consolidation     |
| `shoppingList.getByWeek`   | query    | Get shopping list for a given week         |
| `shoppingList.updateItem`  | mutation | Edit item amount, name, group, notes, etc. |
| `shoppingList.addItem`     | mutation | Add custom item not from recipes           |
| `shoppingList.deleteItem`  | mutation | Remove an item from the list               |
| `shoppingList.clearChecks` | mutation | Uncheck all items                          |

---

## 12. State Management (Zustand)

Use Zustand for client-side UI state that doesn't need to be persisted to the database. Server state should be managed via tRPC + React Query (built into tRPC).

### Zustand Stores

- **`useWeekViewStore`**: current viewed week date, navigation state
- **`useRecipeFilterStore`**: active sort option, selected tag filters, complexity range, search query text
- **`useShoppingListUIStore`**: expanded store groups, checked item visual state, "show already-have" toggle
- **`useDragStore`**: currently dragged recipe ID (for drag-and-drop coordination between recipe grid and calendar)

### Server State (tRPC + React Query)

All data fetching and mutations should use tRPC's built-in React Query integration. This handles caching, refetching, optimistic updates, and invalidation automatically. Do NOT duplicate server data in Zustand stores.

---

## 13. User Experience Flows

### Flow 1: First-Time User

1. Sign in with Email/Password or Google SSO via Clerk
2. Land on current week view (empty calendar)
3. See onboarding prompts: "Add your first recipe", "Import from a link", "Snap a photo of a recipe card"
4. Create or import recipes
5. Drag recipes from grid onto calendar days
6. Click each meal to adjust servings and assign owner/support
7. Generate shopping list when the week is planned

### Flow 2: Weekly Planning (Returning User)

1. Navigate to upcoming week (or stay on current)
2. Drag recipes from grid onto empty day slots
3. Click each assigned meal to set serving scale and assign roles
4. Review the full week
5. Click "Generate shopping list"
6. Manually group items by store (Produce, Meat, etc.)
7. Use shopping list while shopping (check off items)

### Flow 3: Recipe Import from URL

1. Click "Import from URL"
2. Paste recipe link into input field
3. App fetches page and sends to Haiku for extraction
4. Loading state shown during AI processing
5. Extracted data displayed in editable recipe creation form
6. User reviews and corrects any extraction errors
7. Save → recipe appears in grid, ready to drag to calendar

### Flow 4: Recipe Import from Image

1. Click "Import from Photo"
2. Upload or capture image of recipe
3. App sends image to Haiku for OCR + extraction
4. Loading state shown during AI processing
5. Extracted data displayed in editable form
6. User reviews and saves

---

## 14. UI/UX Specifications

### Responsive Design

- Mobile-first approach throughout
- Calendar: horizontal scroll on mobile, full 7-day grid on desktop
- Recipe grid: 1 column on mobile, 2–3 columns on tablet, 4+ columns on desktop
- Drag-and-drop must work on touch devices (dnd-kit handles this)
- Shopping list: full-width cards on mobile, compact rows on desktop

### Component Library

Use shadcn/ui for all base components. This ensures consistent styling, accessibility, and keyboard navigation. Key components to leverage:

- **Dialog / AlertDialog** for modals and confirmations
- **DropdownMenu** for sorting/filtering controls
- **Select / Combobox** for user dropdowns and tag selection
- **Slider** for complexity input
- **Toast** for success/error notifications
- **Skeleton** for loading states
- **Avatar** for user display in role assignments
- **Badge** for tags and role indicators

### Page Layout

The main view is a single page with two major sections stacked vertically: the weekly calendar at the top and the recipe grid below. Navigation between weeks happens inline via prev/next arrows. Shopping list and recipe detail views can be separate pages or slide-out panels.

---

## 15. Edge Cases & Business Rules

| Scenario                         | Behavior                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Recipe edited while in meal plan | Auto-updates all future meal plan instances referencing that recipe                                  |
| Recipe deletion attempted        | Blocked if recipe is in any meal plan with date >= today. User must remove from plans first.         |
| Serving scale on plan vs recipe  | Serving scale persists per meal plan instance. Editing the base recipe does NOT change saved scales. |
| AI consolidation uncertain       | Show certainty < 0.8 items with warning indicator. User can manually override.                       |
| No owner assigned to meal        | Show warning icon. Do NOT block planning or generation. "Smart whiteboard" philosophy.               |
| Assignment flexibility           | Anyone can assign/unassign anyone. No permissions hierarchy. No locks.                               |
| Week boundaries                  | Weeks start Sunday. Meal plans tied to specific dates (not relative day-of-week).                    |
| Past weeks                       | Saved and viewable indefinitely. Can be copied to future weeks.                                      |
| Multiple meals per day           | Not supported. One dinner per day only. UNIQUE constraint on meal_plans.date.                        |
| Shopping list regeneration       | Re-generating overwrites previous list for that week. Warn user if list already exists.              |
| AI extraction failure            | Show empty editable form with error toast. User proceeds manually.                                   |
| Recipe with no ingredients       | Allow saving. Recipe is valid without ingredients (useful for simple meals).                         |

---

## 16. Future Features (Stubbed for Now)

These features should have placeholder UI and/or database schema created, but NO functional implementation. Label them "Coming Soon" in the UI.

### Push Notifications

**Architecture Notes (for future):**

- Implement as PWA with service worker
- Use Firebase Cloud Messaging (FCM) for push
- Triggers: daily evening reminder ("Tonight's dinner: [Recipe]. Owner: [Name]"), no-owner warning 24h before

**For Now:** Create DB schema for notification preferences. Show "Notifications — Coming Soon" in user settings.

### Shopping List Export

- "Export" button in shopping list view shows toast: "Export feature coming soon"
- Future options: email, print, SMS, integration with grocery delivery apps

### Analytics / Insights

- Placeholder page/section in navigation
- Future metrics: most cooked recipes, cooking frequency per person, favorite meals, ingredient spending patterns

### Recipe Steps/Instructions

- Current design intentionally omits cooking steps — users follow the `source_url` link
- Future: add an ordered steps array to recipes for in-app cooking mode

---

## 17. Recommended Build Sequence

Build in this order to ensure each phase has its dependencies ready. Each phase should be fully testable before moving on.

### Phase 1: Foundation

- Initialize Next.js project with T3 stack (create-t3-app or manual setup)
- Configure Clerk authentication (Email/Password + Google SSO)
- Set up Neon Postgres database connection
- Configure Drizzle ORM with migration tooling
- Set up tRPC router with Clerk auth middleware
- Deploy to Vercel with environment variables configured

### Phase 2: Recipe CRUD

- Create database schema for recipes + ingredients
- Implement tRPC procedures: `recipe.create`, `recipe.update`, `recipe.delete`, `recipe.list`, `recipe.getById`
- Build recipe creation form UI with ingredient list builder
- Build recipe grid/list view with sorting, filtering, search
- Build recipe detail view

### Phase 3: AI Recipe Import

- Integrate Anthropic SDK
- Implement `recipe.importFromUrl` procedure (fetch + Haiku extraction)
- Implement `recipe.importFromImage` procedure (image + Haiku OCR)
- Build import UI: URL input, image upload, loading states, editable review form

### Phase 4: Weekly Calendar + Drag-and-Drop

- Create `meal_plans` database schema
- Implement mealPlan tRPC procedures
- Build weekly calendar grid UI
- Integrate dnd-kit for drag-and-drop between recipe grid and calendar
- Build meal detail modal (scale, assign roles)
- Week navigation (prev/next)

### Phase 5: Role Assignment

- Implement owner/support selection UI in meal detail modal
- Pull user list from Clerk for dropdown population
- Add visual indicators (owner badge, support avatars, no-owner warning)

### Phase 6: Shopping List

- Create shopping list database schema
- Implement `shoppingList.generate` with Haiku consolidation
- Build shopping list UI: checklist, grouping, editing, custom items
- Add certainty indicators and "already have" toggle
- Stub export button

### Phase 7: Templates + Polish

- Create `week_templates` database schema
- Implement template CRUD procedures
- Implement "Copy week" functionality
- Add clear week, load template, save template buttons
- Responsive design pass (mobile, tablet, desktop)
- Onboarding prompts for empty states
- Stub future features (notifications settings, analytics page, export)

---

## 18. Assumptions & Constraints

| Assumption          | Detail                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Auth methods        | Email/Password and Google SSO via Clerk. Both methods are enabled.                                                             |
| User scale          | 9+ family members. Single-family use, not multi-tenant.                                                                        |
| Meal type           | Dinner only. One meal per day. No breakfast/lunch planning.                                                                    |
| Recipe sources      | Primarily imported from external sites (URL import is the most critical path). Manual creation and image import are secondary. |
| Shopping cadence    | Weekly, at the start of the week. No mid-week regeneration needed.                                                             |
| Permissions         | Flat. All users have equal access. "Smart whiteboard" — warnings over blockers.                                                |
| AI verification     | All AI-extracted content requires human review via editable form before saving.                                                |
| Database tier       | Neon Postgres free/hobby tier is sufficient for family-scale usage.                                                            |
| Deployment tier     | Vercel free/hobby tier is sufficient.                                                                                          |
| Photo storage       | Use Vercel Blob or similar Next.js-compatible file storage for recipe photos.                                                  |
| Notes format        | Markdown. Basic Markdown input/preview is sufficient (no rich text editor).                                                    |
| Export              | Stubbed for now. Implementation details TBD.                                                                                   |
| Recipe instructions | Not included in V1. Users follow `source_url` link for cooking steps.                                                          |

---

_End of Specification Document_
