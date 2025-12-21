
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, uploadString } from "firebase/storage";
import { firebaseConfig } from "../firebaseConfig";
import { Character, Project, AppSettings, Location, Storyboard } from "../types";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Auth Providers
const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    console.error("Login failed:", error); // Keep logging for debug
    throw error; // Propagate error to be handled by the UI
  }
};

export const logout = async () => {
  await signOut(auth);
};

// --- FIRESTORE HELPERS ---

// Projects
export const subscribeToProjects = (userId: string, callback: (projects: Project[]) => void) => {
  const q = query(collection(db, `users/${userId}/projects`), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        storyboards: data.storyboards || data.panels || []
      } as Project;
    });
    callback(projects);
  });
};

export const saveProjectToFirestore = async (userId: string, project: Project) => {
  const projectRef = doc(db, `users/${userId}/projects`, project.id);

  // Create a deep copy to sanitize
  const cleanProject = JSON.parse(JSON.stringify(project));

  // SANITIZATION: Ensure we never save "Generating" states to the database.
  // This prevents the "infinite spinner" bug if the user reloads the page.
  if (cleanProject.storyboards && Array.isArray(cleanProject.storyboards)) {
    cleanProject.storyboards = cleanProject.storyboards.map((p: any) => ({
      ...p,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isGeneratingAudio: false
    }));
  }

  console.log(`[Firebase] Saving project ${project.id} for user ${userId}. Storyboards: ${cleanProject.storyboards?.length}`);
  try {
    await setDoc(projectRef, cleanProject, { merge: true });
    console.log(`[Firebase] Project ${project.id} saved successfully.`);
  } catch (error) {
    console.error(`[Firebase] Error saving project ${project.id}:`, error);
    throw error;
  }
};

export const deleteProjectFromFirestore = async (userId: string, projectId: string) => {
  await deleteDoc(doc(db, `users/${userId}/projects`, projectId));
};

// Characters
export const subscribeToCharacters = (userId: string, callback: (characters: Character[]) => void) => {
  const q = query(collection(db, `users/${userId}/characters`));
  return onSnapshot(q, (snapshot) => {
    const characters = snapshot.docs.map(doc => {
      const data = doc.data();
      // BACKWARD COMPATIBILITY: Handle old data where the URL was stored in 'imageBase64'.
      // If the correct 'imageUrl' property exists, use it. Otherwise, fall back to the old property.
      const imageUrl = data.imageUrl || (data as any).imageBase64;

      const character: Character = {
        id: doc.id,
        name: data.name,
        bio: data.bio,
        voiceId: data.voiceId,
        imageUrl: imageUrl || '', // Fallback to empty string if neither exists
        imageUrl2: data.imageUrl2 || '',
      };
      return character;
    });
    callback(characters);
  });
};

// Update project metadata (title, summary)
export const updateProjectMetadata = async (userId: string, projectId: string, updates: {
  title?: string;
  summary?: string;
  mode?: 'static' | 'video';
  selectedCharacterIds?: string[];
  sceneDescription?: string;
  mood?: string;
}) => {
  try {
    const projectRef = doc(db, 'users', userId, 'projects', projectId);
    await updateDoc(projectRef, {
      ...updates,
      updatedAt: Date.now()
    });
    return true;
  } catch (error) {
    console.error("Error updating project metadata:", error);
    throw error;
  }
};

// Save a character to Firestore
export const saveCharacterToFirestore = async (userId: string, character: Character) => {
  const charRef = doc(db, `users/${userId}/characters`, character.id);
  // Ensure we are saving a clean object that matches the Character type.
  const cleanCharacter = {
    id: character.id,
    name: character.name,
    bio: character.bio,
    imageUrl: character.imageUrl,
    imageUrl2: character.imageUrl2 || '',
    voiceId: character.voiceId
  };
  await setDoc(charRef, cleanCharacter, { merge: true });
};

export const deleteCharacterFromFirestore = async (userId: string, characterId: string) => {
  await deleteDoc(doc(db, `users/${userId}/characters`, characterId));
};

// Settings
export const saveSettingsToFirestore = async (userId: string, settings: AppSettings) => {
  const settingsRef = doc(db, `users/${userId}/settings`, 'preferences');
  await setDoc(settingsRef, settings, { merge: true });
};

