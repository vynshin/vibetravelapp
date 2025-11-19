
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export enum PlaceCategory {
  EAT = 'EAT',
  DO = 'DO',
  DRINK = 'DRINK',
  SIGHT = 'SIGHT',
  UNKNOWN = 'UNKNOWN'
}

export interface Review {
  author: string;
  text: string;
  type: 'user' | 'critic';
}

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
}

export interface LocationState {
  coords: Coordinates | null;
  city: string | null;
  error: string | null;
  loading: boolean;
}
