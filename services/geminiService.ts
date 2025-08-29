import type { Nft } from './reservoirService';

/**
 * Streams a creative description for a given NFT from the backend Gemini API.
 * It automatically handles various media types (images, gifs, videos) by
 * converting them to a static image for visual analysis and includes NFT traits.
 * @param nft The NFT object containing metadata, media URL, and attributes.
 * @returns An async generator that yields text chunks of the description.
 */
export async function* streamNftDescription(
  nft: Nft,
): AsyncGenerator<string, void, undefined> {
  try {
    // Use local backend for development, production backend for production
    const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';
    const response = await fetch(`${BACKEND_URL}/api/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nft }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Handle rate limiting specifically
      if (response.status === 429) {
        throw new Error('Too many requests. Please try again in a moment.');
      }
      
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body available for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          yield chunk;
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    console.error('Error streaming from backend Gemini API:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred.';
    yield `Error: Could not generate content for "${nft.name}". ${errorMessage}`;
    // Re-throwing allows the caller to handle the error state definitively.
    throw new Error(errorMessage);
  }
}