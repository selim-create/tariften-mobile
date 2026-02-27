import { APIResponse, Recipe, PantryItem, Menu, BlogPost, RecipeFilters } from './types';
import { parseIngredients, parseSteps } from './recipeUtils';

const API_URL = 'https://api.tariften.com/wp-json';

/** Represents a React Native file reference for FormData uploads */
interface RNFile {
  uri: string;
  name: string;
  type: string;
}

// --- HELPER FUNCTIONS ---

async function fetchData(endpoint: string, options?: RequestInit) {
  try {
    const res = await fetch(endpoint, options);
    if (!res.ok) {
      console.error(`[API Error ${res.status}]: ${endpoint}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error('Fetch Error:', error);
    return null;
  }
}

function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// --- MEDIA UPLOAD ---
export async function uploadMedia(token: string, uri: string, name: string, type: string): Promise<number | null> {
  try {
    const formData = new FormData();
    formData.append('file', { uri, name, type } as unknown as Blob);

    const res = await fetch(`${API_URL}/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Disposition': `attachment; filename="${name}"`,
      },
      body: formData,
    });

    if (!res.ok) throw new Error('Görsel yüklenemedi');
    const data = await res.json();
    return data.id;
  } catch (error) {
    console.error('Upload Media Error:', error);
    return null;
  }
}

// --- TERMS ---
export async function getTerms() {
  const data = await fetchData(`${API_URL}/tariften/v1/terms`);
  return data || null;
}

// --- RECIPE OPERATIONS ---

export async function getRecipes(filters: RecipeFilters | string = {}): Promise<APIResponse> {
  const params = new URLSearchParams();

  if (typeof filters === 'string') {
    params.append('ingredients', filters);
  } else {
    if (filters.query) params.append('ingredients', filters.query);
    if (filters.cuisine?.length) params.append('cuisine', filters.cuisine.join(','));
    if (filters.diet?.length) params.append('diet', filters.diet.join(','));
    if (filters.mealType?.length) params.append('meal_type', filters.mealType.join(','));
    if (filters.difficulty?.length) params.append('difficulty', filters.difficulty.join(','));
    if (filters.collection?.length) params.append('collection', filters.collection.join(','));
    if (filters.source) params.append('source', filters.source);
    if (filters.sort) params.append('orderby', filters.sort);
    if (filters.page) params.append('page', filters.page.toString());
  }

  const data = await fetchData(`${API_URL}/tariften/v1/recipes/search?${params.toString()}`);
  return data || { source: 'error', count: 0, data: [] };
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const data = await fetchData(`${API_URL}/tariften/v1/recipes/search?slug=${encodeURIComponent(slug)}`);

  if (!data || !data.data || data.data.length === 0) return null;

  const recipe = data.data[0];
  recipe.ingredients = parseIngredients(recipe.ingredients);
  recipe.steps = parseSteps(recipe.steps);

  return recipe;
}

export async function getRecipeById(id: number): Promise<Recipe | null> {
  const data = await fetchData(`${API_URL}/tariften/v1/recipes/search?id=${id}`);
  return data && data.data && data.data.length > 0 ? data.data[0] : null;
}

export async function generateAIRecipe(token: string, ingredients: string) {
  const res = await fetch(`${API_URL}/tariften/v1/ai/generate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ ingredients, type: 'suggest' }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'AI yanıt vermedi.');
  return data;
}

export async function getUserRecipes(token: string): Promise<Recipe[]> {
  const data = await fetchData(`${API_URL}/tariften/v1/recipes/search?author=me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.data || [];
}

export async function createRecipe(token: string, recipeData: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/tariften/v1/recipes/create`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(recipeData),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Tarif oluşturulamadı');
  return json;
}

export async function updateRecipe(token: string, recipeData: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/tariften/v1/recipes/update`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(recipeData),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Tarif güncellenemedi');
  return json;
}

// --- AUTH ---

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/jwt-auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Giriş yapılamadı');
  return data;
}

