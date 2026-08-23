/**
 * Venue knowledge base built from the South Florida Insider coverage doc's own
 * legend (CR = Culture Room, HR = Hard Rock, and so on) plus the cities those
 * rooms actually sit in. Used by the importer to expand shorthand and fill in
 * the city field, which the source doc never states.
 */

export type VenueRecord = { name: string; city: string; aka?: string[] };

export const VENUES: VenueRecord[] = [
  // --- Miami-Dade ---
  { name: "Adrienne Arsht Center for the Performing Arts", city: "Miami", aka: ["Arsht"] },
  { name: "Kaseya Center", city: "Miami", aka: ["Kaseya"] },
  { name: "Jam Arena", city: "Miami", aka: ["Miami's Jam Arena"] },
  { name: "Magic City Casino", city: "Miami", aka: ["MCC"] },
  { name: "Midline Miami", city: "Miami", aka: ["Midline"] },
  { name: "Banyan Live", city: "Miami" },
  { name: "Factory Town", city: "Miami", aka: ["Factory Town Miami"] },
  { name: "Mana Wynwood", city: "Miami" },
  { name: "Bayfront Park", city: "Miami", aka: ["FPL Solar Amp", "FPL Solar Amphitheater"] },
  { name: "Miami Improv", city: "Miami", aka: ["Improv: Miami"] },
  { name: "The Fillmore Miami Beach", city: "Miami Beach", aka: ["Fillmore"] },
  { name: "LIV Nightclub at Fontainebleau", city: "Miami Beach", aka: ["Liv"] },
  { name: "Watsco Center", city: "Coral Gables" },
  { name: "Tropical Park", city: "Miami" },
  { name: "Virginia Key Beach Park", city: "Miami" },
  { name: "North Beach Bandshell", city: "Miami Beach", aka: ["Miami's North Beach Bandshell"] },
  { name: "The Hangar at Regatta Harbour", city: "Miami", aka: ["Miami's The Hangar at Regatta Harbour"] },
  { name: "Hard Rock Stadium", city: "Miami Gardens", aka: ["HR Stadium"] },

  // --- Broward ---
  { name: "Hard Rock Live", city: "Hollywood", aka: ["HR", "Hard Rock", "Hard Rock Live Hollywood"] },
  { name: "Amerant Bank Arena", city: "Sunrise", aka: ["Amerant"] },
  { name: "Broward Center for the Performing Arts", city: "Fort Lauderdale", aka: ["Broward Center"] },
  { name: "Culture Room", city: "Fort Lauderdale", aka: ["CR"] },
  { name: "Revolution Live", city: "Fort Lauderdale", aka: ["REV", "Rev", "Revolution"] },
  { name: "Parker Playhouse", city: "Fort Lauderdale", aka: ["The Parker", "Parker"] },
  { name: "Fort Lauderdale War Memorial Auditorium", city: "Fort Lauderdale", aka: ["FTL War Memorial", "FLL War Memorial", "FLL War Memorial Stadium"] },
  { name: "Empire Stage", city: "Fort Lauderdale" },
  { name: "Chase Stadium", city: "Fort Lauderdale", aka: ["Inter Miami"] },
  { name: "Dania Beach Improv", city: "Dania Beach", aka: ["Improv: Dania Beach", "FLL Improv"] },
  { name: "The Casino @ Dania Beach", city: "Dania Beach" },
  { name: "Coral Springs Center for the Arts", city: "Coral Springs", aka: ["Coral Springs Center"] },
  { name: "Pompano Beach Amphitheater", city: "Pompano Beach", aka: ["Pompano Bch Amp", "Pompano Beach Amp"] },
  { name: "Pompano Beach Cultural Center", city: "Pompano Beach" },
  { name: "Seminole Casino Coconut Creek", city: "Coconut Creek", aka: ["SCCC"] },
  { name: "Quiet Waters Park", city: "Deerfield Beach" },
  { name: "Seascape Resort", city: "Miramar" },
  { name: "Fort Lauderdale Convention Center", city: "Fort Lauderdale", aka: ["FLL"] },

  // --- Palm Beach / Treasure Coast ---
  { name: "iThink Financial Amphitheatre", city: "West Palm Beach", aka: ["iThink Amp", "iThink"] },
  { name: "Kravis Center for the Performing Arts", city: "West Palm Beach", aka: ["Kravis"] },
  { name: "Palm Beach Kennel Club", city: "West Palm Beach", aka: ["PB Kennel Club"] },
  { name: "Respectable Street", city: "West Palm Beach" },
  { name: "South Florida Fairgrounds", city: "West Palm Beach", aka: ["SFL Fairgrounds"] },
  { name: "Boca Black Box", city: "Boca Raton", aka: ["Boca Blackbox", "The Kelsey Theater"] },
  { name: "The Wick Theatre", city: "Boca Raton", aka: ["The Wick"] },
  { name: "Funky Biscuit", city: "Boca Raton", aka: ["FB"] },
  { name: "Mizner Park Amphitheater", city: "Boca Raton", aka: ["Mizner Park Amp"] },
  { name: "Sunset Cove Amphitheater", city: "Boca Raton", aka: ["Sunset Cove Amp", "Sunset Cove Amp."] },
  { name: "Willow Theatre", city: "Boca Raton", aka: ["Boca Raton's Willow Theatre"] },
  { name: "Broken Sound Club", city: "Boca Raton", aka: ["Broken Sound in Boca"] },
  { name: "South County Regional Park", city: "Boca Raton", aka: ["S. County Regional Park"] },
  { name: "Arts Garage", city: "Delray Beach" },
  { name: "Delray Beach Tennis Center", city: "Delray Beach" },
  { name: "Bamboo Room", city: "Lake Worth Beach" },
  { name: "Lake Worth Playhouse", city: "Lake Worth Beach" },
  { name: "Propaganda", city: "Lake Worth Beach" },
  { name: "Bryant Park", city: "Lake Worth Beach", aka: ["Lake Worth's Bryant Park"] },
  { name: "Maltz Jupiter Theatre", city: "Jupiter", aka: ["Maltz"] },
  { name: "Abacoa Amphitheatre", city: "Jupiter", aka: ["Abacoa Amp"] },
  { name: "Lyric Theatre", city: "Stuart", aka: ["The Lyric Theatre"] },
  { name: "Terra Fermata", city: "Stuart" },
  { name: "Commons Park", city: "Royal Palm Beach" },
  { name: "The Aventura Arts & Cultural Center", city: "Aventura" },

  // --- Central / North Florida (the doc covers these too) ---
  { name: "Hard Rock Live Orlando", city: "Orlando", aka: ["Hard Rock Orlando"] },
  { name: "Dr. Phillips Center", city: "Orlando", aka: ["Dr.Phillips Center", "Steinmetz Hall", "Walt Disney Theater", "Alexis & Jim Pugh Theater"] },
  { name: "Kia Center", city: "Orlando", aka: ["KIA Center"] },
  { name: "The Beacham", city: "Orlando", aka: ["Beacham", "Beacham Orlando"] },
  { name: "House of Blues Orlando", city: "Orlando", aka: ["HoB", "House of Blues"] },
  { name: "Camping World Stadium", city: "Orlando" },
  { name: "Orange County Convention Center", city: "Orlando" },
  { name: "Tinker Field", city: "Orlando", aka: ["Orlando's Tinker Field"] },
  { name: "Central Florida Fairgrounds", city: "Orlando", aka: ["Orlando's Central Florida Fairgrounds"] },
  { name: "Hyatt Regency Orlando", city: "Orlando", aka: ["Hyatt Regency in Orlando"] },
  { name: "Gaylord Palms Resort", city: "Kissimmee", aka: ["Gaylord Palms Resort Orlando"] },
  { name: "Judson's Live", city: "Orlando" },
  { name: "Jannus Live", city: "St. Petersburg", aka: ["Jannus St Pete", "Jannus"] },
  { name: "Vinoy Park", city: "St. Petersburg", aka: ["Vinoy Park in St. Petersburg"] },
  { name: "Raymond James Stadium", city: "Tampa" },
  { name: "Daytona International Speedway", city: "Daytona Beach", aka: ["Daytona Int'l Speedway"] },
  { name: "Spirit of the Suwannee Music Park", city: "Live Oak", aka: ["Suwanee Music Park", "Spirit of The Suwannee Music Park"] },
  { name: "Stephen C. O'Connell Center", city: "Gainesville", aka: ["O'Connell Center"] },
  { name: "Holiday Inn University Center", city: "Gainesville", aka: ["Gainesville's Holiday Inn University Center"] },
  { name: "Gainesville Raceway", city: "Gainesville", aka: ["Gainesville's Gatornationals"] },
  { name: "Little Everglades Ranch", city: "Dade City", aka: ["Little Everglades Ranch in Dade City"] },
  { name: "Busch Gardens", city: "Tampa" },
  { name: "SeaWorld Orlando", city: "Orlando", aka: ["SeaWorld"] },
  { name: "Prudential Center", city: "Newark, NJ" },
  { name: "Key West", city: "Key West" },
  { name: "Pembroke Pines", city: "Pembroke Pines" },
];

