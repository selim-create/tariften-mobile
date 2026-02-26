export interface User {
  id: number;
  user_login: string;
  user_nicename: string;
  user_email: string;
  user_display_name: string;
  avatar_url?: string;
  diet?: string;
  experience?: string;
  bio?: string;
  token?: string;
}

export interface Recipe {
  id: number;
  title: string;
  slug: string;
  image: string;
  excerpt: string;
  servings: string | number;
  prep_time: string | number;
  cook_time: string | number;
  calories: string | number;
  difficulty: string[];
  rating: number;
  is_favorite?: boolean;
  is_cooked?: boolean;
  ingredients: Ingredient[];
  steps: string[];
  nutrition: Nutrition;
  author: Author;
  categories: string[];
  tags: string[];
  cuisine: string[];
  diet: string[];
  meal_type: string[];
  collection?: string[];
  created_at: string;
  content?: string;
  seo?: {
    title: string;
    description: string;
  };
  chef_tip?: string;
  serving_weight?: number;
  keywords?: string;
  cooked_count?: number;
  average_rating?: number;
  rating_count?: number;
}

export interface Ingredient {
  name: string;
  amount: string | number;
  unit: string;
  note?: string;
}

export interface Step {
  order: number;
  content: string;
  image?: string;
  timer_seconds?: number;
}

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Author {
  id: number;
  name: string;
  avatar?: string;
  bio?: string;
}

export interface PantryItem {
  id: number;
  name: string;
  quantity: number | string;
  unit: string;
  expiry_date?: string;
  category?: string;
  image?: string;
  expiresIn?: string;
  status?: 'fresh' | 'warning' | 'expired';
}

export interface APIResponse {
  source: 'db' | 'ai' | 'error';
  count: number;
  pages?: number;
  data: Recipe[];
}

export interface MenuSection {
  type:
    | 'starter'
    | 'main'
    | 'side'
    | 'dessert'
    | 'drink'
    | 'soup'
    | 'meze'
    | 'hot_appetizer'
    | 'salad'
    | 'breakfast_main'
    | 'breakfast_side'
    | 'savory'
    | 'sweet'
    | 'cold_canape'
    | 'hot_bites'
    | 'dip_sauce'
    | string;
  title: string;
  recipes: Recipe[];
}

export interface Menu {
  id: number;
  title: string;
  slug: string;
  description: string;
  image: string;
  concept: string;
  guest_count: number;
  event_type: string;
  sections: MenuSection[];
  author_id: number;
  author?: Author;
  seo?: {
    title: string;
    description: string;
    keywords: string;
  };
}

export interface Comment {
  id: number;
  content: string;
  author: {
    id: number;
    name: string;
    avatar?: string;
  };
  created_at: string;
  likes?: number;
}

export interface BlogPost {
  id: number;
  date: string;
  slug: string;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  categories: number[];
  featured_media: number;
  yoast_head_json?: {
    title: string;
    description: string;
    og_title?: string;
    og_description?: string;
    og_image?: { url: string }[];
  };
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url: string;
      alt_text: string;
    }>;
  };
}

export interface RecipeFilters {
  query?: string;
  cuisine?: string[];
  diet?: string[];
  mealType?: string[];
  difficulty?: string[];
  collection?: string[];
  source?: string;
  sort?: string;
  page?: number;
}
