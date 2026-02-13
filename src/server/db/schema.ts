import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Multi-project schema prefix for Drizzle ORM.
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator(
  (name) => `DinnerPlanning_${name}`,
);

// ─── RECIPES ────────────────────────────────────────────────────────────────

export const recipes = createTable(
  "recipe",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    servings: integer("servings").notNull().default(4),
    complexity: integer("complexity").notNull().default(3),
    tags: text("tags")
      .array()
      .default([]),
    photoUrls: text("photo_urls")
      .array()
      .default([]),
    sourceUrl: text("source_url"),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("recipe_name_idx").on(t.name),
    index("recipe_deleted_at_idx").on(t.deletedAt),
  ],
);

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(ingredients),
}));

// ─── INGREDIENTS ────────────────────────────────────────────────────────────

export const ingredients = createTable(
  "ingredient",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 10, scale: 4 }).notNull(),
    unit: varchar("unit", { length: 50 }).notNull(),
    ingredientName: varchar("ingredient_name", { length: 255 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("ingredient_recipe_id_idx").on(t.recipeId)],
);

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [ingredients.recipeId],
    references: [recipes.id],
  }),
}));

// ─── MEAL PLANS ─────────────────────────────────────────────────────────────

export const mealPlans = createTable(
  "meal_plan",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    servingScale: decimal("serving_scale", { precision: 5, scale: 2 })
      .notNull()
      .default("1.0"),
    ownerId: varchar("owner_id", { length: 255 }),
    supportIds: text("support_ids")
      .array()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("meal_plan_date_idx").on(t.date),
    index("meal_plan_recipe_id_idx").on(t.recipeId),
  ],
);

export const mealPlansRelations = relations(mealPlans, ({ one }) => ({
  recipe: one(recipes, {
    fields: [mealPlans.recipeId],
    references: [recipes.id],
  }),
}));

// ─── WEEK TEMPLATES ─────────────────────────────────────────────────────────

export const weekTemplates = createTable("week_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const weekTemplatesRelations = relations(
  weekTemplates,
  ({ many }) => ({
    meals: many(weekTemplateMeals),
  }),
);

export const weekTemplateMeals = createTable(
  "week_template_meal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => weekTemplates.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday ... 6=Saturday
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    servingScale: decimal("serving_scale", { precision: 5, scale: 2 })
      .notNull()
      .default("1.0"),
  },
  (t) => [index("week_template_meal_template_id_idx").on(t.templateId)],
);

export const weekTemplateMealsRelations = relations(
  weekTemplateMeals,
  ({ one }) => ({
    template: one(weekTemplates, {
      fields: [weekTemplateMeals.templateId],
      references: [weekTemplates.id],
    }),
    recipe: one(recipes, {
      fields: [weekTemplateMeals.recipeId],
      references: [recipes.id],
    }),
  }),
);

// ─── SHOPPING LISTS ─────────────────────────────────────────────────────────

export const shoppingLists = createTable(
  "shopping_list",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weekStartDate: date("week_start_date", { mode: "string" }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("shopping_list_week_start_date_idx").on(t.weekStartDate),
  ],
);

export const shoppingListsRelations = relations(
  shoppingLists,
  ({ many }) => ({
    items: many(shoppingListItems),
  }),
);

export const shoppingListItems = createTable(
  "shopping_list_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shoppingListId: uuid("shopping_list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    ingredientName: varchar("ingredient_name", { length: 255 }).notNull(),
    estimatedAmount: varchar("estimated_amount", { length: 255 }).notNull(),
    sourceRecipes: text("source_recipes")
      .array()
      .default([]),
    certainty: decimal("certainty", { precision: 3, scale: 2 })
      .notNull()
      .default("1.0"),
    storeGroup: varchar("store_group", { length: 100 }),
    alreadyHave: boolean("already_have").notNull().default(false),
    checked: boolean("checked").notNull().default(false),
    manuallyEdited: boolean("manually_edited").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [
    index("shopping_list_item_list_id_idx").on(t.shoppingListId),
  ],
);

export const shoppingListItemsRelations = relations(
  shoppingListItems,
  ({ one }) => ({
    shoppingList: one(shoppingLists, {
      fields: [shoppingListItems.shoppingListId],
      references: [shoppingLists.id],
    }),
  }),
);
