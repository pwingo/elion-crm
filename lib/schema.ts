import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enum constants ───────────────────────────────────────────────────────────

export const campaignTypeEnum = [
  "provider_recruiting",
  "vendor_recruiting",
  "sales",
  "content",
  "conference",
  "other",
] as const;
export type CampaignType = (typeof campaignTypeEnum)[number];

export const statusEnum = [
  "not_started",
  "in_progress",
  "responded",
  "confirmed",
  "declined",
  "no_response",
  "on_hold",
  "not_a_fit",
] as const;
export type ContactStatus = (typeof statusEnum)[number];

export const channelEnum = ["email", "linkedin"] as const;
export type Channel = (typeof channelEnum)[number];

export const touchStateEnum = ["drafted", "sent", "skipped", "received"] as const;
export type TouchState = (typeof touchStateEnum)[number];

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  ownerName: text("owner_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  organization: text("organization").notNull(),
  title: text("title"),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  owner: text("owner").notNull(),
  isProspect: boolean("is_prospect").default(false),
  isPoc: boolean("is_poc").default(false),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type").$type<CampaignType>().notNull(),
  campaignGroup: text("campaign_group"),
  date: text("date"),
  location: text("location"),
  description: text("description").notNull(),
  sellingPoints: text("selling_points").notNull(),
  isActive: boolean("is_active").default(true),
  cadenceDays: text("cadence_days").default("[5, 7, 10, 14]"),
  maxTouches: integer("max_touches").default(4),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contactCampaignStatus = pgTable(
  "contact_campaign_status",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    status: text("status").$type<ContactStatus>().default("not_started"),
    nextTouchDate: text("next_touch_date"),
    doNotContact: boolean("do_not_contact").default(false),
  },
  (table) => [
    uniqueIndex("contact_campaign_unique_idx").on(
      table.contactId,
      table.campaignId,
    ),
  ],
);

export const outreachTouches = pgTable(
  "outreach_touches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    touchNumber: integer("touch_number"),
    channel: text("channel").$type<Channel>().notNull(),
    state: text("state").$type<TouchState>().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    draftCreatedAt: timestamp("draft_created_at"),
    sentAt: timestamp("sent_at"),
    subject: text("subject"),
    body: text("body"),
    createdBy: text("created_by").notNull(),
    skipReason: text("skip_reason"),
    gmailThreadId: text("gmail_thread_id"),
    gmailMessageId: text("gmail_message_id"),
  },
  (table) => [
    // Partial unique index: only one open draft per (contact, campaign)
    uniqueIndex("one_open_draft_idx")
      .on(table.contactId, table.campaignId)
      .where(sql`state = 'drafted'`),
  ],
);

export const voiceExamples = pgTable("voice_examples", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").$type<Channel>().notNull(),
  archetype: text("archetype"),
  subject: text("subject"),
  body: text("body").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  voiceExamples: many(voiceExamples),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
  campaignStatuses: many(contactCampaignStatus),
  outreachTouches: many(outreachTouches),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  contactStatuses: many(contactCampaignStatus),
  outreachTouches: many(outreachTouches),
}));

export const contactCampaignStatusRelations = relations(
  contactCampaignStatus,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [contactCampaignStatus.contactId],
      references: [contacts.id],
    }),
    campaign: one(campaigns, {
      fields: [contactCampaignStatus.campaignId],
      references: [campaigns.id],
    }),
  }),
);

export const outreachTouchesRelations = relations(
  outreachTouches,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [outreachTouches.contactId],
      references: [contacts.id],
    }),
    campaign: one(campaigns, {
      fields: [outreachTouches.campaignId],
      references: [campaigns.id],
    }),
  }),
);

export const voiceExamplesRelations = relations(voiceExamples, ({ one }) => ({
  user: one(users, {
    fields: [voiceExamples.userId],
    references: [users.id],
  }),
}));
