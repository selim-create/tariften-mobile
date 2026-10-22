import { APIResponse, Recipe, PantryItem, Menu, BlogPost, RecipeFilters } from './types';
import { parseIngredients, parseSteps } from './recipeUtils';
import { RecipeCreateUnconfirmedError } from './recipe-publish';

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
      if (__DEV__) console.warn(`[Tariften API ${res.status}] GET işlemi başarısız: ${new URL(endpoint).pathname}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    // A network outage is recoverable: callers already render an empty/offline state.
    // console.error opens a full-screen RedBox in the development client.
    if (__DEV__) console.warn('Tariften API bağlantısı kurulamadı:', endpoint, error instanceof Error ? error.message : 'Bilinmeyen hata');
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
  const data = await fetchData(`${API_URL}/tariften/v1/recipes/search?${/^[1-9]\d*$/.test(slug) ? `id=${encodeURIComponent(slug)}` : `slug=${encodeURIComponent(slug)}`}`);

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

/**
 * Personal content pages are strict authenticated reads. Never turn a network
 * error or a stale Core deployment into a misleading empty "Tariflerim" state.
 */
export interface OwnedLibraryPage<T> {
  items: T[];
  total: number;
  pages: number;
  page: number;
}
async function fetchOwnedLibraryPage<T>(
  token: string, resource: 'recipes' | 'menus', page: number, expectedOwnerId: number,
): Promise<OwnedLibraryPage<T>> {
  if (!token || !Number.isInteger(expectedOwnerId) || expectedOwnerId < 1) {
    throw new Error('Tariflerini ve sofralarını görmek için giriş yapmalısın.');
  }
  const currentPage = Math.min(10000, Math.max(1, Math.trunc(page) || 1));
  const url = `${API_URL}/tariften/v1/${resource}/search?author=me&page=${currentPage}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  }
  const json: unknown = await response.json().catch(() => null);
  const data = json && typeof json === 'object' ? json as Record<string, unknown> : {};
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Oturumunu yenileyip tekrar denemelisin.');
    }
    throw new Error('İçeriklerin yüklenemedi. Birazdan tekrar dene.');
  }
  if (!Array.isArray(data.data) || !Number.isInteger(data.pages) || !Number.isInteger(data.count)) {
    throw new Error('İçerik listesi eksik geldi. Tekrar dene.');
  }
  // Old Core versions ignored author=me and returned public menu pages. This
  // positive confirmation prevents us from displaying stranger's content.
  if (resource === 'menus' && data.scope !== 'owner') {
    throw new Error('Sofralarım servisi güncelleniyor. Biraz sonra tekrar dene.');
  }
  const items = data.data as T[];
  for (const item of items) {
    const record = item as Record<string, unknown>;
    const author = record.author;
    const actualAuthorId = resource === 'menus' ? Number(record.author_id)
      : author && typeof author === 'object' ? Number((author as { id?: number }).id) : 0;
    if (actualAuthorId !== expectedOwnerId) {
      throw new Error('Hesabına ait olmayan bir içerik döndü. Lütfen tekrar dene.');
    }
  }
  return {
    items,
    total: Number(data.count),
    pages: Math.max(0, Number(data.pages)),
    page: currentPage,
  };
}

export function getOwnedRecipesPage(token: string, page: number, userId: number): Promise<OwnedLibraryPage<Recipe>> {
  return fetchOwnedLibraryPage<Recipe>(token, 'recipes', page, userId);
}
export function getOwnedMenusPage(token: string, page: number, userId: number): Promise<OwnedLibraryPage<Menu>> {
  return fetchOwnedLibraryPage<Menu>(token, 'menus', page, userId);
}

export async function getUserRecipes(token: string): Promise<Recipe[]> {
  const data = await fetchData(`${API_URL}/tariften/v1/recipes/search?author=me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.data || [];
}

export async function createRecipe(
  token: string,
  recipeData: Record<string, unknown>,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/tariften/v1/recipes/create`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(recipeData),
      signal,
    });
  } catch {
    // On mobile, network failure after POST does NOT guarantee the backend
    // didn't publish. Never encourage an automatic retry.
    throw new RecipeCreateUnconfirmedError();
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new RecipeCreateUnconfirmedError();
  }
  if (!res.ok) {
    // A server-side 5xx response can occur after the recipe was committed.
    if (res.status >= 500) throw new RecipeCreateUnconfirmedError();
    throw new Error(typeof json?.message === 'string' ? json.message : 'Tarif oluşturulamadı.');
  }
  if (json?.success !== true || !Number.isSafeInteger(Number(json.id)) || Number(json.id) < 1) {
    throw new RecipeCreateUnconfirmedError();
  }
  return json;
}

export type RecipeEditReviewStatus = {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  updated_at: string;
  note: string;
};

export async function getRecipeEditReviewStatus(
  token: string, recipeId: number, signal?: AbortSignal,
): Promise<RecipeEditReviewStatus> {
  const res = await fetch(`${API_URL}/tariften/v1/recipes/edit-review/${recipeId}`, {
    method: 'GET', headers: authHeaders(token), cache: 'no-store', signal,
  });
  const raw: unknown = await res.json().catch(() => null);
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (!res.ok) throw new Error('Tarif düzenleme durumu yüklenemedi.');
  const status = data.status;
  if (status !== 'none' && status !== 'pending' && status !== 'approved' && status !== 'rejected') {
    throw new Error('Geçersiz tarif düzenleme durumu.');
  }
  return {
    status, updated_at: typeof data.updated_at === 'string' ? data.updated_at : '',
    note: typeof data.note === 'string' ? data.note : '',
  };
}

