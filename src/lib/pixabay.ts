export interface PixabayImage {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  previewWidth: number;
  previewHeight: number;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  imageSize: number;
  views: number;
  downloads: number;
  likes: number;
  user: string;
  userImageURL: string;
}

export interface PixabayResponse {
  total: number;
  totalHits: number;
  hits: PixabayImage[];
}

export async function searchImages(
  apiKey: string,
  query: string,
  options: {
    perPage?: number;
    page?: number;
    imageType?: 'all' | 'photo' | 'illustration' | 'vector';
    orientation?: 'all' | 'horizontal' | 'vertical';
    category?: string;
    minWidth?: number;
    minHeight?: number;
    colors?: string;
    order?: 'popular' | 'latest';
  } = {}
): Promise<PixabayResponse> {
  const {
    perPage = 20,
    page = 1,
    imageType = 'photo',
    orientation = 'all',
    category,
    minWidth = 1080,
    minHeight = 1080,
    colors,
    order = 'popular',
  } = options;

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    per_page: String(perPage),
    page: String(page),
    image_type: imageType,
    orientation,
    min_width: String(minWidth),
    min_height: String(minHeight),
    order,
    safesearch: 'true',
  });

  if (category) params.set('category', category);
  if (colors) params.set('colors', colors);

  const response = await fetch(
    `https://pixabay.com/api/?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Pixabay API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const suggestedQueries = {
  affectly: [
    'student laptop studying',
    'woman reading book',
    'studying desk notebook',
    'student library books',
    'online learning laptop',
    'university student classroom',
    'person studying notes',
    'exam preparation books',
    'student writing notebook',
    'education laptop school',
  ],
  pacebrain: [
    'runner road morning',
    'marathon runner racing',
    'trail running mountains',
    'woman jogging park',
    'running shoes athlete',
    'runner track stadium',
    'jogging city sunrise',
    'runner stretching workout',
    'marathon race finish',
    'running smartwatch fitness',
  ],
};

// Pixabay categories to constrain results per brand
export const brandCategories: Record<string, string> = {
  affectly: 'education',
  pacebrain: 'sports',
};
