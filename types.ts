
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export enum PlaceCategory {
  EAT = 'EAT',
  DRINK = 'DRINK',
  EXPLORE = 'EXPLORE', // Merged DO + SIGHT (activities + sights)
  UNKNOWN = 'UNKNOWN'
}

export interface Review {
  author: string;
  text: string;
  type: 'user' | 'critic';
}

// DISABLED: Cost optimization - using Google ratings only (saves ~$0.08/search)
// export interface AggregatedRatings {
//   googleRating?: number;
//   yelpRating?: number;
//   tripadvisorRating?: number;
//   openTableRating?: number;
//   michelinStars?: number;
//   eaterMention?: boolean;
//   averageRating?: number;
//   totalSources: number;
// }

export interface Place {
  id: string;
  name: string;
  description: string;
  category: PlaceCategory;
  rating?: string; // e.g. "4.5 stars"
  tags: string[];
  mapLink?: string; // From grounding
  reason: string; // Detailed "why visit" / "what to eat"
  signature?: string; // Signature dishes, drinks, or things to see
  address?: string; // Street address
  phone?: string; // Phone number
  reviews: Review[];
  images: string[]; // Initially empty from Gemini, filled by Google Maps API
  isOpen?: boolean; // Whether the place is currently open (from Google Places API)
  knowBeforeYouGo?: string[]; // AI-generated practical tips (3-5 tips)
  // aggregatedRatings?: AggregatedRatings; // DISABLED: Cost optimization - using Google ratings only
  // compositeScore?: number; // DISABLED: Not needed without aggregated ratings
}

export interface LocationState {
  coords: Coordinates | null;
  city: string | null;
  error: string | null;
  loading: boolean;
}

export interface Collection {
  id: string;
  name: string;
  icon?: string; // Emoji icon
  placeIds: string[]; // IDs of places in this collection
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
}

export interface HistoryEntry {
  place: Place;
  viewedAt: number; // Timestamp
  searchQuery?: string; // What query led to this discovery
  location: string; // City/area where it was discovered
}
