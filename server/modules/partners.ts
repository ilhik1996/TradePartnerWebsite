// ─── Partner Type ─────────────────────────────────────────────────────────────

export interface Partner {
  id: number;
  name: string;
  category: "food" | "retail" | "pharmacy" | "telecom" | "fuel" | "entertainment" | "electronics" | "delivery" | "beauty" | "fitness" | "travel" | "finance";
  description: string;
  logoUrl: string;
  cashbackPercent: number;
  countryId: number | null;
  isActive: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PARTNERS: Partner[] = [
  {
    id: 1,
    name: "QuickBite",
    category: "food",
    description: "Fast-food delivery network with thousands of restaurants across the platform.",
    logoUrl: "/assets/partners/quickbite.svg",
    cashbackPercent: 3.5,
    countryId: null,
    isActive: true,
  },
  {
    id: 2,
    name: "ShopZone",
    category: "retail",
    description: "Multi-category online retailer offering electronics, fashion and home goods.",
    logoUrl: "/assets/partners/shopzone.svg",
    cashbackPercent: 2.0,
    countryId: null,
    isActive: true,
  },
  {
    id: 3,
    name: "PharmaPlus",
    category: "pharmacy",
    description: "Licensed pharmacy chain providing prescription and over-the-counter medicines.",
    logoUrl: "/assets/partners/pharmaplus.svg",
    cashbackPercent: 4.0,
    countryId: 1,   // Ukraine
    isActive: true,
  },
  {
    id: 4,
    name: "ConnectMobile",
    category: "telecom",
    description: "Mobile operator offering prepaid and postpaid plans with wide 5G coverage.",
    logoUrl: "/assets/partners/connectmobile.svg",
    cashbackPercent: 1.5,
    countryId: null,
    isActive: true,
  },
  {
    id: 5,
    name: "FuelUp",
    category: "fuel",
    description: "National fuel station chain with loyalty discounts and electric-vehicle charging.",
    logoUrl: "/assets/partners/fuelup.svg",
    cashbackPercent: 2.5,
    countryId: null,
    isActive: true,
  },
  {
    id: 6,
    name: "CinemaWorld",
    category: "entertainment",
    description: "Movie theatre network with IMAX screens, streaming bundles and live events.",
    logoUrl: "/assets/partners/cinemaworld.svg",
    cashbackPercent: 5.0,
    countryId: 2,
    isActive: true,
  },
  {
    id: 7,
    name: "TechMart",
    category: "electronics",
    description: "Consumer electronics retailer with the latest smartphones, laptops and smart home devices.",
    logoUrl: "/assets/partners/techmart.svg",
    cashbackPercent: 2.0,
    countryId: null,
    isActive: true,
  },
  {
    id: 8,
    name: "SwiftDrop",
    category: "delivery",
    description: "Same-day courier and parcel service operating in major cities across the platform.",
    logoUrl: "/assets/partners/swiftdrop.svg",
    cashbackPercent: 3.0,
    countryId: null,
    isActive: true,
  },
  {
    id: 9,
    name: "GlowSpa",
    category: "beauty",
    description: "Premium beauty salon chain offering haircare, skincare treatments and cosmetics.",
    logoUrl: "/assets/partners/glowspa.svg",
    cashbackPercent: 6.0,
    countryId: null,
    isActive: true,
  },
  {
    id: 10,
    name: "IronFit",
    category: "fitness",
    description: "Gym and wellness club network with 24/7 access, personal trainers and group classes.",
    logoUrl: "/assets/partners/ironfit.svg",
    cashbackPercent: 4.5,
    countryId: null,
    isActive: true,
  },
  {
    id: 11,
    name: "SkyRoute",
    category: "travel",
    description: "Online travel agency for flights, hotels and package holidays at competitive rates.",
    logoUrl: "/assets/partners/skyroute.svg",
    cashbackPercent: 3.5,
    countryId: null,
    isActive: true,
  },
  {
    id: 12,
    name: "MoneyBridge",
    category: "finance",
    description: "Digital banking and money transfer service with low fees and instant international transfers.",
    logoUrl: "/assets/partners/moneybridge.svg",
    cashbackPercent: 1.5,
    countryId: null,
    isActive: true,
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return all active partners, optionally filtered by countryId.
 * If a DB `partners` table exists it would be queried here; for now returns
 * mock data so the API is immediately functional without a migration.
 */
export async function getPartners(countryId?: number): Promise<Partner[]> {
  let result = MOCK_PARTNERS.filter((p) => p.isActive);

  if (countryId !== undefined) {
    // Include partners that are global (null) or match the requested country
    result = result.filter(
      (p) => p.countryId === null || p.countryId === countryId,
    );
  }

  return result;
}

/**
 * Return a single partner by id, or null if not found.
 */
export async function getPartner(id: number): Promise<Partner | null> {
  return MOCK_PARTNERS.find((p) => p.id === id && p.isActive) ?? null;
}