export async function register(email: string, password: string, displayName: string) {
  const res = await fetch(`${API_URL}/tariften/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Kayıt yapılamadı');
  return data;
}

export async function googleAuth(idToken: string) {
  const res = await fetch(`${API_URL}/tariften/v1/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Google girişi yapılamadı');
  return data;
}

export async function getMe(token: string): Promise<import('./types').User | null> {
  const data = await fetchData(`${API_URL}/tariften/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!data) return null;
  // API returns { success: true, user: { ... } }
  const u = data.success && data.user ? data.user : data;
  if (!u?.id) return null;
  return {
    id: u.id,
    user_login: u.user_login || u.username || '',
    user_nicename: u.user_nicename || u.username || '',
    user_email: u.user_email || u.email || '',
    user_display_name: u.user_display_name || u.fullname || '',
    avatar_url: u.avatar_url || '',
    diet: u.diet || '',
    experience: u.experience || '',
    bio: u.bio || '',
    token,
  };
}

export async function updateProfile(token: string, profileData: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/tariften/v1/auth/update`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(profileData),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Profil güncellenemedi');
  return data;
}

export async function updateAvatar(token: string, uri: string) {
  const formData = new FormData();
  const filename = uri.split('/').pop() || 'avatar.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';
  const rnFile: RNFile = { uri, name: filename, type };
  formData.append('avatar', rnFile as unknown as Blob);

  const res = await fetch(`${API_URL}/tariften/v1/auth/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Avatar güncellenemedi');
  return data;
}

// --- PANTRY ---

export async function getPantry(token: string): Promise<PantryItem[]> {
  const data = await fetchData(`${API_URL}/tariften/v1/pantry`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

export async function updatePantry(token: string, items: PantryItem[]) {
  const res = await fetch(`${API_URL}/tariften/v1/pantry/update`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ items }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Kiler güncellenemedi');
  return data;
}

export async function analyzePantry(token: string, text: string = '', image: string = '') {
  const res = await fetch(`${API_URL}/tariften/v1/pantry/analyze`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ text, image }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Analiz başarısız.');
  return data.items;
}

// --- INTERACTIONS ---

export async function toggleInteraction(token: string, recipeId: number, type: 'favorite' | 'cooked') {
  const res = await fetch(`${API_URL}/tariften/v1/interactions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ recipe_id: recipeId, type }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'İşlem başarısız');
  return data;
}

export async function getInteractions(token: string, type: 'favorite' | 'cooked'): Promise<Recipe[]> {
  const data = await fetchData(`${API_URL}/tariften/v1/interactions/list?type=${type}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.data || [];
}

export async function checkInteraction(token: string, recipeId: number) {
  const data = await fetchData(`${API_URL}/tariften/v1/interactions/check?recipe_id=${recipeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

// --- MENUS ---

export async function getMenus(params?: { slug?: string; collection?: string }): Promise<Menu[]> {
  const urlParams = new URLSearchParams();
  if (params?.slug) urlParams.append('slug', params.slug);
  if (params?.collection) urlParams.append('collection', params.collection);

  const data = await fetchData(`${API_URL}/tariften/v1/menus/search?${urlParams.toString()}`);
  return data?.data || [];
}

export async function getMenu(slug: string): Promise<Menu | null> {
  const data = await fetchData(`${API_URL}/tariften/v1/menus/search?slug=${encodeURIComponent(slug)}`);
  if (!data) return null;
  if (data.id && data.title) return data;
  if (data.data && Array.isArray(data.data) && data.data.length > 0) return data.data[0];
  if (Array.isArray(data) && data.length > 0) return data[0];
  return null;
}

export async function updateMenu(token: string, menuData: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/tariften/v1/menus/update`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(menuData),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Menü güncellenemedi');
  return data;
}

export async function generateAIMenu(token: string, params: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/tariften/v1/ai/generate-menu`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'AI menü oluşturulamadı');
  return data;
}

// --- BLOG ---

export async function getBlogPosts(params?: {
  page?: number;
  perPage?: number;
  slug?: string;
  categories?: number[];
  exclude?: number[];
}): Promise<{ data: BlogPost[]; totalPages: number }> {
  const urlParams = new URLSearchParams();
  urlParams.append('_embed', '1');
  if (params?.page) urlParams.append('page', params.page.toString());
  if (params?.perPage) urlParams.append('per_page', params.perPage.toString());
  if (params?.slug) urlParams.append('slug', params.slug);
  if (params?.categories?.length) urlParams.append('categories', params.categories.join(','));
  if (params?.exclude?.length) urlParams.append('exclude', params.exclude.join(','));

  try {
    const res = await fetch(`${API_URL}/wp/v2/posts?${urlParams.toString()}`);
    if (!res.ok) {
      console.error(`[API Error ${res.status}]: ${API_URL}/wp/v2/posts?${urlParams.toString()}`);
      return { data: [], totalPages: 0 };
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
    const data = await res.json();
    return { data: Array.isArray(data) ? data : [], totalPages };
  } catch (error) {
    console.error('Blog posts fetch error:', error);
    return { data: [], totalPages: 0 };
  }
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const { data } = await getBlogPosts({ slug });
  return data.length > 0 ? data[0] : null;
}

// --- NEWSLETTER ---

export async function subscribeNewsletter(email: string) {
  const res = await fetch(`${API_URL}/tariften/v1/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Abone olunamadı');
  return data;
}

// --- COMMENTS ---

export async function getComments(recipeId: number, page: number = 1, perPage: number = 10) {
  const response = await fetch(
    `${API_URL}/tariften/v1/recipes/${recipeId}/comments?page=${page}&per_page=${perPage}`
  );

  if (!response.ok) throw new Error('Yorumlar yüklenemedi');
  return response.json();
}

export async function addComment(token: string, recipeId: number, content: string) {
  const response = await fetch(`${API_URL}/tariften/v1/recipes/${recipeId}/comments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Yorum eklenemedi');
  }
  return response.json();
}

export async function deleteComment(token: string, commentId: number) {
  const response = await fetch(`${API_URL}/tariften/v1/comments/${commentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Yorum silinemedi');
  }
  return response.json();
}

export async function toggleCommentLike(token: string, commentId: number) {
  const response = await fetch(`${API_URL}/tariften/v1/comments/${commentId}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Beğeni işlemi başarısız');
  return response.json();
}

// --- RATINGS ---

export async function getRecipeRating(recipeId: number) {
  try {
    const response = await fetch(`${API_URL}/tariften/v1/recipes/${recipeId}/rating`);
    if (!response.ok) return { success: false, average: 0, count: 0 };
    return response.json();
  } catch (error) {
    console.error('Rating fetch error:', error);
    return { success: false, average: 0, count: 0 };
  }
}

export async function getUserRating(token: string, recipeId: number) {
  try {
    const response = await fetch(`${API_URL}/tariften/v1/recipes/${recipeId}/rating/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { success: false, rating: null };
    return response.json();
  } catch (error) {
    console.error('User rating fetch error:', error);
    return { success: false, rating: null };
  }
}

export async function submitRating(token: string, recipeId: number, rating: number) {
  const response = await fetch(`${API_URL}/tariften/v1/recipes/${recipeId}/rating`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ rating }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Değerlendirme gönderilemedi');
  }
  return response.json();
}
