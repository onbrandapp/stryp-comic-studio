

export type ComicMode = 'static' | 'video';

export interface Character {
  id: string;
  name: string;
  bio: string;
  imageUrl: string; // URL for the reference image
  imageUrl2?: string; // Optional second reference image
  voiceId?: string; // Prebuilt voice name (e.g., 'Puck', 'Kore')
}

export interface Panel {
  id: string;
  description: string; // Scene description used for generation
  dialogue: string;
  characterId?: string; // The character speaking (if any)
  imageUrl?: string; // Generated image base64 or URL
  videoUrl?: string; // Generated video base64 or URL
  audioUrl?: string; // Generated or recorded audio URL
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  isGeneratingAudio: boolean;
}

export interface Project {
  id: string;
  title: string;
  summary: string; // Context for AI
  mode: ComicMode;
  createdAt: number;
  panels: Panel[];
  selectedCharacterIds?: string[];
  sceneDescription?: string;
  mood?: string;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  STUDIO = 'STUDIO',
  CHARACTERS = 'CHARACTERS',
  LOCATIONS = 'LOCATIONS',
  SETTINGS = 'SETTINGS',
}

export interface AppSettings {
  defaultNarratorVoiceId: string;
  panelDelay: number; // Duration in ms
}

export interface LocationMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
}

export interface Location {
  id: string;
  name: string;
  description: string; // User notes
  visualDescription?: string; // AI generated
  media?: LocationMedia[]; // New field for multiple items
  // Deprecated usage, kept for backward compatibility
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: number;
}
export interface Step {
  id: string;
  title: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
}

export const AVAILABLE_VOICES = [
  { id: 'Puck', name: 'Puck (Male, Soft)' },
  { id: 'Charon', name: 'Charon (Male, Deep)' },
  { id: 'Kore', name: 'Kore (Female, Calm)' },
  { id: 'Fenrir', name: 'Fenrir (Male, Intense)' },
  { id: 'Zephyr', name: 'Zephyr (Female, Bright)' },
];