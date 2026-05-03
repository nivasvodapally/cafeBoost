import { z } from "zod";

/**
 * Zod schemas for all server-bound writes (Section 5 — input validation).
 * Validating client-side gives instant UX; RLS + DB defaults remain the
 * authoritative server-side guard.
 */

export const cafeProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, dashes only"),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const menuItemSchema = z.object({
  category: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  price: z.number().min(0).max(100000),
});

export const bookingSchema = z.object({
  customer_name: z.string().trim().min(2).max(80),
  booking_date: z.string().min(1),
  booking_time: z.string().min(1).max(20),
  persons: z.number().int().min(1).max(50),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const rewardSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  required_points: z.number().int().min(0).max(100000),
});

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}
