import { GoogleGenAI, Type, Modality, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { Character, Storyboard, Location } from '../types';

/**
 * Helper to add a RIFF/WAV header to raw PCM data (16-bit, 24kHz, Mono)
 * This allows raw data from Gemini to play in standard browser <audio> elements.
 */
function addWavHeader(base64Pcm: string, sampleRate: number = 24000): string {
  const binaryString = atob(base64Pcm);
  const dataLen = binaryString.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate (SampleRate * 2)
  view.setUint16(32, 2, true); // Block align (1 channel * 2 bytes)
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataLen, true);

  const headerUint8 = new Uint8Array(header);
  const dataUint8Array = new Uint8Array(dataLen);
  for (let i = 0; i < dataLen; i++) {
    dataUint8Array[i] = binaryString.charCodeAt(i);
  }

  const combined = new Uint8Array(44 + dataLen);
  combined.set(headerUint8, 0);
  combined.set(dataUint8Array, 44);

  // Convert back to base64 efficiently
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, combined.subarray(i, i + chunkSize) as any);
  }
  return btoa(binary);
}

// Helper to wrap promises with a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise
  ]);
}

// Optimized helper to fetch media (image/video) and convert to base64 with mime type
async function fetchMediaAsBase64(url: string): Promise<{ mimeType: string; data: string }> {
  // Optimization: If it's already a data URI, parse it directly
  if (url.startsWith('data:')) {
    const commaIndex = url.indexOf(',');
    const header = url.substring(0, commaIndex);
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
    const data = url.substring(commaIndex + 1);
    return { mimeType, data };
  }

  // WRAPPED IN TIMEOUT: Enforce strict 10s limit for media fetching (videos can be larger)
  return withTimeout((async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        credentials: 'omit',
        signal: controller.signal
      });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();

      return await new Promise<{ mimeType: string; data: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (!result) {
            reject(new Error("Empty result"));
            return;
          }
          const commaIndex = result.indexOf(',');
          if (commaIndex === -1) {
            reject(new Error("Invalid data"));
            return;
          }
          const header = result.substring(0, commaIndex);
          const base64 = result.substring(commaIndex + 1);
          // Trust the blob type first, fallback to header
          const mimeType = blob.type || header.match(/:(.*?);/)?.[1] || 'image/png';
          resolve({ mimeType, data: base64 });
        };
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsDataURL(blob);
      });

    } catch (error) {
      clearTimeout(id);
      console.warn("Media fetch failed. If this is a CORS error, you may need to configure your storage bucket.", error);
      throw error;
    }
  })(), 60000, "Media fetch timed out (60s). File might be too large or connection too slow.");
}


class GeminiService {
  private clientInstance: any = null;

  private getApiKey(): string {
    return import.meta.env.VITE_GEMINI_API_KEY ||
      import.meta.env.GEMINI_API_KEY ||
      (typeof process !== 'undefined' ? (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) : '') ||
      '';
  }

  private getClient() {
    if (this.clientInstance) return this.clientInstance;

    const apiKey = this.getApiKey();
    this.clientInstance = new GoogleGenAI({ apiKey });
    return this.clientInstance;
  }