export async function updateRecipe(
  token: string,
  recipeData: Record<string, unknown>,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/tariften/v1/recipes/update`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(recipeData),
      signal,
    });
  } catch {
    // The server could have committed the update before the connection dropped.
    throw new RecipeCreateUnconfirmedError();
  }
  const json: unknown = await res.json().catch(() => null);
  const data = json && typeof json === 'object' ? json as Record<string, unknown> : {};
  if (res.status >= 500 || (res.ok && data.success !== true)) throw new RecipeCreateUnconfirmedError();
  if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Tarif güncellenemedi.');
  return data;
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

export interface RegisterData {
  username: string;
  fullname: string;
  email: string;
  password: string;
  diet?: string;
  level?: string;
}

/** Core 1.0.47+ also signs the new member in (success, token, user). */
export interface RegisterResult {
  message?: string;
  user_id?: number;
  success?: boolean;
  token?: string;
}

export async function register(userData: RegisterData): Promise<RegisterResult> {
  const res = await fetch(`${API_URL}/tariften/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Kayıt yapılamadı');
  return data;
}

export async function forgotPassword(email: string) {
  // Never pretend an account-recovery email was sent when the endpoint is
  // offline or misconfigured. Core 1.0.15 implements the real endpoint.
  const res = await fetch(`${API_URL}/tariften/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok || data.success !== true) {
    throw new Error(data?.message || 'Şifre sıfırlama isteği gönderilemedi.');
  }
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

export async function appleAuth(identityToken: string, fullName?: string) {
  const res = await fetch(`${API_URL}/tariften/v1/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity_token: identityToken, full_name: fullName }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Apple girişi yapılamadı');
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
    kitchen_profile_completed: u.kitchen_profile_completed === true,
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
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.recipes)) return data.recipes;
  return [];
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

/** One archive page (12 menus) with the API's own total and page count. */
export async function getMenusPage(page = 1): Promise<{ data: Menu[]; count: number; pages: number; page: number }> {
  const safe = Number.isInteger(page) && page > 0 ? page : 1;
  const data = await fetchData(`${API_URL}/tariften/v1/menus/search?page=${safe}`);
  const list: Menu[] = data && Array.isArray(data.data) ? data.data : [];
  const count = Number(data?.count);
  const pages = Number(data?.pages);
  return {
    data: list,
    count: Number.isFinite(count) && count >= 0 ? count : list.length,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
    page: safe,
  };
}

/** Non-empty blog categories, largest first ("Genel" / "Uncategorized" left out). */
export async function getBlogCategories(): Promise<{ id: number; name: string; slug: string; count: number }[]> {
  try {
    const res = await fetch(`${API_URL}/wp/v2/categories?per_page=50&hide_empty=true`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((c: { count?: number; slug?: string }) => c && Number(c.count) > 0 && !/^(genel|uncategorized|kategorisiz)$/i.test(String(c.slug)))
      .map((c: { id: number; name: string; slug: string; count: number }) => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }))
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count);
  } catch {
    return [];
  }
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
}): Promise<{ data: BlogPost[]; totalPages: number; total?: number }> {
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
      if (__DEV__) console.warn(`[Tariften blog API ${res.status}]: /wp/v2/posts`);
      return { data: [], totalPages: 0 };
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
    const totalHeader = parseInt(res.headers.get('X-WP-Total') || '', 10);
    const data = await res.json();
    return { data: Array.isArray(data) ? data : [], totalPages, total: Number.isFinite(totalHeader) ? totalHeader : undefined };
  } catch (error) {
    if (__DEV__) console.warn('Tariften blog bağlantısı kurulamadı:', error instanceof Error ? error.message : 'Bilinmeyen hata');
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

export async function getComments(recipeId: number, page: number = 1, perPage: number = 10): Promise<{
  success: boolean;
  comments: import('./types').Comment[];
  pages: number;
  total: number;
}> {
  // Fail visibly on non-200 responses. A 404 route error is NOT an empty
  // comment list; returning [] would hide a broken Core deployment.
  let response: Response;
  try {
    response = await fetch(
      `${API_URL}/tariften/v1/recipes/${recipeId}/comments?page=${page}&per_page=${perPage}`
    );
  } catch {
    throw new Error('Yorum servisine bağlanılamadı. Bağlantıyı kontrol edip tekrar deneyin.');
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Yorum sunucusu beklenmeyen bir yanıt verdi. Lütfen tekrar deneyin.');
  }
  if (!response.ok) {
    const wpError = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message : 'Yorumlar yüklenemedi.';
    throw new Error(response.status === 404 && data && typeof data === 'object' &&
      'code' in data && data.code === 'rest_no_route'
        ? 'Yorum servisi henüz kullanıma hazır değil. Lütfen daha sonra tekrar deneyin.'
        : wpError);
  }
  if (!data || typeof data !== 'object' || !('comments' in data) || !Array.isArray(data.comments)) {
    throw new Error('Yorum listesinin yanıtı geçersiz. Lütfen tekrar deneyin.');
  }
  return data as { success: boolean; comments: import('./types').Comment[]; pages: number; total: number };
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

export async function deleteAccount(token: string) {
  const res = await fetch(`${API_URL}/tariften/v1/auth/delete-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || 'Hesap silinemedi.');
  }
  return await res.json();
}
