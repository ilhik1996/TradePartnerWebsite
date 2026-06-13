import {
  pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, pgEnum, uuid
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const kycLevelEnum = pgEnum("kyc_level", ["none", "age_verified", "full"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "self_excluded", "banned"]);
export const drawStatusEnum = pgEnum("draw_status", ["pending", "open", "closed", "completed", "cancelled"]);
export const entryTypeEnum = pgEnum("entry_type", ["paid", "free"]);
export const txTypeEnum = pgEnum("tx_type", [
  "deposit", "withdrawal", "lottery_entry", "prize_payout",
  "referral_bonus", "ad_reward", "refund", "admin_adjustment"
]);
export const txStatusEnum = pgEnum("tx_status", ["pending", "completed", "failed", "reversed"]);
export const subscriptionTypeEnum = pgEnum("subscription_type", ["weekly", "monthly"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "cancelled", "expired", "paused"]);

// ─── Countries / Markets ──────────────────────────────────────────────────────

export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),               // "UA", "US", etc.
  name: text("name").notNull(),
  currency: text("currency").notNull(),                // "UAH", "USD"
  currencySymbol: text("currency_symbol").notNull(),   // "₴", "$"
  locale: text("locale").notNull(),                    // "uk-UA", "en-US"
  entryAmountDaily: numeric("entry_amount_daily", { precision: 10, scale: 2 }).notNull(),
  entryAmountWeekly: numeric("entry_amount_weekly", { precision: 10, scale: 2 }).notNull(),
  entryAmountMonthly: numeric("entry_amount_monthly", { precision: 10, scale: 2 }).notNull(),
  prizePercentage: numeric("prize_percentage", { precision: 5, scale: 2 }).notNull().default("50"),
  drawHourUtc: integer("draw_hour_utc").notNull().default(21),  // hour UTC when draw runs
  isActive: boolean("is_active").notNull().default(true),
  config: jsonb("config"),                             // extra per-country settings
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  countryId: integer("country_id").references(() => countries.id),
  kycLevel: kycLevelEnum("kyc_level").notNull().default("none"),
  status: userStatusEnum("status").notNull().default("active"),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: integer("referred_by"),                  // user id who referred
  autoParticipate: boolean("auto_participate").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  dateOfBirth: timestamp("date_of_birth"),
  ageVerifiedAt: timestamp("age_verified_at"),
  kycVerifiedAt: timestamp("kyc_verified_at"),
  kycProviderToken: text("kyc_provider_token"),         // Sumsub/Onfido token
  deviceFingerprint: text("device_fingerprint"),
  avatarUrl: text("avatar_url"),
});

// ─── Responsible Gaming ───────────────────────────────────────────────────────

export const responsibleGaming = pgTable("responsible_gaming", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  dailyLimitAmount: numeric("daily_limit_amount", { precision: 10, scale: 2 }),
  weeklyLimitAmount: numeric("weekly_limit_amount", { precision: 10, scale: 2 }),
  monthlyLimitAmount: numeric("monthly_limit_amount", { precision: 10, scale: 2 }),
  selfExcludedUntil: timestamp("self_excluded_until"),
  notificationFrequencyHours: integer("notification_frequency_hours").notNull().default(24),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Wallets & Transactions ───────────────────────────────────────────────────

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => wallets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  type: txTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),  // positive = credit, negative = debit
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
  status: txStatusEnum("status").notNull().default("completed"),
  reference: text("reference"),                         // external payment ref
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  countryId: integer("country_id").notNull().references(() => countries.id),
  type: subscriptionTypeEnum("type").notNull(),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  startDate: timestamp("start_date").notNull(),
  nextBillingDate: timestamp("next_billing_date").notNull(),
  cancelledAt: timestamp("cancelled_at"),
  paymentMethodToken: text("payment_method_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Draws (Lottery Engine) ───────────────────────────────────────────────────

export const draws = pgTable("draws", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countries.id),
  drawDate: text("draw_date").notNull(),               // "2025-01-15"
  status: drawStatusEnum("status").notNull().default("pending"),
  totalPool: numeric("total_pool", { precision: 14, scale: 2 }).notNull().default("0"),
  prizeAmount: numeric("prize_amount", { precision: 14, scale: 2 }),
  winnerUserId: integer("winner_user_id").references(() => users.id),
  winnerTicketNumber: integer("winner_ticket_number"),
  totalEntries: integer("total_entries").notNull().default(0),
  rngSeed: text("rng_seed"),                           // provably fair: seed used
  rngProof: text("rng_proof"),                         // hash of seed + entries for audit
  openedAt: timestamp("opened_at"),
  closedAt: timestamp("closed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const drawEntries = pgTable("draw_entries", {
  id: serial("id").primaryKey(),
  drawId: integer("draw_id").notNull().references(() => draws.id),
  userId: integer("user_id").notNull().references(() => users.id),
  type: entryTypeEnum("type").notNull(),
  ticketNumber: integer("ticket_number").notNull(),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }),   // null for free entries
  transactionId: integer("transaction_id").references(() => transactions.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Referrals ────────────────────────────────────────────────────────────────

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => users.id),
  refereeId: integer("referee_id").notNull().references(() => users.id),
  bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"),   // "pending" | "paid" | "revoked"
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("moderator"),    // "superadmin" | "moderator" | "finance"
  permissions: jsonb("permissions"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id").references(() => adminUsers.id),
  userId: integer("user_id").references(() => users.id),  // affected user (if any)
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  dataBefore: jsonb("data_before"),
  dataAfter: jsonb("data_after"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),                         // "draw_result" | "balance_low" | "winner"
  title: text("title").notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Petition (optional support program) ─────────────────────────────────────

export const petitionSignatures = pgTable("petition_signatures", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  firstName: text("first_name").notNull(),
  countryCode: text("country_code").notNull(),
  agreedAt: timestamp("agreed_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

// ─── Gamification ─────────────────────────────────────────────────────────────

export const gamificationEvents = pgTable("gamification_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  xp: integer("xp").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gamificationBadges = pgTable("gamification_badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  badgeId: text("badge_id").notNull(),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
});

// ─── Partners ─────────────────────────────────────────────────────────────────

export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  cashbackPercent: numeric("cashback_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  countryId: integer("country_id").references(() => countries.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Web Push Subscriptions ───────────────────────────────────────────────────

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Sessions ────────────────────────────────────────────────────────────────

export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Zod Schemas & Types ──────────────────────────────────────────────────────

export const insertUserSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(8),
  countryId: z.number().int().optional(),
}).refine(d => d.email || d.phone, { message: "Email or phone required" });

export const loginSchema = z.object({
  identifier: z.string().min(3),   // email or phone
  password: z.string().min(1),
});

export const freeEntrySchema = z.object({
  drawId: z.number().int(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  countryId: z.number().int(),
});

// Inferred types
export type Country = typeof countries.$inferSelect;
export type User = typeof users.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Draw = typeof draws.$inferSelect;
export type DrawEntry = typeof drawEntries.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ResponsibleGaming = typeof responsibleGaming.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type GamificationEvent = typeof gamificationEvents.$inferSelect;
export type GamificationBadge = typeof gamificationBadges.$inferSelect;
export type Partner = typeof partners.$inferSelect;
