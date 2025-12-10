
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
  MapPin
} from 'lucide-react';
import { Project, Character, Panel, AVAILABLE_VOICES, AppSettings, Location } from '../types';
import { gemini } from '../services/geminiService';
import { uploadPanelImageFromString, uploadPanelImageFromFile, uploadPanelAudio, updateProjectMetadata, subscribeToLocations } from '../services/firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface Props {
  project: Project;
  characters: Character[];
  settings: AppSettings;
  user: FirebaseUser | null;
  onUpdatePanels: (panels: Panel[]) => void;
  onPanelChange: (panelId: string, updates: Partial<Panel>) => void;
  onBack: () => void;
  onSave: () => Promise<void>;
  onUpdateProjectDetails?: (title: string, summary: string) => void;
  onUpdateProject?: (updates: Partial<Project>) => void;
}

const Studio: React.FC<Props> = ({ project, characters, settings, user, onUpdatePanels, onPanelChange, onBack, onSave, onUpdateProjectDetails, onUpdateProject }) => {
  const [panels, setPanels] = useState<Panel[]>(project.panels);
  const [panelStates, setPanelStates] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(() => {
    if (project.selectedCharacterIds && project.selectedCharacterIds.length > 0) {
      return new Set(project.selectedCharacterIds);
    }
    return new Set(characters.map(c => c.id));
  });
  const [isSavingProject, setIsSavingProject] = useState(false);

  // Edit Project State
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState(project.title);
  const [editProjectSummary, setEditProjectSummary] = useState(project.summary);
  const [editSceneDesc, setEditSceneDesc] = useState(project.sceneDescription || '');
  const [editMood, setEditMood] = useState(project.mood || '');
  const [editSelectedCharacterIds, setEditSelectedCharacterIds] = useState<Set<string>>(() => {
    if (project.selectedCharacterIds && project.selectedCharacterIds.length > 0) {
      return new Set(project.selectedCharacterIds);
    }
    return new Set(characters.map(c => c.id));
  });
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
  const [playingPanelId, setPlayingPanelId] = useState<string | null>(null);

  // Mobile UI State
  const [showMobileTools, setShowMobileTools] = useState(false);

  // Refs for playback control to avoid stale closures in loops
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Manual Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPanelId, setUploadingPanelId] = useState<string | null>(null);
  const [activeUploadPanelId, setActiveUploadPanelId] = useState<string | null>(null);

  // Update selection if characters change (e.g. added new one)
  useEffect(() => {
    setSelectedCharacterIds(prev => {
      const newSet = new Set(prev);
      characters.forEach(c => {
        // Only add new characters if we are initializing or if the user hasn't explicitly deselected them?
        // For now, let's keep the behavior of adding new characters to selection to avoid confusion.
        if (!prev.has(c.id) && !project.selectedCharacterIds) newSet.add(c.id);
      });
      return newSet;
    });
  }, [characters.length, project.selectedCharacterIds]);

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
    setIsEditProjectModalOpen(true);
  };

  // SANITIZATION ON LOAD:
  useEffect(() => {
    const cleanPanels = project.panels.map(p => ({
      ...p,
      isGeneratingImage: false,
      isGeneratingAudio: false
    }));
    setPanels(cleanPanels);
  }, [project.id]);

  // Keep local panel state in sync with Smart Merge
  useEffect(() => {
    // If a batch process is running, we manage state locally to prevent conflicts.
    if (isBatchGenerating || isBatchAudioGenerating) return;

    setPanels(currentLocalPanels => {
      return project.panels.map(serverPanel => {
        const localPanel = currentLocalPanels.find(p => p.id === serverPanel.id);

        // SMART MERGE:
        // If we have a local panel with a pending upload (Data URI) and the server 
        // has nothing or an old URL, keep the local preview.
        // This prevents the image from "disappearing" while it uploads.
        if (localPanel?.imageUrl?.startsWith('data:') && (!serverPanel.imageUrl || serverPanel.imageUrl !== localPanel.imageUrl)) {
          return { ...serverPanel, imageUrl: localPanel.imageUrl };
        }

        return serverPanel;
      });
    });
  }, [project.panels, isBatchGenerating, isBatchAudioGenerating]);

  // Cleanup on unmount to prevent stuck states
  useEffect(() => {
    return () => {
      setUploadingPanelId(null);
      setIsBatchGenerating(false);
      setIsBatchAudioGenerating(false);
    };
  }, []);

  const updateLocalPanels = (newPanels: Panel[]) => {
    setPanels(newPanels);
    onUpdatePanels(newPanels);
  };

  const handleUpdateProject = async () => {
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

      // Update local state immediately for responsiveness
      setSceneDesc(editSceneDesc);
      setMood(editMood);
      setSelectedCharacterIds(new Set(editSelectedCharacterIds));

      if (onUpdateProject) {
        onUpdateProject({
          title: editProjectTitle,
          summary: editProjectSummary,
          sceneDescription: editSceneDesc,
          mood: editMood,
          selectedCharacterIds: Array.from(editSelectedCharacterIds)
        });
      } else if (onUpdateProjectDetails) {
        // Fallback for legacy support if onUpdateProject is not provided
        onUpdateProjectDetails(editProjectTitle, editProjectSummary);
      }

      setIsEditProjectModalOpen(false);
    } catch (error) {
      console.error("Failed to update project:", error);
      alert("Failed to update project details.");
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const togglePanelAudio = (panelId: string, audioUrl?: string) => {
    if (!audioUrl) return;

    if (playingPanelId === panelId) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setPlayingPanelId(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    const audio = new Audio(audioUrl);
    currentAudioRef.current = audio;

    setPlayingPanelId(panelId);

    audio.onended = () => {
      setPlayingPanelId(null);
      currentAudioRef.current = null;
    };

    audio.onerror = () => {
      setPlayingPanelId(null);
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

      const generatedPanels = await gemini.generateScript(
        sceneDesc,
        mood,
        activeCharacters,
        project.summary
      );

      const newPanels: Panel[] = generatedPanels.map(p => ({
        id: Date.now().toString() + Math.random().toString(),
        description: p.description || '',
        dialogue: p.dialogue || '',
        characterId: p.characterId,
        isGeneratingImage: false,
        isGeneratingAudio: false,
      }));

      updateLocalPanels([...panels, ...newPanels]);
      setSceneDesc('');
      if (showMobileTools) setShowMobileTools(false);
    } catch (error) {
      alert("Failed to generate script. Check console for details.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateImage = async (panelId: string) => {
    if (!user) {
      alert("Cannot generate image without a logged-in user.");
      return;
    }

    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;

    if (panel.isGeneratingAudio || isBatchAudioGenerating) {
      alert("Please wait for audio generation to finish.");
      return;
    }

    setUploadErrors(prev => {
      const newState = { ...prev };
      delete newState[panelId];
      return newState;
    });

    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isGeneratingImage: true } : p));
    setPanelStates(prev => ({ ...prev, [panelId]: 'Preparing...' }));

    try {
      const character = characters.find(c => c.id === panel.characterId);

      if (character?.imageUrl) {
        setPanelStates(prev => ({ ...prev, [panelId]: 'Fetching Ref...' }));
      }

      await new Promise(r => setTimeout(r, 100));

      setPanelStates(prev => ({ ...prev, [panelId]: 'Generating...' }));

      setPanelStates(prev => ({ ...prev, [panelId]: 'Generating...' }));

      const activeLocation = locations.find(l => l.id === activeLocationId);

      const base64ImageDataUrl = await gemini.generatePanelImage(
        panel.description,
        character,
        activeLocation
      );

      setPanels(prev => {
        const updated = prev.map(p =>
          p.id === panelId ? { ...p, imageUrl: base64ImageDataUrl, isGeneratingImage: false } : p
        );
        return updated;
      });

      setPanelStates(prev => ({ ...prev, [panelId]: 'Uploading...' }));
      setUploadingPanelId(panelId);

      try {
        const finalImageUrl = await uploadPanelImageFromString(user.uid, base64ImageDataUrl);

        // ATOMIC UPDATE: Send to parent immediately to ensure persistence
        onPanelChange(panelId, { imageUrl: finalImageUrl });

        // Also update local state for immediate UI reflection
        setPanels(prev => prev.map(p =>
          p.id === panelId ? { ...p, imageUrl: finalImageUrl } : p
        ));

      } catch (uploadError) {
        console.error("Background upload failed:", uploadError);
        setUploadErrors(prev => ({ ...prev, [panelId]: "Save failed. Image is local only." }));
      }

    } catch (error) {
      console.error("Image generation failed:", error);

      setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isGeneratingImage: false } : p));

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("timed out")) {
        alert(`Generation timed out: ${errorMessage}. Please try again.`);
      } else {
        alert(`Generation failed: ${errorMessage}`);
      }
    } finally {
      console.log(`[Studio] Generation finally block for panel ${panelId}. Clearing states.`);
      setPanelStates(prev => {
        const newState = { ...prev };
        delete newState[panelId];
        return newState;
      });
      setUploadingPanelId(null);
    }
  };

  const handleGenerateAllVisuals = async () => {
    if (isBatchAudioGenerating) {
      alert("Please wait for audio generation to complete.");
      return;
    }

    const panelsToGenerate = panels.filter(p => !p.imageUrl && !p.isGeneratingImage);
    if (panelsToGenerate.length === 0) {
      alert("All panels already have visuals!");
      return;
    }

    if (!confirm(`Generate visuals for ${panelsToGenerate.length} panels? This may take a moment.`)) return;

    setIsBatchGenerating(true);

    try {
      for (const panel of panelsToGenerate) {
        handleGenerateImage(panel.id);
        // Stagger requests
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Pulse loop
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        setPanelStates(prev => ({ ...prev }));
      }
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handleGenerateAudio = async (panelId: string, silent = false) => {
    if (!user) {
      if (!silent) alert("Cannot generate audio without a logged-in user.");
      return;
    }
    const panel = panels.find(p => p.id === panelId);
    if (!panel || !panel.dialogue) return;

    if (panel.isGeneratingImage || isBatchGenerating) {
      if (!silent) alert("Please wait for image generation to finish.");
      return;
    }

    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isGeneratingAudio: true } : p));

    try {
      const character = characters.find(c => c.id === panel.characterId);
      const voiceId = character?.voiceId || settings.defaultNarratorVoiceId || AVAILABLE_VOICES[0].id;

      const base64Audio = await gemini.generateSpeech(panel.dialogue, voiceId);

      // OPTIMISTIC UPDATE
      setPanelStates(prev => ({ ...prev, [panelId]: 'Saving Audio...' }));

      const storageAudioUrl = await uploadPanelAudio(user.uid, base64Audio);

      // ATOMIC UPDATE
      onPanelChange(panelId, { audioUrl: storageAudioUrl });

      setPanels(prev => prev.map(p =>
        p.id === panelId ? { ...p, audioUrl: storageAudioUrl, isGeneratingAudio: false } : p
      ));

    } catch (error) {
      console.error("Audio gen failed", error);
      if (!silent) alert(`Audio generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isGeneratingAudio: false } : p));
      setPanelStates(prev => {
        const newState = { ...prev };
        delete newState[panelId];
        return newState;
      });
    }
  };

  const handleGenerateAllAudio = async () => {
    if (isBatchGenerating) {
      alert("Please wait for image generation to complete.");
      return;
    }

    const panelsToGenerate = panels.filter(p => p.dialogue && !p.audioUrl && !p.isGeneratingAudio);
    if (panelsToGenerate.length === 0) {
      alert("All speech has been generated!");
      return;
    }

    if (!confirm(`Generate voiceovers for ${panelsToGenerate.length} panels?`)) return;

    setIsBatchAudioGenerating(true);
    try {
      for (const panel of panelsToGenerate) {
        // Pass 'true' for silent to avoid alert spam if one fails
        await handleGenerateAudio(panel.id, true);
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

  const deletePanel = (id: string) => {
    updateLocalPanels(panels.filter(p => p.id !== id));
  };

  const triggerFileUpload = (panelId: string) => {
    setActiveUploadPanelId(panelId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadPanelId || !user) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG).');
      return;
    }

    const panelId = activeUploadPanelId;
    setUploadingPanelId(panelId);

    setUploadErrors(prev => {
      const newState = { ...prev };
      delete newState[panelId];
      return newState;
    });

    const localUrl = URL.createObjectURL(file);
    setPanels(prev => prev.map(p =>
      p.id === panelId ? { ...p, imageUrl: localUrl } : p
    ));

    try {
      const downloadUrl = await uploadPanelImageFromFile(user.uid, file);

      // ATOMIC UPDATE
      onPanelChange(panelId, { imageUrl: downloadUrl });

      setPanels(prev => prev.map(p =>
        p.id === panelId ? { ...p, imageUrl: downloadUrl } : p
      ));

    } catch (error) {
      console.error("Manual upload failed:", error);
      setUploadErrors(prev => ({ ...prev, [panelId]: "Upload failed. Image is local only." }));
    } finally {
      setUploadingPanelId(null);
      setActiveUploadPanelId(null);
    }
  };

  const handleExport = () => {
    const safeTitle = project.title.replace(/["<>\\]/g, '');
    const panelsData = JSON.stringify(panels);
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
        img { max-width: 100%; max-height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.5s; }
        img.visible { opacity: 1; }
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
        <img id="current-img" />
        <div id="captions"></div>
    </div>
    <div id="controls">
        <button onclick="togglePlay()" id="play-btn">Pause</button>
        <button onclick="prevPanel()">Prev</button>
        <button onclick="nextPanel()">Next</button>
    </div>
    <script>
        const panels = ${panelsData};
        const characters = ${charactersData};
        const panelDelay = ${settings.panelDelay || 2000};
        let currentIndex = 0;
        let isPlaying = false;
        let audio = null;
        let timeout = null;

        function showPanel(index) {
            if (index >= panels.length) {
                isPlaying = false;
                document.getElementById('start-screen').style.display = 'flex';
                document.getElementById('start-screen').innerHTML = '<h1>The End</h1><button onclick="restart()">Replay</button>';
                return;
            }
            if (index < 0) index = 0;
            currentIndex = index;

            const panel = panels[index];
            const img = document.getElementById('current-img');
            img.classList.remove('visible');
            setTimeout(() => {
                img.src = panel.imageUrl || '';
                img.onload = () => img.classList.add('visible');
            }, 50);
            
            const captionEl = document.getElementById('captions');
            const charName = panel.characterId ? characters.find(c => c.id === panel.characterId)?.name : '';
            
            let html = '';
            if (charName) html += '<span class="character-name">' + charName + '</span>';
            html += panel.dialogue || '';
            captionEl.innerHTML = html;

            if (audio) { audio.pause(); audio = null; }
            if (timeout) { clearTimeout(timeout); timeout = null; }

            if (isPlaying) {
                if (panel.audioUrl) {
                    audio = new Audio(panel.audioUrl);
                    audio.onended = () => nextPanel();
                    audio.onerror = () => { setTimeout(nextPanel, 3000); };
                    audio.play().catch(e => { console.log("Autoplay prevented", e); setTimeout(nextPanel, 3000); });
                } else {
                    // Default delay if no audio
                    timeout = setTimeout(nextPanel, panelDelay);
                }
            }
        }

        function startPlayback() {
            document.getElementById('start-screen').style.display = 'none';
            isPlaying = true;
            currentIndex = 0;
            showPanel(0);
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
                else if (!audio) showPanel(currentIndex);
            } else {
                if (audio) audio.pause();
                if (timeout) clearTimeout(timeout);
            }
        }

        function nextPanel() {
            showPanel(currentIndex + 1);
        }

        function prevPanel() {
            showPanel(currentIndex - 1);
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
    if (panels.length === 0) return;

    isPlayingRef.current = true;
    setIsPreviewPlaying(true);
    setActivePreviewIndex(0);

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setPlayingPanelId(null);
    }

    for (let i = 0; i < panels.length; i++) {
      if (!isPlayingRef.current) break;

      setActivePreviewIndex(i);
      const panel = panels[i];

      if (panel.audioUrl) {
        await new Promise<void>((resolve) => {
          if (!isPlayingRef.current) { resolve(); return; }

          const audio = new Audio(panel.audioUrl);
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
        await new Promise(r => setTimeout(r, settings.panelDelay || 2000));
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
            <Wand2 className="text-indigo-400" size={16} />
            <h3 className="text-sm font-bold text-white">AI Script Gen</h3>
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
              <select
                value={activeLocationId}
                onChange={(e) => setActiveLocationId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 outline-none"
              >
                <option value="">None (Use Scene Desc only)</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {loc.mediaType === 'video' ? '(Video)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerateScript}
              disabled={isGeneratingScript || !sceneDesc}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-700"
            >
              {isGeneratingScript ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
              Generate Panels
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
                if (uploadingPanelId || isBatchGenerating || isBatchAudioGenerating) {
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
            onClick={handleOpenEditModal}
            className="md:hidden p-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-full text-white shadow-lg shadow-indigo-500/30"
            title="Open AI Generator"
          >
            <Wand2 size={20} />
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
          {!isPreviewPlaying && panels.some(p => p.dialogue && !p.audioUrl) && (
            <button
              onClick={handleGenerateAllAudio}
              disabled={isBatchAudioGenerating || isBatchGenerating}
              className={`flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isBatchAudioGenerating ? 'opacity-70 cursor-wait' : ''}`}
              title="Generate audio for all panels with dialogue"
            >
              {isBatchAudioGenerating ? <Loader2 className="animate-spin text-cyan-400" size={16} /> : <Volume2 size={16} className="text-cyan-400" />}
              <span className="hidden md:inline">{isBatchAudioGenerating ? 'Processing...' : 'Generate Audio'}</span>
            </button>
          )}

          {/* Generate All Visuals */}
          {!isPreviewPlaying && panels.some(p => !p.imageUrl) && (
            <button
              onClick={handleGenerateAllVisuals}
              disabled={isBatchGenerating || isBatchAudioGenerating}
              className={`flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isBatchGenerating ? 'opacity-70 cursor-wait' : ''}`}
              title="Generate visuals for all empty panels"
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
        {showMobileTools && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm md:hidden animate-fade-in">
            <div className="w-[85vw] max-w-sm bg-slate-950 h-full border-l border-slate-800 shadow-2xl p-4 flex flex-col">
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

        <div className={`flex-1 overflow-y-auto p-4 md:p-8 relative ${isPreviewPlaying ? 'bg-black' : 'bg-slate-950'}`}>

          {isPreviewPlaying ? (
            <div className="h-full flex items-center justify-center">
              <div className="aspect-video w-full max-w-5xl relative animate-fade-in">
                {panels[activePreviewIndex]?.imageUrl ? (
                  <img src={panels[activePreviewIndex].imageUrl} className="w-full h-full object-contain" alt="Panel" />
                ) : (
                  <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-500">
                    No Image Generated
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-8 pt-20">
                  {panels[activePreviewIndex]?.characterId && (
                    <span className="text-cyan-400 font-bold text-lg mb-2 block">
                      {characters.find(c => c.id === panels[activePreviewIndex].characterId)?.name}
                    </span>
                  )}
                  <p className="text-white text-2xl font-medium leading-relaxed font-sans shadow-black drop-shadow-md">
                    "{panels[activePreviewIndex]?.dialogue}"
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8 pb-20">
              {panels.length === 0 && (
                <div className="text-center py-20 opacity-50">
                  <Wand2 size={48} className="mx-auto mb-4 text-slate-600" />
                  <h2 className="text-xl text-slate-400">Your storyboard is empty.</h2>
                  <p className="text-slate-600">Use the AI Generator or add panels manually.</p>

                  {/* Mobile-only CTA to open tools if empty */}
                  <button
                    onClick={handleOpenEditModal}
                    className="md:hidden mt-6 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-lg inline-flex items-center gap-3 shadow-lg shadow-indigo-500/30 animate-pulse"
                  >
                    <Wand2 size={24} /> Open AI Generator
                  </button>
                </div>
              )}

              {panels.map((panel, index) => (
                <div key={panel.id} className="group relative bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden hover:border-slate-700 transition-all">
                  <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/50">
                    <span className="font-mono text-xs text-slate-500 font-bold">PANEL {index + 1}</span>
                    <div className="flex gap-2">
                      <button onClick={() => deletePanel(panel.id)} className="p-1.5 hover:bg-rose-500/20 hover:text-rose-400 text-slate-600 rounded">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row">
                    <div className="w-full md:w-1/2 aspect-video bg-black relative flex items-center justify-center border-r border-slate-800 group-hover:border-slate-700">
                      {panel.imageUrl ? (
                        <>
                          <img src={panel.imageUrl} alt="Panel" className="w-full h-full object-cover" />
                          {panel.characterId && (
                            <div className="absolute top-2 left-2 bg-indigo-600/90 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-indigo-400/30 z-10 pointer-events-none">
                              <User size={10} />
                              <span className="font-semibold">Ref Used</span>
                            </div>
                          )}
                          {uploadErrors[panel.id] && (
                            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/90 text-white text-[10px] px-2 py-1.5 rounded flex items-center gap-1.5 backdrop-blur-md shadow-lg animate-pulse">
                              <AlertTriangle size={12} />
                              {uploadErrors[panel.id]}
                            </div>
                          )}
                          {uploadingPanelId === panel.id && (
                            <div className="absolute bottom-2 right-2 bg-cyan-600/90 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-cyan-400/30 z-20 animate-pulse pointer-events-none">
                              <RefreshCw size={10} className="animate-spin" />
                              <span className="font-semibold">Syncing...</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center p-6 w-full">
                          <ImageIcon className="mx-auto text-slate-700 mb-2" size={32} />
                          <p className="text-xs text-slate-600 mb-4">No Visual Generated</p>

                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              onClick={() => handleGenerateImage(panel.id)}
                              disabled={panel.isGeneratingImage || uploadingPanelId === panel.id}
                              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-white transition-colors flex items-center gap-2"
                            >
                              {panel.isGeneratingImage ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} />}
                              {panel.isGeneratingImage ? 'Generating...' : 'AI Generate'}
                            </button>

                            <button
                              onClick={() => triggerFileUpload(panel.id)}
                              disabled={panel.isGeneratingImage || uploadingPanelId === panel.id}
                              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-white transition-colors flex items-center gap-2"
                            >
                              {uploadingPanelId === panel.id ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                              {uploadingPanelId === panel.id ? 'Uploading...' : 'Upload File'}
                            </button>
                          </div>

                          {panel.isGeneratingImage && panelStates[panel.id] && (
                            <span className="text-[10px] text-indigo-400 font-mono animate-pulse mt-2 block">
                              {panelStates[panel.id]}
                            </span>
                          )}
                        </div>
                      )}

                      {panel.imageUrl && (
                        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => triggerFileUpload(panel.id)}
                            className="p-2 bg-black/60 text-white rounded-lg hover:bg-indigo-600 backdrop-blur-sm"
                            title="Upload Replacement Image"
                          >
                            <Upload size={16} />
                          </button>
                          <button
                            onClick={() => handleGenerateImage(panel.id)}
                            className="p-2 bg-black/60 text-white rounded-lg hover:bg-indigo-600 backdrop-blur-sm"
                            title="Regenerate with AI"
                          >
                            <RefreshCw size={16} />
                          </button>
                        </div>
                      )}

                      {/* Blocking Overlay ONLY for generation, not upload */}
                      {panel.isGeneratingImage && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm z-20">
                          <Loader2 className="animate-spin text-white mb-2" size={24} />
                          <span className="text-xs text-white font-medium">
                            {panelStates[panel.id] || 'Processing...'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="w-full md:w-1/2 p-4 md:p-5 flex flex-col gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 font-bold uppercase mb-1">Visual Description</label>
                        <textarea
                          value={panel.description}
                          onChange={(e) => {
                            const newPanels = [...panels];
                            newPanels[index].description = e.target.value;
                            updateLocalPanels(newPanels);
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 focus:border-indigo-500 h-24 resize-none"
                        />
                      </div>

                      <div className="flex-1 flex flex-col">
                        <label className="block text-xs text-slate-500 font-bold uppercase mb-1">Dialogue / Caption</label>
                        <textarea
                          value={panel.dialogue}
                          onChange={(e) => {
                            const newPanels = [...panels];
                            newPanels[index].dialogue = e.target.value;
                            updateLocalPanels(newPanels);
                          }}
                          className="w-full flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-indigo-500 resize-none font-sans min-h-[80px]"
                        />
                      </div>

                      <div className="flex items-center gap-2 mt-auto pt-2">
                        <select
                          value={panel.characterId || ''}
                          onChange={(e) => {
                            const newPanels = [...panels];
                            newPanels[index].characterId = e.target.value;
                            updateLocalPanels(newPanels);
                          }}
                          className="bg-slate-950 border border-slate-800 rounded text-xs text-slate-300 p-2 flex-1 focus:border-indigo-500 outline-none w-full min-w-0"
                        >
                          <option value="">No Speaker (Caption)</option>
                          {characters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>

                        {panel.audioUrl && (
                          <button
                            onClick={() => togglePanelAudio(panel.id, panel.audioUrl)}
                            className={`p-2 rounded border shrink-0 transition-colors ${playingPanelId === panel.id
                              ? 'bg-rose-900/30 text-rose-400 border-rose-900 hover:bg-rose-900/50'
                              : 'bg-green-900/30 text-green-400 border-green-900 hover:bg-green-900/50'
                              }`}
                            title={playingPanelId === panel.id ? "Stop Audio" : "Play Audio"}
                          >
                            {playingPanelId === panel.id ? <StopCircle size={16} /> : <Play size={16} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleGenerateAudio(panel.id)}
                          disabled={panel.isGeneratingAudio || !panel.dialogue || panel.isGeneratingImage}
                          className={`p-2 rounded transition-colors flex items-center justify-center shrink-0 ${panel.characterId
                            ? 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30'
                            : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-500/30'
                            } ${(!panel.dialogue || panel.isGeneratingImage) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={panel.characterId ? "Generate Character Speech" : "Generate Caption/Narrator Speech"}
                        >
                          {panel.isGeneratingAudio ? (
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
                  const newPanel: Panel = {
                    id: Date.now().toString(),
                    description: '',
                    dialogue: '',
                    isGeneratingImage: false,
                    isGeneratingAudio: false,
                  };
                  updateLocalPanels([...panels, newPanel]);
                }}
                className="w-full py-4 border-2 border-dashed border-slate-800 rounded-xl text-slate-600 hover:text-indigo-400 hover:border-indigo-500/50 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={20} /> Add Blank Panel
              </button>
            </div>
          )}
        </div>
      </div>
      {isEditProjectModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center sm:p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsEditProjectModalOpen(false)}
          />

          {/* Modal / Drawer Content */}
          <div className="bg-slate-900 border-t md:border border-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg shadow-2xl relative animate-slide-up md:animate-in md:fade-in md:zoom-in duration-200 max-h-[90vh] flex flex-col z-10">
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <button
                onClick={() => setIsEditProjectModalOpen(false)}
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
                                className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-all ${isSelected
                                  ? 'bg-indigo-900/40 border-indigo-500/50'
                                  : 'bg-slate-900/30 border-transparent opacity-60 hover:opacity-100 hover:bg-slate-800'
                                  }`}
                              >
                                <img src={c.imageUrl} className={`w-5 h-5 rounded-full object-cover ${isSelected ? 'ring-1 ring-indigo-400' : ''}`} alt={c.name} />
                                <span className={`text-[10px] ${isSelected ? 'text-white font-medium' : 'text-slate-400'}`}>{c.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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
                    Save & Generate Panels
                  </button>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setIsEditProjectModalOpen(false)}
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
    </div>
  );
};



export default Studio;
