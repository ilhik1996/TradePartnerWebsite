// Storage interface kept minimal — all actual DB operations are done directly in routes.ts
// This file exists for compatibility with the Express server setup.

export interface IStorage {
  // Placeholder — routes use db directly via drizzle-orm
}

export class MemStorage implements IStorage {}
export class DatabaseStorage implements IStorage {}

export const storage = new DatabaseStorage();