export const getSettingsFromFirestore = (userId: string, callback: (settings: AppSettings | null) => void) => {
  return onSnapshot(doc(db, `users/${userId}/settings`, 'preferences'), (doc) => {
    if (doc.exists()) {
      callback(doc.data() as AppSettings);
    } else {
      callback(null); // Explicitly handle case where settings don't exist
    }
  });
}

// Locations
export const subscribeToLocations = (userId: string, callback: (locations: Location[]) => void) => {
  const q = query(collection(db, `users/${userId}/locations`), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const locations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
    callback(locations);
  });
};

export const saveLocationToFirestore = async (userId: string, location: Location) => {
  const locRef = doc(db, `users/${userId}/locations`, location.id);
  await setDoc(locRef, location, { merge: true });
};

export const deleteLocationFromFirestore = async (userId: string, locationId: string) => {
  await deleteDoc(doc(db, `users/${userId}/locations`, locationId));
};

// --- STORAGE HELPERS ---

// Helper to convert base64 data URI to Blob
const base64ToBlob = (dataURI: string): Blob => {
  // Split the data URI to get the MIME type and the data
  const splitDataURI = dataURI.split(',');
  const byteString = atob(splitDataURI[1]);
  const mimeString = splitDataURI[0].split(':')[1].split(';')[0];

  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type: mimeString });
};

export const uploadCharacterImage = async (userId: string, file: File): Promise<string> => {
  const storageRef = ref(storage, `users/${userId}/characters/${Date.now()}_${file.name}`);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
};

// Uploads a base64 data URL (generated by AI) to Firebase Storage
export const uploadStoryboardImageFromString = async (userId: string, base64: string): Promise<string> => {
  console.log(`[Firebase] Uploading storyboard image string for user ${userId}...`);
  const storageRef = ref(storage, `users/${userId}/storyboards/${Date.now()}.png`);

  // Convert Base64 Data URI to Blob for more reliable upload
  const blob = base64ToBlob(base64);
  console.log(`[Firebase] Blob created size: ${blob.size}`);

  try {
    const snapshot = await uploadBytes(storageRef, blob);
    console.log(`[Firebase] Upload successful. Ref: ${snapshot.ref.fullPath}`);
    const url = await getDownloadURL(snapshot.ref);
    console.log(`[Firebase] Download URL: ${url}`);
    return url;
  } catch (error) {
    console.error("[Firebase] Upload failed:", error);
    throw error;
  }
};

// Uploads a base64 data URL (generated by AI) to Firebase Storage as video
export const uploadStoryboardVideoFromString = async (userId: string, base64: string): Promise<string> => {
  console.log(`[Firebase] Uploading storyboard video string for user ${userId}...`);
  const storageRef = ref(storage, `users/${userId}/storyboards/${Date.now()}.mp4`);

  // Convert Base64 Data URI to Blob
  const blob = base64ToBlob(base64);
  console.log(`[Firebase] Video Blob created size: ${blob.size}`);

  try {
    const snapshot = await uploadBytes(storageRef, blob, { contentType: 'video/mp4' });
    console.log(`[Firebase] Video upload successful. Ref: ${snapshot.ref.fullPath}`);
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (error) {
    console.error("[Firebase] Video upload failed:", error);
    throw error;
  }
};

// Uploads a File object (manual upload) to Firebase Storage
export const uploadStoryboardImageFromFile = async (userId: string, file: File): Promise<string> => {
  const storageRef = ref(storage, `users/${userId}/storyboards/${Date.now()}_${file.name}`);

  // No timeout wrapper - let Firebase SDK handle the network connection persistence
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
};

// Uploads generated audio base64 to Firebase Storage
export const uploadStoryboardAudio = async (userId: string, base64Data: string): Promise<string> => {
  const storageRef = ref(storage, `users/${userId}/storyboard_audio/${Date.now()}.wav`);

  // Convert Base64 Data URI to Blob for more reliable upload
  const blob = base64ToBlob(base64Data);

  const snapshot = await uploadBytes(storageRef, blob);
  return await getDownloadURL(snapshot.ref);
};

export const deleteImageFromStorage = async (imageUrl: string) => {
  try {
    const storageRef = ref(storage, imageUrl);
    await deleteObject(storageRef);
  } catch (e) {
    console.warn("Could not delete image", e);
  }
};

export const uploadLocationMedia = async (userId: string, file: File): Promise<string> => {
  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
  const storageRef = ref(storage, `users/${userId}/locations/${fileName}`);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
};
