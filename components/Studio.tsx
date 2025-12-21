
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Wand2,
  Image as ImageIcon,
  MessageSquare,
  Play,
  Trash2,
  RefreshCw,
  Mic,
  Save,
  Loader2,
  StopCircle,
  User,
  Cloud,
  Upload,
  AlertTriangle,
  Sparkles,
  Volume2,
  Menu,
  X,
  Download,
  Pencil,
  Check,
  Plus,
  MapPin,
  Film,
  ChevronDown
} from 'lucide-react';
import { Project, Character, Storyboard, AVAILABLE_VOICES, AppSettings, Location } from '../types';
import { gemini } from '../services/geminiService';
import { uploadStoryboardImageFromString, uploadStoryboardImageFromFile, uploadStoryboardVideoFromString, uploadStoryboardAudio, updateProjectMetadata, subscribeToLocations } from '../services/firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface Props {
  project: Project;
  characters: Character[];
  settings: AppSettings;
  user: FirebaseUser | null;
  onUpdateStoryboards: (storyboards: Storyboard[]) => void;
  onStoryboardChange: (storyboardId: string, updates: Partial<Storyboard>) => void;
  onBack: () => void;
  onSave: () => Promise<void>;
  onUpdateProjectDetails?: (title: string, summary: string) => void;
  onUpdateProject?: (updates: Partial<Project>) => void;
}