const LOOKUP = new Map<string, VenueRecord>();
for (const v of VENUES) {
  LOOKUP.set(v.name.toLowerCase(), v);
  for (const a of v.aka ?? []) LOOKUP.set(a.toLowerCase(), v);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/, "")
    .trim();

/** Resolve a raw venue string from the doc to a canonical venue + city. */
export function resolveVenue(raw: string): {
  venue: string;
  city: string | null;
  matched: boolean;
} {
  const cleaned = raw.replace(/\s+/g, " ").trim().replace(/[.,]+$/, "");
  const key = norm(cleaned);
  if (!key) return { venue: "", city: null, matched: false };

  const exact = LOOKUP.get(key);
  if (exact) return { venue: exact.name, city: exact.city, matched: true };

  // Longest alias contained in the string wins, so "near HR" or
  // "Boca Blackbox" still resolves without over-matching short codes.
  let best: { rec: VenueRecord; len: number } | null = null;
  for (const [alias, rec] of LOOKUP) {
    if (alias.length < 3) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}([^a-z0-9]|$)`, "i");
    if (re.test(key) && (!best || alias.length > best.len))
      best = { rec, len: alias.length };
  }
  if (best) return { venue: best.rec.name, city: best.rec.city, matched: true };

  return { venue: cleaned, city: guessCity(cleaned), matched: false };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CITY_HINTS = [
  "Miami Beach", "Miami Gardens", "Miami", "Fort Lauderdale", "Hollywood",
  "Sunrise", "Boca Raton", "Boca", "West Palm Beach", "Delray Beach",
  "Pompano Beach", "Dania Beach", "Coral Springs", "Coral Gables", "Jupiter",
  "Stuart", "Orlando", "Tampa", "St. Petersburg", "Gainesville", "Key West",
  "Daytona", "Kissimmee", "Wynwood", "Pembroke Pines", "Miramar", "Aventura",
  "Deerfield Beach", "Lake Worth", "Dade City", "Live Oak",
];

function guessCity(s: string): string | null {
  for (const c of CITY_HINTS) {
    if (new RegExp(`(^|[^a-z])${escapeRe(c)}([^a-z]|$)`, "i").test(s)) {
      if (c === "Boca") return "Boca Raton";
      if (c === "Wynwood") return "Miami";
      if (c === "Daytona") return "Daytona Beach";
      if (c === "Lake Worth") return "Lake Worth Beach";
      return c;
    }
  }
  return null;
}