  // Generate a script (list of storyboards)
  async generateScript(
    sceneDescription: string,
    mood: string,
    characters: Character[],
    existingContext: string
  ): Promise<Partial<Storyboard>[]> {

    const characterContext = characters
      .map(c => `${c.name}: ${c.bio}`)
      .join('\n');

    const prompt = `
      Create a comic strip script.
      Context: ${existingContext}
      Scene Description: ${sceneDescription}
      Mood: ${mood}
      Characters available:
      ${characterContext}

      Output a JSON array of storyboards. Each storyboard must have:
      - "description": A detailed visual description for an image generator. Include specific camera angles (e.g., 'Wide shot', 'Close up') and lighting details.
      - "dialogue": The text spoken in the storyboard (or caption).
      - "characterName": The name of the character speaking (if any).
    `;

    try {
      const response = await this.getClient().models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                dialogue: { type: Type.STRING },
                characterName: { type: Type.STRING },
              },
              required: ['description', 'dialogue']
            }
          }
        }
      });

      const data = JSON.parse(response.text || '[]');

      return data.map((item: any) => {
        const char = characters.find(c => c.name.toLowerCase() === item.characterName?.toLowerCase());
        return {
          description: item.description,
          dialogue: item.dialogue,
          characterId: char ? char.id : undefined,
        };
      });

    } catch (error) {
      console.error("Script generation failed:", error);
      throw error;
    }
  }

  // Helper to get a visual description from a Location (Images or Videos)
  async getLocationVisualDescription(mediaItems: { url: string, type: 'image' | 'video' }[]): Promise<string> {
    if (!mediaItems || mediaItems.length === 0) return '';

    try {
      const parts: any[] = [];

      // Fetch all media items
      for (const item of mediaItems) {
        try {
          const media = await fetchMediaAsBase64(item.url);
          parts.push({ inlineData: { mimeType: media.mimeType, data: media.data } });
        } catch (e) {
          console.warn("Skipping failed media item:", item.url, e);
        }
      }

      if (parts.length === 0) throw new Error("No media could be loaded");

      const prompt = `Analyze these ${mediaItems.length} images/videos in detail for use as a background location reference in a comic book generation prompt.
      
      These items represent different angles or details of the SAME location. Combine them to create one unified visual description.
      
      Describe the:
      1. Lighting (Time of day, direction, color, intensity)
      2. Color Palette (Dominant colors, mood)
      3. Environment/Setting (Indoors/Outdoors, key landmarks, architecture, nature elements)
      4. Atmosphere (Peaceful, chaotic, futuristic, rustic, etc.)
      5. Textures and Materials (Wood, stone, neon, water, etc.)

      Do NOT describe any people or characters in the scene. Focus ONLY on the location/background.
      Keep it descriptive but concise.`;

      parts.push({ text: prompt });

      const response = await this.getClient().models.generateContent({
        model: 'gemini-2.0-flash',
        contents: { parts }
      });

      return response.text || '';
    } catch (error) {
      console.warn("Failed to get location description:", error);
      throw error;
    }
  }

  // Helper to get a visual description from an image using Gemini Vision
  async getCharacterVisualDescription(character: Character): Promise<string> {
    if (!character.imageUrl) return character.bio || '';

    try {
      const parts: any[] = [];

      // Add first image
      const img1 = await fetchMediaAsBase64(character.imageUrl);
      parts.push({ inlineData: { mimeType: img1.mimeType, data: img1.data } });

      // Add second image if it exists
      if (character.imageUrl2) {
        try {
          const img2 = await fetchMediaAsBase64(character.imageUrl2);
          parts.push({ inlineData: { mimeType: img2.mimeType, data: img2.data } });
        } catch (e) {
          console.warn("Failed to fetch second image:", e);
        }
      }

      const prompt = `Describe this character's physical appearance in detail for an image generator prompt. 
      Focus on hair, eyes, clothing, facial features, and style. 
      If there are two images, combine the details to create a consistent description.
      Ignore the background. 
      Keep it concise but descriptive.`;

      parts.push({ text: prompt });

      const response = await this.getClient().models.generateContent({
        model: 'gemini-2.0-flash',
        contents: { parts }
      });

      return (response.text || '') + (character.bio ? ` Context: ${character.bio}` : '');
    } catch (error) {
      console.warn("Failed to get visual description:", error);
      return character.bio || '';
    }
  }

  // Generate an image for a storyboard
  async generateStoryboardImage(
    storyboardDescription: string,
    character?: Character,
    location?: Location
  ): Promise<string> {
    try {
      let prompt = '';
      let visualDescription = '';
      let locationContext = '';

      // 1. Process Location Context
      if (location && location.visualDescription) {
        locationContext = `
          SETTING / LOCATION REFERENCE:
          ${location.visualDescription}
          
          Start the scene with this setting. Ensure the background matches this description accurately.
        `;
      }

      // 2. Get Visual Description if character exists
      if (character) {
        // Use the bio as a fallback or base, but try to get a visual description
        visualDescription = await this.getCharacterVisualDescription(character);

        prompt = `
(Technical Specs): 3D render, Pixar-style animation to look like a movie screencap. High quality, 8k resolution, cinematic lighting.

(Subject & Action): 
Visual Appearance (PRIORITY): ${visualDescription}.
Character Name: "${character.name}" (Note: Rely on Visual Appearance for species/loops, ignore name bias).
Action: ${storyboardDescription}

(Setting): ${locationContext ? locationContext : 'Background matches the mood/action.'}
IMPORTANT: The background MUST match the Setting description accurately.

(Style): 3D Pixar-style animation.`;
      } else {
        prompt = `
(Technical Specs): 3D render, Pixar-style animation to look like a movie screencap. High quality, 8k resolution, cinematic lighting.

(Scene Description): ${storyboardDescription}. 

(Setting): ${locationContext ? locationContext : 'Background matches the mood/action.'}
IMPORTANT: The background MUST match the Setting description accurately.

(Style): 3D Pixar-style animation.`;
      }

      console.log("Generating image with prompt:", prompt);

      try {
        // Use proper SDK method for @google/genai
        const result = await withTimeout<any>(
          // @ts-ignore
          this.getClient().models.generateContent({
            model: 'gemini-2.5-flash-image', // Reverted to specialized image generation model
            contents: [{
              role: 'user',
              parts: [{ text: "Generate an image based on this description:\n\n" + prompt }]
            }],
            config: {
              safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
              ]
            }
          }),
          90000,
          "Image generation timed out"
        );

        // Result from new SDK might be the response itself or contain it
        const response = result.response || result;
        const candidates = response.candidates;

        if (!candidates || candidates.length === 0) {
          throw new Error("No candidates returned");
        }

        // Check for inlineData (image)
        // Access safely with optional chaining
        const parts = candidates[0].content?.parts;
        const imagePart = parts?.find((p: any) => p.inlineData);

        if (imagePart && imagePart.inlineData) {
          return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
        }

        throw new Error("No image generated in response. The model may have returned text instead.");

      } catch (error: any) {
        console.error("Image generation error:", error);
        if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota") || error.message?.toLowerCase().includes("limit") || error.message?.includes("RESOURCE_EXHAUSTED")) {
          throw new Error("Quota exceeded: You have reached your API limit for image generation. Please try again later or check your billing details.");
        }
        throw error;
      }
    } catch (error) {
      console.error("Panel generation process failed:", error);
      throw error;
    }
  }

  // Generate a video for a storyboard
  async generateStoryboardVideo(
    storyboardDescription: string,
    character?: Character,
    location?: Location
  ): Promise<string> {
    try {
      let prompt = '';
      let visualDescription = '';
      let locationContext = '';

      if (location && location.visualDescription) {
        locationContext = `SETTING: ${location.visualDescription}`;
      }

      if (character) {
        visualDescription = await this.getCharacterVisualDescription(character);
        prompt = `
          High-end 3D animated cinematic video, 8K resolution, Pixar and Disney influence.
          Style: Vibrant colors, professional lighting, expressive character animation.
          Character: ${visualDescription}.
          Action: ${storyboardDescription}.
          ${locationContext}
          Motion: Dynamic but smooth camera work.
          Duration: 8 seconds. High-fidelity spatial audio.
        `;
      } else {
        prompt = `
          High-end 3D animated cinematic video, 8K resolution, Pixar and Disney influence.
          Style: Vibrant colors, professional lighting.
          Action: ${storyboardDescription}.
          ${locationContext}
          Motion: Smooth cinematic pans.
          Duration: 8 seconds. High-fidelity spatial audio.
        `;
      }

      console.log("Generating video with prompt:", prompt);

      const client = this.getClient();

      // 1. START ASYNC GENERATION
      const generationOp = await client.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: prompt
      });

      console.log("[GeminiService] generationOp raw:", generationOp);

      if (!generationOp) {
        throw new Error("Video generation request returned no data (undefined). Check your API key and permissions.");
      }

      const operationName = generationOp.name;
      if (!operationName) {
        // Log generationOp keys very clearly to understand failure
        const keys = generationOp ? Object.keys(generationOp).join(', ') : 'null/undefined';
        console.error("[GeminiService] generationOp does not have a 'name' property. Keys:", keys);

        // Final attempt to find a name property (sometimes nested)
        const nestedName = (generationOp as any).operation?.name || (generationOp as any).metadata?.name;
        if (!nestedName) {
          throw new Error(`Video generation started but operation name is missing. Response structure: ${keys}`);
        }

        console.log(`[GeminiService] Found operation name in nested property: ${nestedName}`);
        (generationOp as any).name = nestedName; // Self-heal for the loop
      }

      const verifiedOperationName = generationOp.name;
      console.log(`[GeminiService] Video generation started. Operation: ${verifiedOperationName}`);

      // 2. POLL FOR COMPLETION (Using Direct REST API for maximum reliability)
      let operation: any = null;
      const startTime = Date.now();
      const MAX_POLL_TIME = 420000; // 7 minutes
      const POLL_INTERVAL = 10000; // 10 seconds

      const apiKey = this.getApiKey();
      // Ensure operationName is clean (e.g., models/...)
      const cleanOpName = operationName.startsWith('operations/') ? `models/veo-3.1-generate-preview/${operationName}` : operationName;
      const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${cleanOpName}?key=${apiKey}`;

      console.log(`[GeminiService] Starting REST polling at: ${pollUrl}`);

      while (true) {
        if (Date.now() - startTime > MAX_POLL_TIME) {
          throw new Error("Video generation timed out (7 minute limit reached).");
        }

        try {
          const resp = await fetch(pollUrl);
          if (!resp.ok) {
            console.warn(`[GeminiService] Polling HTTP error: ${resp.status}`);
          } else {
            const data = await resp.json();
            operation = data;

            console.log(`[GeminiService] Operation status: ${operation.done ? 'DONE' : 'PENDING'}`);

            if (operation.done) {
              console.log("[GeminiService] Video generation complete.");
              break;
            }
          }
        } catch (pollError: any) {
          console.warn("[GeminiService] REST Polling failed:", pollError.message);
        }

        console.log(`[GeminiService] Waiting ${POLL_INTERVAL / 1000}s before next REST check...`);
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }

      // 3. HANDLE RESPONSE
      if (operation.error) {
        console.error("[GeminiService] Video operation error:", operation.error);
        throw new Error(`Video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`);
      }

      const response = operation.response;
      if (!response) {
        console.error("[GeminiService] Operation done but no response:", JSON.stringify(operation, null, 2));
        throw new Error("Video generation completed but returned an empty response.");
      }

      // Log the full response for debugging
      console.log("[GeminiService] Video operation response keys:", Object.keys(response));
      if (response.video) console.log("[GeminiService] response.video keys:", Object.keys(response.video));

      const videoCandidate = response.candidates?.[0] || response.videoCandidates?.[0] || response;
      const videoPart = videoCandidate?.content?.parts?.find((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('video/')) ||
        videoCandidate?.inlineData ||
        (videoCandidate?.video ? videoCandidate.video : null);

      if (videoPart && videoPart.inlineData) {
        return `data:${videoPart.inlineData.mimeType};base64,${videoPart.inlineData.data}`;
      } else if (videoCandidate?.data && videoCandidate?.mimeType) {
        // Direct inlineData structure
        return `data:${videoCandidate.mimeType};base64,${videoCandidate.data}`;
      } else if (response.video?.data && response.video?.mimeType) {
        // Nested video data
        return `data:${response.video.mimeType};base64,${response.video.data}`;
      }

      // Fallback: Check if it's in a different property
      if (response.video?.uri || response.uri) {
        throw new Error("Video generated but returned as URI which is not yet supported in this flow. Please ensure your API key supports inline data returns.");
      }

      console.error("[GeminiService] Video response structure unknown:", JSON.stringify(response, null, 2));
      throw new Error("No video data found in the generation response. Please check the console for structure details.");

    } catch (error: any) {
      console.error("Storyboard video generation failed:", error);

      const errorMessage = error.message || String(error);

      // Specialize 429 Quota error for better user feedback
      if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.toLowerCase().includes("quota")) {
        throw new Error("VIDEO QUOTA EXCEEDED: Veo 3.1 video generation is highly limited. Please check your Google AI Studio quota or try a smaller project. You may need to enable billing if you are on a free tier.");
      }

      throw new Error(errorMessage);
    }
  }

  // Generate TTS audio
  async generateSpeech(text: string, voiceName: string = 'Puck'): Promise<string> {
    try {
      // Wrapped in timeout to prevent hanging if the API is slow
      const response = await withTimeout<GenerateContentResponse>(
        this.getClient().models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ role: 'user', parts: [{ text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            },
            // Unified SDK prefers snake_case for many parameters
            // @ts-ignore
            audio_config: {
              audio_encoding: 'MP3'
            }
          }
        }),
        20000,
        "Audio generation timed out"
      );
      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;

      if (!base64Audio) {
        throw new Error("No audio generated. Check AI safety settings or dialogue content.");
      }

      // WRAP RAW PCM IN WAV HEADER
      const wavBase64 = addWavHeader(base64Audio, 24000);

      return `data:audio/wav;base64,${wavBase64}`;

    } catch (error: any) {
      console.error("Speech generation failed:", error);
      const errorMessage = error.message || String(error);

      if (errorMessage.includes("403") || errorMessage.toLowerCase().includes("permission") || errorMessage.toLowerCase().includes("api key")) {
        throw new Error("Audio generation is not enabled for this API key yet. Please ensure you are using a key from a region that supports Gemini 2.0 Audio.");
      }

      throw new Error(`Audio generation failed: ${errorMessage}`);
    }
  }
}

export const gemini = new GeminiService();