const Studio: React.FC<Props> = ({ project, characters, settings, user, onUpdateStoryboards, onStoryboardChange, onBack, onSave, onUpdateProjectDetails, onUpdateProject }) => {
  const [storyboards, setStoryboards] = useState<Storyboard[]>(project.storyboards);
  const [storyboardStates, setStoryboardStates] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(() => {
    if (project.selectedCharacterIds) {
      return new Set(project.selectedCharacterIds);
    }
    return new Set(); // Default to NONE
  });
  const [isSavingProject, setIsSavingProject] = useState(false);

  // Edit Project State
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState(project.title);
  const [editProjectSummary, setEditProjectSummary] = useState(project.summary);
  const [editSceneDesc, setEditSceneDesc] = useState(project.sceneDescription || '');
  const [editMood, setEditMood] = useState(project.mood || '');
  const [editSelectedCharacterIds, setEditSelectedCharacterIds] = useState<Set<string>>(new Set(project.selectedCharacterIds ? Array.from(project.selectedCharacterIds) : []));
  const [editActiveLocationId, setEditActiveLocationId] = useState('');
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);

  // Generator State
  const [sceneDesc, setSceneDesc] = useState(project.sceneDescription || '');
  const [mood, setMood] = useState(project.mood || '');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isBatchAudioGenerating, setIsBatchAudioGenerating] = useState(false);

  // Preview State
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);

  // Location State
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>('');

  useEffect(() => {
    if (user) {
      const unsubscribe = subscribeToLocations(user.uid, setLocations);
      return () => unsubscribe();
    }
  }, [user]);

  // Audio Player State
  const [playingStoryboardId, setPlayingStoryboardId] = useState<string | null>(null);

  // Mobile UI State
  const [showMobileTools, setShowMobileTools] = useState(false);

  // Refs for playback control to avoid stale closures in loops
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Manual Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingStoryboardId, setUploadingStoryboardId] = useState<string | null>(null);
  const [activeUploadStoryboardId, setActiveUploadStoryboardId] = useState<string | null>(null);

  // Update selection if characters change (e.g. added new one)
  useEffect(() => {
    // Only verify we aren't losing state, but do NOT auto-select new characters
    // Logic removed to prevent auto-selecting unintended characters
  }, [characters.length]);

  // Update local generator state if project updates from outside (e.g. initial load)
  useEffect(() => {
    if (project.sceneDescription) setSceneDesc(project.sceneDescription);
    if (project.mood) setMood(project.mood);
    if (project.selectedCharacterIds) setSelectedCharacterIds(new Set(project.selectedCharacterIds));
  }, [project.title, project.summary, project.sceneDescription, project.mood, project.selectedCharacterIds]);

  const handleOpenEditModal = () => {
    setEditProjectTitle(project.title);
    setEditProjectSummary(project.summary);
    setEditSceneDesc(project.sceneDescription || '');
    setEditMood(project.mood || '');
    if (project.selectedCharacterIds) {
      setEditSelectedCharacterIds(new Set(project.selectedCharacterIds));
    } else {
      setEditSelectedCharacterIds(new Set(characters.map(c => c.id)));
    }
    setEditActiveLocationId(activeLocationId);
    setShowEditProjectModal(true);
  };

  // SANITIZATION ON LOAD:
  useEffect(() => {
    const cleanStoryboards = project.storyboards.map(p => ({
      ...p,
      isGeneratingImage: false,
      isGeneratingAudio: false
    }));
    setStoryboards(cleanStoryboards);
  }, [project.id]);

  // Keep local storyboard state in sync with Smart Merge
  useEffect(() => {
    // If a batch process is running, we manage state locally to prevent conflicts.
    if (isBatchGenerating || isBatchAudioGenerating) return;

    setStoryboards(currentLocalStoryboards => {
      return project.storyboards.map(serverStoryboard => {
        const localStoryboard = currentLocalStoryboards.find(p => p.id === serverStoryboard.id);

        // SMART MERGE:
        // If we have a local storyboard with a pending upload (Data URI) and the server 
        // has nothing or an old URL, keep the local preview.
        // This prevents the image from "disappearing" while it uploads.
        if (localStoryboard?.imageUrl?.startsWith('data:') && (!serverStoryboard.imageUrl || serverStoryboard.imageUrl !== localStoryboard.imageUrl)) {
          return { ...serverStoryboard, imageUrl: localStoryboard.imageUrl };
        }

        return serverStoryboard;
      });
    });
  }, [project.storyboards, isBatchGenerating, isBatchAudioGenerating]);

  // Cleanup on unmount to prevent stuck states
  useEffect(() => {
    return () => {
      setUploadingStoryboardId(null);
      setIsBatchGenerating(false);
      setIsBatchAudioGenerating(false);
    };
  }, []);

  const updateLocalStoryboards = (newStoryboards: Storyboard[]) => {
    setStoryboards(newStoryboards);
    onUpdateStoryboards(newStoryboards);
  };

  const handleUpdateProject = async (shouldGenerate: boolean = false) => {
    if (!user || !editProjectTitle.trim()) return;

    setIsUpdatingProject(true);
    try {
      await updateProjectMetadata(user.uid, project.id, {
        title: editProjectTitle,
        summary: editProjectSummary,
        sceneDescription: editSceneDesc,
        mood: editMood,
        selectedCharacterIds: Array.from(editSelectedCharacterIds)
      });

      // Update local state
      setSceneDesc(editSceneDesc);
      setMood(editMood);
      setSelectedCharacterIds(new Set(editSelectedCharacterIds));
      setActiveLocationId(editActiveLocationId);

      if (onUpdateProject) {
        onUpdateProject({
          title: editProjectTitle,
          summary: editProjectSummary,
          sceneDescription: editSceneDesc,
          mood: editMood,
          selectedCharacterIds: Array.from(editSelectedCharacterIds)
        });
      } else if (onUpdateProjectDetails) {
        onUpdateProjectDetails(editProjectTitle, editProjectSummary);
      }

      setShowEditProjectModal(false);

      if (shouldGenerate) {
        handleGenerateScript();
      }
    } catch (error) {
      console.error("Failed to update project", error);
      alert("Failed to save project changes");
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const toggleStoryboardAudio = (storyboardId: string, audioUrl?: string) => {
    if (!audioUrl) return;

    if (playingStoryboardId === storyboardId) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setPlayingStoryboardId(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    const audio = new Audio(audioUrl);
    currentAudioRef.current = audio;

    setPlayingStoryboardId(storyboardId);

    audio.onended = () => {
      setPlayingStoryboardId(null);
      currentAudioRef.current = null;
    };

    audio.onerror = () => {
      setPlayingStoryboardId(null);
      currentAudioRef.current = null;
      alert("Failed to play audio.");
    };

    audio.play().catch(e => console.error("Play error:", e));
  };

  const toggleCharacterSelection = (id: string) => {
    setSelectedCharacterIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Sync selectedCharacterIds to parent for persistence
  useEffect(() => {
    if (onUpdateProject) {
      // Debounce this? Or just rely on parent debounce.
      // App.tsx has a 1.5s debounce for Firestore, but updates state immediately.
      // So calling this on every click is fine for UI, but we should avoid infinite loops.
      // We only call this if the local state differs from the prop?
      // But checking equality of Sets/Arrays is annoying.
      // Let's just call it. App.tsx updates state. Studio receives new prop.
      // My prop-sync useEffect only updates local state if project.selectedCharacterIds is DIFFERENT.
      // But Set comparison is tricky.
      // Let's just trust the loop stabilizes.
      onUpdateProject({ selectedCharacterIds: Array.from(selectedCharacterIds) });
    }
  }, [selectedCharacterIds]);

  const handleGenerateScript = async () => {
    if (!sceneDesc) return;
    setIsGeneratingScript(true);
    try {
      // Filter characters based on selection
      const activeCharacters = characters.filter(c => selectedCharacterIds.has(c.id));

      const generatedStoryboards = await gemini.generateScript(
        sceneDesc,
        mood,
        activeCharacters,
        project.summary
      );

      const newStoryboards: Storyboard[] = generatedStoryboards.map(p => ({
        id: Date.now().toString() + Math.random().toString(),
        description: p.description || '',
        dialogue: p.dialogue || '',
        characterId: p.characterId,
        isGeneratingImage: false,
        isGeneratingVideo: false,
        isGeneratingAudio: false,
      }));

      updateLocalStoryboards([...storyboards, ...newStoryboards]);
      setSceneDesc('');
      if (showMobileTools) setShowMobileTools(false);
    } catch (error) {
      alert("Failed to generate script. Check console for details.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateImage = async (storyboardId: string) => {
    if (!user) {
      alert("Cannot generate image without a logged-in user.");
      return;
    }

    const storyboard = storyboards.find(p => p.id === storyboardId);
    if (!storyboard) return;

    if (storyboard.isGeneratingAudio || isBatchAudioGenerating) {
      alert("Please wait for audio generation to finish.");
      return;
    }

    setUploadErrors(prev => {
      const newState = { ...prev };
      delete newState[storyboardId];
      return newState;
    });

    setStoryboards(prev => prev.map(p => p.id === storyboardId ? { ...p, isGeneratingImage: true } : p));
    setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Preparing...' }));

    try {
      const character = characters.find(c => c.id === storyboard.characterId);

      if (character?.imageUrl) {
        setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Fetching Ref...' }));
      }

      await new Promise(r => setTimeout(r, 100));

      setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Generating...' }));

      setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Generating...' }));

      const activeLocation = locations.find(l => l.id === activeLocationId);

      const base64ImageDataUrl = await gemini.generateStoryboardImage(
        storyboard.description,
        character,
        activeLocation
      );

      setStoryboards(prev => {
        const updated = prev.map(p =>
          p.id === storyboardId ? { ...p, imageUrl: base64ImageDataUrl, isGeneratingImage: false } : p
        );
        return updated;
      });

      setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Uploading...' }));
      setUploadingStoryboardId(storyboardId);

      try {
        const finalImageUrl = await uploadStoryboardImageFromString(user.uid, base64ImageDataUrl);

        // ATOMIC UPDATE: Send to parent immediately to ensure persistence
        onStoryboardChange(storyboardId, { imageUrl: finalImageUrl });

        // Also update local state for immediate UI reflection
        setStoryboards(prev => prev.map(p =>
          p.id === storyboardId ? { ...p, imageUrl: finalImageUrl } : p
        ));

      } catch (uploadError) {
        console.error("Background upload failed:", uploadError);
        setUploadErrors(prev => ({ ...prev, [storyboardId]: "Save failed. Image is local only." }));
      }

    } catch (error) {
      console.error("Image generation failed:", error);

      setStoryboards(prev => prev.map(p => p.id === storyboardId ? { ...p, isGeneratingImage: false } : p));

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("timed out")) {
        alert(`Generation timed out: ${errorMessage}. Please try again.`);
      } else {
        alert(`Generation failed: ${errorMessage}`);
      }
    } finally {
      console.log(`[Studio] Generation finally block for storyboard ${storyboardId}. Clearing states.`);
      setStoryboardStates(prev => {
        const newState = { ...prev };
        delete newState[storyboardId];
        return newState;
      });
      setUploadingStoryboardId(null);
    }
  };

  const handleGenerateVideo = async (storyboardId: string) => {
    if (!user) {
      alert("Cannot generate video without a logged-in user.");
      return;
    }

    const storyboard = storyboards.find(p => p.id === storyboardId);
    if (!storyboard) return;

    if (storyboard.isGeneratingAudio || isBatchAudioGenerating) {
      alert("Please wait for audio generation to finish.");
      return;
    }

    setUploadErrors(prev => {
      const newState = { ...prev };
      delete newState[storyboardId];
      return newState;
    });

    setStoryboards(prev => prev.map(p => p.id === storyboardId ? { ...p, isGeneratingVideo: true } : p));
    setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Preparing...' }));

    try {
      const character = characters.find(c => c.id === storyboard.characterId);
      const activeLocation = locations.find(l => l.id === activeLocationId);

      setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Director at work...' }));
      await new Promise(r => setTimeout(r, 100));

      setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Generating Video...' }));

      const base64VideoDataUrl = await gemini.generateStoryboardVideo(
        storyboard.description,
        character,
        activeLocation
      );

      setStoryboards(prev => {
        const updated = prev.map(p =>
          p.id === storyboardId ? { ...p, videoUrl: base64VideoDataUrl, isGeneratingVideo: false } : p
        );
        return updated;
      });

      setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Uploading Film...' }));
      setUploadingStoryboardId(storyboardId);

      try {
        const finalVideoUrl = await uploadStoryboardVideoFromString(user.uid, base64VideoDataUrl);

        onStoryboardChange(storyboardId, { videoUrl: finalVideoUrl });

        setStoryboards(prev => prev.map(p =>
          p.id === storyboardId ? { ...p, videoUrl: finalVideoUrl } : p
        ));

      } catch (uploadError) {
        console.error("Background video upload failed:", uploadError);
        setUploadErrors(prev => ({ ...prev, [storyboardId]: "Save failed. Video is local only." }));
      }

    } catch (error) {
      console.error("Video generation failed:", error);
      setStoryboards(prev => prev.map(p => p.id === storyboardId ? { ...p, isGeneratingVideo: false } : p));

      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Video generation failed: ${errorMessage}`);
    } finally {
      setStoryboardStates(prev => {
        const newState = { ...prev };
        delete newState[storyboardId];
        return newState;
      });
      setUploadingStoryboardId(null);
    }
  };

  const handleGenerateAllVisuals = async () => {
    if (isBatchAudioGenerating) {
      alert("Please wait for audio generation to complete.");
      return;
    }

    const isVideoMode = project.mode === 'video';
    const storyboardsToGenerate = storyboards.filter(p => isVideoMode ? (!p.videoUrl && !p.isGeneratingVideo) : (!p.imageUrl && !p.isGeneratingImage));

    if (storyboardsToGenerate.length === 0) {
      alert(`All storyboards already have ${isVideoMode ? 'videos' : 'visuals'}!`);
      return;
    }

    if (!confirm(`Generate ${isVideoMode ? 'videos' : 'visuals'} for ${storyboardsToGenerate.length} storyboards? This may take a moment.`)) return;

    setIsBatchGenerating(true);

    try {
      for (const storyboard of storyboardsToGenerate) {
        if (isVideoMode) {
          await handleGenerateVideo(storyboard.id);
        } else {
          handleGenerateImage(storyboard.id);
        }
        // Stagger requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handleGenerateAudio = async (storyboardId: string, silent = false) => {
    if (!user) {
      if (!silent) alert("Cannot generate audio without a logged-in user.");
      return;
    }
    const storyboard = storyboards.find(p => p.id === storyboardId);
    if (!storyboard || !storyboard.dialogue) return;

    if (storyboard.isGeneratingImage || isBatchGenerating) {
      if (!silent) alert("Please wait for image generation to finish.");
      return;
    }

    setStoryboards(prev => prev.map(p => p.id === storyboardId ? { ...p, isGeneratingAudio: true } : p));

    try {
      const character = characters.find(c => c.id === storyboard.characterId);
      const voiceId = character?.voiceId || settings.defaultNarratorVoiceId || AVAILABLE_VOICES[0].id;

      const base64Audio = await gemini.generateSpeech(storyboard.dialogue, voiceId);

      // OPTIMISTIC UPDATE
      setStoryboardStates(prev => ({ ...prev, [storyboardId]: 'Saving Audio...' }));

      const storageAudioUrl = await uploadStoryboardAudio(user.uid, base64Audio);

      // ATOMIC UPDATE
      onStoryboardChange(storyboardId, { audioUrl: storageAudioUrl });

      setStoryboards(prev => prev.map(p =>
        p.id === storyboardId ? { ...p, audioUrl: storageAudioUrl, isGeneratingAudio: false } : p
      ));

    } catch (error) {
      console.error("Audio gen failed", error);
      if (!silent) alert(`Audio generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setStoryboards(prev => prev.map(p => p.id === storyboardId ? { ...p, isGeneratingAudio: false } : p));
      setStoryboardStates(prev => {
        const newState = { ...prev };
        delete newState[storyboardId];
        return newState;
      });
    }
  };

  const handleGenerateAllAudio = async () => {
    if (isBatchGenerating) {
      alert("Please wait for image generation to complete.");
      return;
    }

    const storyboardsToGenerate = storyboards.filter(p => p.dialogue && !p.audioUrl && !p.isGeneratingAudio);
    if (storyboardsToGenerate.length === 0) {
      alert("All speech has been generated!");
      return;
    }

    if (!confirm(`Generate voiceovers for ${storyboardsToGenerate.length} storyboards?`)) return;

    setIsBatchAudioGenerating(true);
    try {
      for (const storyboard of storyboardsToGenerate) {
        // Pass 'true' for silent to avoid alert spam if one fails
        await handleGenerateAudio(storyboard.id, true);
        // Stagger requests slightly to avoid flooding but allow parallel uploads
        await new Promise(r => setTimeout(r, 500));
      }
    } finally {
      setIsBatchAudioGenerating(false);
    }
  };

  const handleManualSave = async () => {
    setIsSavingProject(true);
    try {
      await onSave();
    } catch (error) {
      alert("Failed to save project manually.");
    } finally {
      // Small delay to show the success state
      setTimeout(() => setIsSavingProject(false), 500);
    }
  };

  const deleteStoryboard = (id: string) => {
    updateLocalStoryboards(storyboards.filter(p => p.id !== id));
  };

  const triggerFileUpload = (storyboardId: string) => {
    setActiveUploadStoryboardId(storyboardId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadStoryboardId || !user) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG).');
      return;
    }

    const storyboardId = activeUploadStoryboardId;
    setUploadingStoryboardId(storyboardId);

    setUploadErrors(prev => {
      const newState = { ...prev };
      delete newState[storyboardId];
      return newState;
    });

    const localUrl = URL.createObjectURL(file);
    setStoryboards(prev => prev.map(p =>
      p.id === storyboardId ? { ...p, imageUrl: localUrl } : p
    ));

    try {
      const downloadUrl = await uploadStoryboardImageFromFile(user.uid, file);

      // ATOMIC UPDATE
      onStoryboardChange(storyboardId, { imageUrl: downloadUrl });

      setStoryboards(prev => prev.map(p =>
        p.id === storyboardId ? { ...p, imageUrl: downloadUrl } : p
      ));

    } catch (error) {
      console.error("Manual upload failed:", error);
      setUploadErrors(prev => ({ ...prev, [storyboardId]: "Upload failed. Image is local only." }));
    } finally {
      setUploadingStoryboardId(null);
      setActiveUploadStoryboardId(null);
    }
  };

  const handleExport = () => {
    const safeTitle = project.title.replace(/["<>\\]/g, '');
    const storyboardsData = JSON.stringify(storyboards);
    const charactersData = JSON.stringify(characters);

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle} - Stryp Comic</title>
    <style>
        body { margin: 0; background: #020617; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        #stage { flex: 1; display: flex; items-center; justify-content: center; position: relative; background: #000; }
        #stage { flex: 1; display: flex; items-center; justify-content: center; position: relative; background: #000; overflow: hidden; }
        .media { max-width: 100%; max-height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.5s; display: none; }
        .media.visible { opacity: 1; display: block; }
        #captions { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); padding: 40px 20px 20px; text-align: center; font-size: 20px; min-height: 100px; display: flex; align-items: flex-end; justify-content: center; }
        #controls { padding: 15px; background: #0f172a; display: flex; justify-content: center; gap: 15px; }
        button { padding: 10px 24px; font-size: 16px; cursor: pointer; background: #4f46e5; color: white; border: none; border-radius: 8px; font-weight: bold; transition: background 0.2s; }
        button:hover { background: #4338ca; }
        #start-screen { position: absolute; inset: 0; background: #020617; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        h1 { margin-bottom: 20px; text-align: center; color: #e2e8f0; }
        .character-name { color: #22d3ee; font-weight: bold; margin-right: 8px; display: block; font-size: 0.8em; margin-bottom: 4px; }
    </style>
</head>
<body>
    <div id="start-screen">
        <h1>${safeTitle}</h1>
        <button onclick="startPlayback()">Start Comic</button>
    </div>
    <div id="stage">
        <img id="current-img" class="media" />
        <video id="current-vid" class="media" muted playsinline></video>
        <div id="captions"></div>
    </div>
    <div id="controls">
        <button onclick="togglePlay()" id="play-btn">Pause</button>
        <button onclick="prevStoryboard()">Prev</button>
        <button onclick="nextStoryboard()">Next</button>
    </div>
    <script>
        const storyboards = ${storyboardsData};
        const characters = ${charactersData};
        const storyboardDelay = ${settings.storyboardDelay || 2000};
        let currentIndex = 0;
        let isPlaying = false;
        let audio = null;
        let timeout = null;

        function showStoryboard(index) {
            if (index >= storyboards.length) {
                isPlaying = false;
                document.getElementById('start-screen').style.display = 'flex';
                document.getElementById('start-screen').innerHTML = '<h1>The End</h1><button onclick="restart()">Replay</button>';
                return;
            }
            if (index < 0) index = 0;
            currentIndex = index;

            const storyboard = storyboards[index];
            const img = document.getElementById('current-img');
            const vid = document.getElementById('current-vid');
            
            img.classList.remove('visible');
            vid.classList.remove('visible');
            vid.pause();

            setTimeout(() => {
                if (storyboard.videoUrl) {
                    vid.src = storyboard.videoUrl;
                    vid.oncanplay = () => {
                        vid.classList.add('visible');
                        if (isPlaying) vid.play();
                    };
                } else {
                    img.src = storyboard.imageUrl || '';
                    img.onload = () => img.classList.add('visible');
                }
            }, 50);
            
            const captionEl = document.getElementById('captions');
            const charName = storyboard.characterId ? characters.find(c => c.id === storyboard.characterId)?.name : '';
            
            let html = '';
            if (charName) html += '<span class="character-name">' + charName + '</span>';
            html += storyboard.dialogue || '';
            captionEl.innerHTML = html;

            if (audio) { audio.pause(); audio = null; }
            if (timeout) { clearTimeout(timeout); timeout = null; }

            if (isPlaying) {
                if (storyboard.audioUrl) {
                    audio = new Audio(storyboard.audioUrl);
                    audio.onended = () => nextStoryboard();
                    audio.onerror = () => { setTimeout(nextStoryboard, 3000); };
                    audio.play().catch(e => { console.log("Autoplay prevented", e); setTimeout(nextStoryboard, 3000); });
                } else {
                    // Default delay if no audio
                    timeout = setTimeout(nextStoryboard, storyboardDelay);
                }
            }
        }

        function startPlayback() {
            document.getElementById('start-screen').style.display = 'none';
            isPlaying = true;
            currentIndex = 0;
            showStoryboard(0);
            document.getElementById('play-btn').innerText = 'Pause';
        }

        function restart() {
            startPlayback();
        }

        function togglePlay() {
            isPlaying = !isPlaying;
            document.getElementById('play-btn').innerText = isPlaying ? 'Pause' : 'Play';
            if (isPlaying) {
                if (audio && audio.paused) audio.play();
                else if (!audio) showStoryboard(currentIndex);
            } else {
                if (audio) audio.pause();
                if (timeout) clearTimeout(timeout);
            }
        }

        function nextStoryboard() {
            showStoryboard(currentIndex + 1);
        }

        function prevStoryboard() {
            showStoryboard(currentIndex - 1);
        }
    </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle.replace(/\s+/g, '_').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const playPreview = async () => {
    if (storyboards.length === 0) return;

    isPlayingRef.current = true;
    setIsPreviewPlaying(true);
    setActivePreviewIndex(0);

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setPlayingStoryboardId(null);
    }

    for (let i = 0; i < storyboards.length; i++) {
      if (!isPlayingRef.current) break;

      setActivePreviewIndex(i);
      const storyboard = storyboards[i];

      if (storyboard.audioUrl) {
        await new Promise<void>((resolve) => {
          if (!isPlayingRef.current) { resolve(); return; }

          const audio = new Audio(storyboard.audioUrl);
          currentAudioRef.current = audio;

          audio.onended = () => {
            currentAudioRef.current = null;
            resolve();
          };
          audio.onerror = () => {
            currentAudioRef.current = null;
            resolve();
          };

          audio.play().catch(() => resolve());

          setTimeout(() => {
            if (currentAudioRef.current === audio) {
              resolve();
            }
          }, 30000);
        });
      } else {
        await new Promise(r => setTimeout(r, settings.storyboardDelay || 2000));
      }
    }

    isPlayingRef.current = false;
    currentAudioRef.current = null;
    setIsPreviewPlaying(false);
    setActivePreviewIndex(0);
  };

  const stopPreview = () => {
    isPlayingRef.current = false;
    setIsPreviewPlaying(false);
    setActivePreviewIndex(0);

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  };



  // Reusable Sidebar Content for both Desktop and Mobile Drawer
  const renderSidebarTools = () => (
    <div className="flex flex-col gap-4 h-full">
      <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 shadow-sm shrink-0">
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            {project.mode === 'video' ? <Film className="text-cyan-400" size={16} /> : <Wand2 className="text-indigo-400" size={16} />}
            <h3 className="text-sm font-bold text-white">AI {project.mode === 'video' ? 'Video' : 'Script'} Gen</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Scene Description</label>
              <textarea
                value={sceneDesc}
                onChange={(e) => setSceneDesc(e.target.value)}
                placeholder="Describe the scene..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white h-20 resize-none focus:border-indigo-500 outline-none"
                readOnly
                title="Use the Edit Project (pencil icon) to change this."
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Mood / Tone</label>
              <input
                type="text"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="e.g. Dark, Suspenseful"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none"
                readOnly
                title="Use the Edit Project (pencil icon) to change this."
              />
            </div>

            {/* Location Selector */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block flex items-center gap-2">
                <MapPin size={12} /> Active Location Concept
              </label>
              <button
                onClick={() => setShowLocationPicker(true)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white text-left flex items-center justify-between hover:border-indigo-500 transition-colors"
              >
                <span className="truncate">
                  {activeLocationId ? locations.find(l => l.id === activeLocationId)?.name || 'Unknown Location' : 'None (Use Scene Desc only)'}
                </span>
                <ChevronDown size={14} className="text-slate-500" />
              </button>
            </div>

            {/* Location Picker Drawer */}
            {showLocationPicker && (
              <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div
                  className="absolute inset-0 sm:hidden"
                  onClick={() => setShowLocationPicker(false)}
                />
                <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col shadow-2xl animate-slide-up">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 rounded-t-2xl">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <MapPin size={16} className="text-indigo-400" /> Select Location
                    </h3>
                    <button onClick={() => setShowLocationPicker(false)} className="p-1 hover:bg-slate-800 rounded-full text-slate-400">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-2 overflow-y-auto custom-scrollbar space-y-2">
                    <button
                      onClick={() => { setActiveLocationId(''); setShowLocationPicker(false); }}
                      className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${!activeLocationId ? 'bg-indigo-600/20 border border-indigo-500/50' : 'bg-slate-950 border border-slate-800 hover:border-slate-700'}`}
                    >
                      <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-slate-500 border border-slate-800">
                        <MapPin size={20} />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-sm text-white">None</p>
                        <p className="text-xs text-slate-500">Use scene description only</p>
                      </div>
                      {!activeLocationId && <div className="ml-auto text-indigo-400"><Check size={16} /></div>}
                    </button>

                    {locations.map(loc => {
                      const isActive = activeLocationId === loc.id;
                      const mediaUrl = (loc.media && loc.media.length > 0) ? loc.media[0].url : loc.mediaUrl;

                      return (
                        <button
                          key={loc.id}
                          onClick={() => { setActiveLocationId(loc.id); setShowLocationPicker(false); }}
                          className={`w-full p-2 rounded-xl flex items-center gap-3 transition-all ${isActive ? 'bg-indigo-600/20 border border-indigo-500/50' : 'bg-slate-950 border border-slate-800 hover:border-slate-700'}`}
                        >
                          <div className="w-12 h-12 rounded-lg bg-black overflow-hidden border border-slate-800 shrink-0">
                            {mediaUrl ? (
                              <img src={mediaUrl} alt={loc.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-700">
                                <ImageIcon size={16} />
                              </div>
                            )}
                          </div>
                          <div className="text-left min-w-0 flex-1">
                            <p className="font-bold text-sm text-white truncate">{loc.name}</p>
                            <p className="text-xs text-slate-500 truncate">{loc.description || "No description"}</p>
                          </div>
                          {isActive && <div className="ml-auto text-indigo-400 shrink-0"><Check size={16} /></div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleGenerateScript}
              disabled={isGeneratingScript || !sceneDesc}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-700"
            >
              {isGeneratingScript ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
              Generate Storyboards
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Cast Available</h4>
        <div className="space-y-2">
          {characters.map(c => {
            const isSelected = selectedCharacterIds.has(c.id);
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${isSelected
                  ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                  : 'bg-slate-900/50 border-slate-800 opacity-60'
                  }`}
                title="Use the Edit Project (pencil icon) to change selection."
              >
                <div className="relative">
                  <img src={c.imageUrl} className={`w-8 h-8 rounded-full object-cover ${isSelected ? 'ring-2 ring-indigo-400' : ''}`} alt={c.name} />
                  {isSelected && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-slate-900" />}
                </div>
                <span className={`text-sm ${isSelected ? 'text-white font-medium' : 'text-slate-400'}`}>{c.name}</span>
              </div>
            );
          })}
          {characters.length === 0 && <p className="text-xs text-slate-600">No characters in vault.</p>}
        </div>
      </div>
    </div >
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between p-4 md:px-6 md:h-16 gap-4 shrink-0 z-30">
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (uploadingStoryboardId || isBatchGenerating || isBatchAudioGenerating) {
                  if (!confirm("Uploads or generations are in progress. Leaving now may result in lost data. Are you sure?")) {
                    return;
                  }
                }
                onBack();
              }}
              className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 md:flex-none">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-white truncate max-w-[150px] md:max-w-xs">{project.title}</h1>
                <button
                  onClick={handleOpenEditModal}
                  className="text-slate-500 hover:text-white transition-colors"
                  title="Edit Project Details"
                >
                  <Pencil size={14} />
                </button>
                <span className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 whitespace-nowrap">
                  <Cloud size={10} /> Saved to Cloud
                </span>
              </div>


              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider">{project.mode} mode</span>
                <span className="sm:hidden flex items-center gap-1 text-[10px] text-emerald-500">
                  <Cloud size={10} /> Saved
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowMobileTools(true)}
            className="md:hidden p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg shadow-sm"
            title="Open Tools"
          >
            <Menu size={20} />
          </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto md:overflow-visible pb-2 md:pb-0">

          {/* Save Project Button */}
          {!isPreviewPlaying && (
            <button
              onClick={handleManualSave}
              disabled={isSavingProject}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-700/80 hover:bg-emerald-600 text-white border border-emerald-600 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              title="Force save project"
            >
              {isSavingProject ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              <span className="hidden md:inline">{isSavingProject ? 'Saving...' : 'Save Project'}</span>
            </button>
          )}

          {/* Generate All Audio */}
          {!isPreviewPlaying && storyboards.some(p => p.dialogue && !p.audioUrl) && (
            <button
              onClick={handleGenerateAllAudio}
              disabled={isBatchAudioGenerating || isBatchGenerating}
              className={`flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isBatchAudioGenerating ? 'opacity-70 cursor-wait' : ''}`}
              title="Generate audio for all storyboards with dialogue"
            >
              {isBatchAudioGenerating ? <Loader2 className="animate-spin text-cyan-400" size={16} /> : <Volume2 size={16} className="text-cyan-400" />}
              <span className="hidden md:inline">{isBatchAudioGenerating ? 'Processing...' : 'Generate Audio'}</span>
            </button>
          )}

          {/* Generate All Visuals */}
          {!isPreviewPlaying && storyboards.some(p => !p.imageUrl) && (
            <button
              onClick={handleGenerateAllVisuals}
              disabled={isBatchGenerating || isBatchAudioGenerating}
              className={`flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isBatchGenerating ? 'opacity-70 cursor-wait' : ''}`}
              title="Generate visuals for all empty storyboards"
            >
              {isBatchGenerating ? <Loader2 className="animate-spin text-amber-400" size={16} /> : <Sparkles size={16} className="text-amber-400" />}
              <span className="hidden md:inline">{isBatchGenerating ? 'Processing...' : 'Generate Visuals'}</span>
            </button>
          )}

          {/* Export / Download */}
          {!isPreviewPlaying && (
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              title="Download playable HTML file"
            >
              <Download size={16} />
              <span className="hidden lg:inline">Export</span>
            </button>
          )}

          {isPreviewPlaying ? (
            <button onClick={stopPreview} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-medium whitespace-nowrap">
              <StopCircle size={16} /> Stop Preview
            </button>
          ) : (
            <button onClick={playPreview} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-indigo-500/20 whitespace-nowrap">
              <Play size={16} /> Play Movie
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">

        {/* Desktop Sidebar */}
        <div className="w-80 border-r border-slate-800 bg-slate-900/30 p-4 hidden md:flex flex-col gap-4 overflow-y-auto">
          {renderSidebarTools()}
        </div>

        {/* Mobile Tools Drawer */}
        {/* Mobile Tools Drawer (Left Side) */}
        {showMobileTools && (
          <div className="fixed inset-0 z-50 flex justify-start bg-black/80 backdrop-blur-sm md:hidden animate-in fade-in duration-200">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={() => setShowMobileTools(false)} />

            <div className="w-[85vw] max-w-sm bg-slate-950 h-full border-r border-slate-800 shadow-2xl p-4 flex flex-col relative z-10 animate-slide-right">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Wand2 className="text-cyan-400" /> Studio Tools
                </h2>
                <button onClick={() => setShowMobileTools(false)} className="p-2 text-slate-400 hover:text-white bg-slate-900 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {renderSidebarTools()}
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative bg-slate-950">
          {/* Editor View */}
          {!isPreviewPlaying && (
            <div className="max-w-4xl mx-auto space-y-8 pb-20">
              {storyboards.length === 0 && (
                <div className="text-center py-20 opacity-50">
                  <Wand2 size={48} className="mx-auto mb-4 text-slate-600" />
                  <h2 className="text-xl text-slate-400">Your storyboard is empty.</h2>
                  <p className="text-slate-600">Use the AI Generator or add storyboards manually.</p>

                  {/* Mobile-only CTA to open tools if empty */}
                  <button
                    onClick={handleOpenEditModal}
                    className="md:hidden mt-6 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-lg inline-flex items-center gap-3 shadow-lg shadow-indigo-500/30 animate-pulse"
                  >
                    <Wand2 size={24} /> Open AI Generator
                  </button>
                </div>
              )}

              {storyboards.map((storyboard, index) => (
                <div key={storyboard.id} className="group relative bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden hover:border-slate-700 transition-all">
                  <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/50">
                    <span className="font-mono text-xs text-slate-500 font-bold">STORYBOARD {index + 1}</span>
                    <div className="flex gap-2">
                      <button onClick={() => deleteStoryboard(storyboard.id)} className="p-1.5 hover:bg-rose-500/20 hover:text-rose-400 text-slate-600 rounded">

                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row">
                    <div className="w-full md:w-1/2 aspect-video bg-black relative flex items-center justify-center border-r border-slate-800 group-hover:border-slate-700">
                      {storyboard.videoUrl ? (
                        <video
                          src={storyboard.videoUrl}
                          className="w-full h-full object-cover"
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                      ) : storyboard.imageUrl ? (
                        <img src={storyboard.imageUrl} alt="Storyboard" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center p-6 w-full">
                          <ImageIcon className="mx-auto text-slate-700 mb-2" size={32} />
                          <p className="text-xs text-slate-600 mb-4">No Visual Generated</p>

                          <div className="flex flex-wrap justify-center gap-2">
                            {project.mode === 'video' ? (
                              <button
                                onClick={() => handleGenerateVideo(storyboard.id)}
                                disabled={storyboard.isGeneratingVideo || uploadingStoryboardId === storyboard.id}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-white transition-colors flex items-center gap-2"
                              >
                                {storyboard.isGeneratingVideo ? <Loader2 className="animate-spin" size={14} /> : <Film size={14} />}
                                {storyboard.isGeneratingVideo ? 'Directing...' : 'AI Generate Video'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleGenerateImage(storyboard.id)}
                                disabled={storyboard.isGeneratingImage || uploadingStoryboardId === storyboard.id}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-white transition-colors flex items-center gap-2"
                              >
                                {storyboard.isGeneratingImage ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                                {storyboard.isGeneratingImage ? 'Generating...' : 'AI Generate Image'}
                              </button>
                            )}

                            <button
                              onClick={() => triggerFileUpload(storyboard.id)}
                              disabled={storyboard.isGeneratingImage || storyboard.isGeneratingVideo || uploadingStoryboardId === storyboard.id}
                              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-white transition-colors flex items-center gap-2"
                            >
                              {uploadingStoryboardId === storyboard.id ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                              {uploadingStoryboardId === storyboard.id ? 'Uploading...' : 'Upload File'}
                            </button>
                          </div>

                          {(storyboard.isGeneratingImage || storyboard.isGeneratingVideo) && storyboardStates[storyboard.id] && (
                            <span className="text-[10px] text-indigo-400 font-mono animate-pulse mt-2 block">
                              {storyboardStates[storyboard.id]}
                            </span>
                          )}
                        </div>
                      )}

                      {(storyboard.imageUrl || storyboard.videoUrl) && (
                        <>
                          <div className="absolute top-2 left-2 bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-indigo-400/30 z-10 pointer-events-none">
                            <User size={10} />
                            <span className="font-semibold">Ref Used</span>
                          </div>
                          {uploadErrors[storyboard.id] && (
                            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/90 text-white text-[10px] px-2 py-1.5 rounded flex items-center gap-1.5 backdrop-blur-md shadow-lg animate-pulse">
                              <AlertTriangle size={12} />
                              {uploadErrors[storyboard.id]}
                            </div>
                          )}
                          {uploadingStoryboardId === storyboard.id && (
                            <div className="absolute bottom-2 right-2 bg-cyan-600/90 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-cyan-400/30 z-20 animate-pulse pointer-events-none">
                              <RefreshCw size={10} className="animate-spin" />
                              <span className="font-semibold">Syncing...</span>
                            </div>
                          )}

                          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => triggerFileUpload(storyboard.id)}
                              className="p-2 bg-black/60 text-white rounded-lg hover:bg-indigo-600 backdrop-blur-sm"
                              title="Upload Replacement"
                            >
                              <Upload size={16} />
                            </button>
                            <button
                              onClick={() => project.mode === 'video' ? handleGenerateVideo(storyboard.id) : handleGenerateImage(storyboard.id)}
                              className="p-2 bg-black/60 text-white rounded-lg hover:bg-indigo-600 backdrop-blur-sm"
                              title="Regenerate with AI"
                            >
                              <RefreshCw size={16} />
                            </button>
                          </div>
                        </>
                      )}

                      {/* Blocking Overlay ONLY for generation, not upload */}
                      {(storyboard.isGeneratingImage || storyboard.isGeneratingVideo) && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm z-20">
                          <Loader2 className="animate-spin text-white mb-2" size={24} />
                          <span className="text-xs text-white font-medium">
                            {storyboardStates[storyboard.id] || 'Processing...'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="w-full md:w-1/2 p-4 md:p-5 flex flex-col gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 font-bold uppercase mb-1">Visual Description</label>
                        <textarea
                          value={storyboard.description}
                          onChange={(e) => {
                            const newStoryboards = [...storyboards];
                            newStoryboards[index].description = e.target.value;
                            updateLocalStoryboards(newStoryboards);
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 focus:border-indigo-500 h-24 resize-none"
                        />
                      </div>

                      <div className="flex-1 flex flex-col">
                        <label className="block text-xs text-slate-500 font-bold uppercase mb-1">Dialogue / Caption</label>
                        <textarea
                          value={storyboard.dialogue}
                          onChange={(e) => {
                            const newStoryboards = [...storyboards];
                            newStoryboards[index].dialogue = e.target.value;
                            updateLocalStoryboards(newStoryboards);
                          }}
                          className="w-full flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-indigo-500 resize-none font-sans min-h-[80px]"
                        />
                      </div>

                      <div className="flex items-center gap-2 mt-auto pt-2">
                        <select
                          value={storyboard.characterId || ''}
                          onChange={(e) => {
                            const newStoryboards = [...storyboards];
                            newStoryboards[index].characterId = e.target.value;
                            updateLocalStoryboards(newStoryboards);
                          }}
                          className="bg-slate-950 border border-slate-800 rounded text-xs text-slate-300 p-2 flex-1 focus:border-indigo-500 outline-none w-full min-w-0"
                        >
                          <option value="">No Speaker (Caption)</option>
                          {characters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>

                        {storyboard.audioUrl && (
                          <button
                            onClick={() => toggleStoryboardAudio(storyboard.id, storyboard.audioUrl)}
                            className={`p-2 rounded border shrink-0 transition-colors ${playingStoryboardId === storyboard.id
                              ? 'bg-rose-900/30 text-rose-400 border-rose-900 hover:bg-rose-900/50'
                              : 'bg-green-900/30 text-green-400 border-green-900 hover:bg-green-900/50'
                              }`}
                            title={playingStoryboardId === storyboard.id ? "Stop Audio" : "Play Audio"}
                          >
                            {playingStoryboardId === storyboard.id ? <StopCircle size={16} /> : <Play size={16} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleGenerateAudio(storyboard.id)}
                          disabled={storyboard.isGeneratingAudio || !storyboard.dialogue || storyboard.isGeneratingImage}
                          className={`p-2 rounded transition-colors flex items-center justify-center shrink-0 ${storyboard.characterId
                            ? 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30'
                            : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-500/30'
                            } ${(!storyboard.dialogue || storyboard.isGeneratingImage) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={storyboard.characterId ? "Generate Character Speech" : "Generate Caption/Narrator Speech"}
                        >
                          {storyboard.isGeneratingAudio ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : (
                            <Mic size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  const newStoryboard: Storyboard = {
                    id: Date.now().toString(),
                    description: '',
                    dialogue: '',
                    isGeneratingImage: false,
                    isGeneratingVideo: false,
                    isGeneratingAudio: false,
                  };
                  updateLocalStoryboards([...storyboards, newStoryboard]);
                }}
                className="w-full py-4 border-2 border-dashed border-slate-800 rounded-xl text-slate-600 hover:text-indigo-400 hover:border-indigo-500/50 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={20} /> Add Blank Storyboard
              </button>
            </div>
          )}
        </div>
      </div>
      {showEditProjectModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center sm:p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setShowEditProjectModal(false)}
          />

          {/* Modal / Drawer Content */}
          <div className="bg-slate-900 border-t md:border border-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg shadow-2xl relative animate-slide-up md:animate-in md:fade-in md:zoom-in duration-200 max-h-[90vh] flex flex-col z-10">
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <button
                onClick={() => setShowEditProjectModal(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Pencil size={20} className="text-indigo-400" />
                Edit Project Details
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Project Title</label>
                  <input
                    type="text"
                    value={editProjectTitle}
                    onChange={(e) => setEditProjectTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 font-bold text-lg"
                    placeholder="Project Title"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Project Summary</label>
                  <textarea
                    value={editProjectSummary}
                    onChange={(e) => setEditProjectSummary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 h-20 resize-none"
                    placeholder="Brief summary of the story..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Scene Description</label>
                    <textarea
                      value={editSceneDesc}
                      onChange={(e) => setEditSceneDesc(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-indigo-500 h-32 resize-none"
                      placeholder="Scene description..."
                    />
                  </div>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Mood / Tone</label>
                      <input
                        type="text"
                        value={editMood}
                        onChange={(e) => setEditMood(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                        placeholder="e.g. Dark"
                      />
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                      <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Cast Selection</label>
                      <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 flex-1 overflow-y-auto min-h-[80px]">
                        <div className="grid grid-cols-1 gap-1.5">
                          {characters.map(c => {
                            const isSelected = editSelectedCharacterIds.has(c.id);
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  setEditSelectedCharacterIds(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(c.id)) newSet.delete(c.id);
                                    else newSet.add(c.id);
                                    return newSet;
                                  });
                                }}
                                className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors border ${isSelected ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                              >
                                <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden shrink-0">
                                  <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                                </div>
                                <span className="text-xs font-bold truncate">{c.name}</span>
                                {isSelected && <Check size={12} className="ml-auto text-indigo-400" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location Selection */}
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold mb-1 block">Location Concept</label>
                  <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 overflow-y-auto max-h-[120px]">
                    <div className="grid grid-cols-1 gap-1.5">
                      <div
                        onClick={() => setEditActiveLocationId('')}
                        className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors border ${!editActiveLocationId ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                      >
                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                          <MapPin size={16} />
                        </div>
                        <span className="text-xs font-bold truncate">None (Use Scene Desc)</span>
                        {!editActiveLocationId && <Check size={12} className="ml-auto text-indigo-400" />}
                      </div>

                      {locations.map(loc => {
                        const isSelected = editActiveLocationId === loc.id;
                        const mediaUrl = (loc.media && loc.media.length > 0) ? loc.media[0].url : loc.mediaUrl;
                        return (
                          <div
                            key={loc.id}
                            onClick={() => setEditActiveLocationId(loc.id)}
                            className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors border ${isSelected ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                          >
                            <div className="w-8 h-8 rounded bg-slate-800 overflow-hidden shrink-0">
                              {mediaUrl ? (
                                <img src={mediaUrl} alt={loc.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><ImageIcon size={14} /></div>
                              )}
                            </div>
                            <span className="text-xs font-bold truncate">{loc.name}</span>
                            {isSelected && <Check size={12} className="ml-auto text-indigo-400" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-slate-800">
                  {/* Mobile-only Generate Button */}
                  <button
                    onClick={() => {
                      handleUpdateProject();
                      // Small delay to allow state update before generation
                      setTimeout(() => {
                        handleGenerateScript();
                      }, 100);
                    }}
                    disabled={isUpdatingProject || isGeneratingScript || !editSceneDesc}
                    className="md:hidden w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingScript ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
                    Save & Generate Storyboards
                  </button>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowEditProjectModal(false)}
                      className="px-4 py-2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateProject}
                      disabled={isUpdatingProject || !editProjectTitle.trim()}
                      className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUpdatingProject ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isPreviewPlaying && createPortal(
        <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col h-screen overflow-hidden text-white font-sans animate-in fade-in duration-300">
          {/* Start Screen / Header */}
          {/* NOTE: HTML version hides header during play. We'll show a minimal one or just text? 
               The download format is: Stage (center) -> Captions (bottom overlay) -> Controls (footer).
           */}

          <div className="flex-1 flex items-center justify-center relative bg-black">
            {storyboards[activePreviewIndex]?.videoUrl ? (
              <video
                src={storyboards[activePreviewIndex].videoUrl}
                className="max-w-full max-h-full object-contain animate-fade-in transition-opacity duration-500"
                autoPlay
                playsInline
                controls={false}
              />
            ) : storyboards[activePreviewIndex]?.imageUrl ? (
              <img
                src={storyboards[activePreviewIndex].imageUrl}
                className="max-w-full max-h-full object-contain animate-fade-in transition-opacity duration-500"
                alt="Storyboard"
              />
            ) : (
              <div className="text-slate-600 flex flex-col items-center">
                <ImageIcon size={48} className="mb-2 opacity-50" />
                <span>Generating Visuals...</span>
              </div>
            )}

            {/* Caption Overlay - Matching the HTML download style */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pb-2 text-center flex flex-col items-center justify-end min-h-[120px]">
              {storyboards[activePreviewIndex]?.characterId && (
                <span className="text-cyan-400 font-bold text-sm mb-1 uppercase tracking-wider block">
                  {characters.find(c => c.id === storyboards[activePreviewIndex].characterId)?.name}
                </span>
              )}
              <p className="text-white text-xl md:text-2xl font-medium leading-relaxed drop-shadow-md pb-4">
                {storyboards[activePreviewIndex]?.dialogue}
              </p>
            </div>
          </div>

          {/* Controls - Matching the HTML download style */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-center gap-4 shrink-0 safe-area-bottom">
            <button
              onClick={stopPreview}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-lg flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              <StopCircle size={20} /> Stop Movie
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Studio;
