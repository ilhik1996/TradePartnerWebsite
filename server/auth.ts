import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, adminUsers } from "@shared/schema";
import { eq } from "drizzle-orm";

const WEAK_JWT_SECRET = "viona-dev-secret-change-in-production";
const JWT_SECRET = process.env.JWT_SECRET || WEAK_JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

// Fail fast in production if JWT secret is missing or insecure
if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === WEAK_JWT_SECRET) {
    console.error("[FATAL] JWT_SECRET is missing or uses the insecure dev default. Set a strong random secret before deploying.");
    process.exit(1);
  }
} else if (!process.env.JWT_SECRET) {
  console.warn("[Security] JWT_SECRET not set — using dev fallback. Never deploy this to production.");
}

export function signToken(payload: { userId: number; role?: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { userId: number; role?: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; role?: string };
  } catch {
    return null;
  }
}

// Attaches req.user if valid JWT present; never rejects — downstream routes decide
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyToken(header.slice(7));
    if (payload) {
      (req as any).userId = payload.userId;
      (req as any).role = payload.role;
    }
  }
  next();
}

// Rejects 401 if no valid user token
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }
  (req as any).userId = payload.userId;
  (req as any).role = payload.role;
  next();
}

// Rejects 403 if not admin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload || payload.role !== "admin") {
    res.status(403).json({ message: "Admin access required" });
    return;
  }
  (req as any).adminId = payload.userId;
  (req as any).role = payload.role;
  next();
}
