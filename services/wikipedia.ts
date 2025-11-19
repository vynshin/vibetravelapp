
export const fetchWikiImage = async (query: string): Promise<string | null> => {
  try {
    // Search for the page matches and get the main page image
    // origin=* is required for CORS to work directly from browser
    const endpoint = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=1&gsrsearch=${encodeURIComponent(query)}&prop=pageimages&pithumbsize=800`;
    
    const res = await fetch(endpoint);
    const data = await res.json();
    
    if (data.query?.pages) {
        const pages = Object.values(data.query.pages);
        if (pages.length > 0) {
            const page = pages[0] as any;
            return page.thumbnail?.source || null;
        }
    }
    return null;
  } catch (err) {
    console.warn("Wiki fetch failed", err);
    return null;
  }
};
