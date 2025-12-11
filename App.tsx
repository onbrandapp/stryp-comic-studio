
import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  Plus,
  Settings,
  Film,
  Image as ImageIcon,
  Trash2,
  Mic,
  Save,
  LogOut,
  Loader2,
  Zap,
  AlertCircle,
  Pencil,
  Play,
  MapPin,
  Menu,
  X
} from 'lucide-react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

import { Project, Character, ViewState, ComicMode, AVAILABLE_VOICES, Panel, AppSettings } from './types';
import CharacterVault from './components/CharacterVault';
import LocationVault from './components/LocationVault';
import Studio from './components/Studio';
import Settings from './components/Settings';
import {
  auth,
  loginWithGoogle,
  logout,
  subscribeToProjects,
  subscribeToCharacters,
  saveProjectToFirestore,
  saveSettingsToFirestore,
  getSettingsFromFirestore,
  deleteProjectFromFirestore,
  updateProjectMetadata
} from './services/firebase';

const INITIAL_SETTINGS: AppSettings = {
  defaultNarratorVoiceId: AVAILABLE_VOICES[0].id,
  panelDelay: 2000 // Default 2 seconds
};

const App = () => {
  const [apiKeyVerified, setApiKeyVerified] = useState(false);
  const [checkingApiKey, setCheckingApiKey] = useState(true);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);

  // Mobile Nav State
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [projects, setProjects] = useState<Project[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // New Project Modal State
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectSummary, setNewProjectSummary] = useState('');
  const [newProjectMode, setNewProjectMode] = useState<ComicMode>('static');

  // Edit Project Modal State
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectTitle, setEditProjectTitle] = useState('');
  const [editProjectSummary, setEditProjectSummary] = useState('');
  const [editProjectMode, setEditProjectMode] = useState<ComicMode>('static');
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);

  // Debounce refs for auto-saving project updates to Firestore
  const saveTimeoutRef = useRef<any>(null);

  // 1. Check for API Key Selection (Mandatory for Gemini 3 Pro features)
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
          // Add a timeout to prevent the app from hanging if the external API is unresponsive.
          const keyCheckPromise = (window as any).aistudio.hasSelectedApiKey();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('API key check timed out')), 3000) // 3 second timeout
          );

          const hasKey = await Promise.race([keyCheckPromise, timeoutPromise]);
          setApiKeyVerified(!!hasKey);
        } else {
          // Fallback for dev environments or if helper is missing
          setApiKeyVerified(true);
        }
      } catch (error) {
        console.error("Failed to check API key status:", error);
        // Fallback to verified to avoid blocking the app completely on error
        setApiKeyVerified(true);
      } finally {
        // This will now run even if the check times out or fails
        setCheckingApiKey(false);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      // Assume success as per guidelines for race condition mitigation
      setApiKeyVerified(true);
    }
  };

  const handleLogin = async () => {
    setAuthError(null); // Clear previous errors
    try {
      await loginWithGoogle();
    } catch (error: any) {
      if (error.code === 'auth/unauthorized-domain') {
        const hostname = window.location.hostname;
        let message;
        if (hostname) {
          message = `The domain '${hostname}' is not authorized for login. Please add it to your Firebase project's 'Authentication > Settings > Authorized domains' list to continue.`;
        } else {
          // This case handles local development or sandboxed iframes where hostname is empty.
          // It's crucial to add both 'localhost' and its IP '127.0.0.1'.
          message = `This app's domain is not authorized for login. To fix this for local development, please add BOTH 'localhost' AND '127.0.0.1' to your Firebase project's 'Authentication > Settings > Authorized domains' list.`;
        }
        setAuthError(message);
      } else {
        setAuthError(`Login failed: ${error.message}`);
      }
    }
  };

  // 2. Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
      if (currentUser) {
        setAuthError(null); // Clear any login errors on successful auth
      }
    });
    return () => unsubscribe();
  }, []);

  // 3. Subscribe to Data when User is Logged In
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setCharacters([]);
      return;
    }

    const unsubProjects = subscribeToProjects(user.uid, setProjects);
    const unsubCharacters = subscribeToCharacters(user.uid, setCharacters);
    const unsubSettings = getSettingsFromFirestore(user.uid, (fetchedSettings) => {
      if (fetchedSettings) {
        setSettings(fetchedSettings);
      } else {
        // If no settings are found in Firestore, use the initial default settings.
        setSettings(INITIAL_SETTINGS);
      }
    });

    return () => {
      unsubProjects();
      unsubCharacters();
      unsubSettings();
    };
  }, [user]);

  // 4. Save Settings when changed
  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (user) {
      saveSettingsToFirestore(user.uid, newSettings);
    }
  };

  const createProject = async () => {
    if (!newProjectTitle || !user) return;
    const newProject: Project = {
      id: Date.now().toString(),
      title: newProjectTitle,
      summary: newProjectSummary,
      mode: newProjectMode,
      createdAt: Date.now(),
      panels: [],
    };

    // Optimistic update (though subscription will catch it)
    await saveProjectToFirestore(user.uid, newProject);

    setActiveProjectId(newProject.id);
    setView(ViewState.STUDIO);
    setShowNewProjectModal(false);
    setNewProjectTitle('');
    setNewProjectSummary('');
  };

  const handleUpdateProject = async () => {
    if (!editingProjectId || !user || !editProjectTitle.trim()) return;

    setIsUpdatingProject(true);
    try {
      await updateProjectMetadata(user.uid, editingProjectId, {
        title: editProjectTitle,
        summary: editProjectSummary,
        mode: editProjectMode
      });

      setShowEditProjectModal(false);
      setEditingProjectId(null);
    } catch (error) {
      console.error("Failed to update project:", error);
      alert("Failed to update project details.");
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const openEditModal = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingProjectId(project.id);
    setEditProjectTitle(project.title);
    setEditProjectSummary(project.summary);
    setEditProjectMode(project.mode);
    setShowEditProjectModal(true);
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!user) return;

    if (window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      try {
        await deleteProjectFromFirestore(user.uid, projectId);
      } catch (error) {
        console.error("Error deleting project:", error);
        alert("Failed to delete project.");
      }
    }
  };

  // Helper to trigger the debounced save
  const triggerDebouncedSave = (projectId: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      if (user) {
        // Use functional state update to get the latest projects state
        // and avoid stale closure issues.
        setProjects(currentProjects => {
          const projectToSave = currentProjects.find(p => p.id === projectId);
          if (projectToSave) {
            saveProjectToFirestore(user.uid, projectToSave);
          }
          return currentProjects; // Return current state without modification
        });
      }
    }, 1500); // 1.5 second debounce
  };

  // Immediate manual save
  const handleForceSave = async () => {
    if (!user || !activeProjectId) return;

    // Clear pending auto-saves to prevent redundant writes
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    const projectToSave = projects.find(p => p.id === activeProjectId);
    if (projectToSave) {
      await saveProjectToFirestore(user.uid, projectToSave);
    }
  };

  // Handle Full Project Updates (e.g. Adding/Removing Panels)
  const handleProjectUpdate = (projectId: string, updatedPanels: Panel[]) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, panels: updatedPanels } : p
    ));
    triggerDebouncedSave(projectId);
  };

  // Handle Project Metadata Updates (Title, Summary, Settings) from Studio
  const handleProjectMetadataUpdate = (projectId: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, ...updates } : p
    ));
    triggerDebouncedSave(projectId);
  };

  // Handle Atomic Panel Updates (e.g. Image/Audio Generation completion)
  // This allows persistent updates even if the child component is unmounting
  const handlePanelChange = (projectId: string, panelId: string, updates: Partial<Panel>) => {
    setProjects(currentProjects => {
      return currentProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          panels: p.panels.map(panel => panel.id === panelId ? { ...panel, ...updates } : panel)
        };
      });
    });
    triggerDebouncedSave(projectId);
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  // --- RENDER HELPERS ---

  if (checkingApiKey || loadingAuth) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center text-white">
        <Loader2 className="animate-spin text-indigo-500 mb-2" size={32} />
      </div>
    );
  }

  // Mandatory API Key Selection Screen
  if (!apiKeyVerified) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/10 via-slate-950 to-slate-950 pointer-events-none" />
        <div className="z-10 text-center max-w-md animate-fade-in">
          <div className="inline-flex items-center justify-center p-4 bg-amber-500/10 rounded-2xl mb-6 shadow-2xl shadow-amber-500/20 ring-1 ring-amber-500/50">
            <Zap className="text-amber-400 w-12 h-12" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Connect Gemini API</h1>
          <p className="text-slate-400 text-lg mb-8 leading-relaxed">
            Stryp uses advanced Gemini 2.5 and Imagen 3 models. To proceed, please select a Google Cloud project with a valid API key.
          </p>
          <button
            onClick={handleSelectApiKey}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-xl"
          >
            <Zap size={20} />
            Select API Key
          </button>
          <p className="mt-6 text-xs text-slate-600">
            See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-slate-400">billing documentation</a> for details.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />
        <div className="z-10 text-center max-w-md animate-slide-up">
          <div className="inline-flex items-center justify-center p-4 bg-indigo-500/10 rounded-2xl mb-6 shadow-2xl shadow-indigo-500/20 ring-1 ring-indigo-500/50">
            <Film className="text-indigo-400 w-12 h-12" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Stryp Comic Studio</h1>
          <p className="text-slate-400 text-lg mb-8 leading-relaxed">
            The next-gen platform for creating comics and motion videos.
          </p>

          {authError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl mb-6 text-sm text-left flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold mb-1">Authentication Error</p>
                <p className="leading-relaxed">{authError}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full py-3.5 bg-white text-slate-900 hover:bg-slate-200 font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-xl"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
          <p className="mt-6 text-xs text-slate-600">
            Your data is securely stored in the cloud.
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (view) {
      case ViewState.CHARACTERS:
        return <CharacterVault characters={characters} user={user} />;
      case ViewState.LOCATIONS:
        return <LocationVault user={user} />;
      case ViewState.STUDIO:
        if (!activeProject || !user) return <div className="text-white p-8">Project or user not found.</div>;
        return (
          <Studio
            project={activeProject}
            characters={characters}
            settings={settings}
            user={user}
            onUpdatePanels={(panels) => handleProjectUpdate(activeProject.id, panels)}
            onPanelChange={(panelId, updates) => handlePanelChange(activeProject.id, panelId, updates)}
            onBack={async () => {
              await handleForceSave();
              setView(ViewState.DASHBOARD);
            }}
            onSave={handleForceSave}
            onUpdateProject={(updates) => handleProjectMetadataUpdate(activeProject.id, updates)}
          />
        );
      case ViewState.SETTINGS:
        return (
          <Settings
            settings={settings}
            user={user}
            onUpdateSettings={updateSettings}
            onLogout={logout}
          />
        );
      case ViewState.LOCATIONS:
        return (
          <div className="p-4 md:p-8 max-w-7xl mx-auto animate-fade-in">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-6 md:mb-8">Locations</h1>
            <p className="text-slate-400">Manage your story locations and backgrounds.</p>
          </div>
        );
      case ViewState.DASHBOARD:
      default:
        return (
          <div className="p-4 md:p-8 max-w-7xl mx-auto animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
                <p className="text-slate-400">Manage your comic strips and motion videos.</p>
              </div>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 md:px-4 md:py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/20 w-full md:w-auto"
              >
                <Plus size={20} />
                New Project
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => {
                    setActiveProjectId(project.id);
                    setView(ViewState.STUDIO);
                  }}
                  className="group cursor-pointer bg-slate-900/50 backdrop-blur-sm border border-slate-800 hover:border-indigo-500/50 rounded-xl p-6 transition-all hover:translate-y-[-2px] relative"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg ${project.mode === 'video' ? 'bg-rose-500/10 text-rose-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                      {project.mode === 'video' ? <Film size={20} /> : <ImageIcon size={20} />}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => openEditModal(e, project)}
                        className="p-1.5 hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-400 rounded transition-colors"
                        title="Edit Project"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteProject(e, project.id)}
                        className="p-1.5 hover:bg-rose-500/10 text-slate-600 hover:text-rose-500 rounded transition-colors"
                        title="Delete Project"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                    {project.title}
                  </h3>
                  <p className="text-slate-400 text-sm line-clamp-2">
                    {project.summary || "No summary provided."}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <span className="bg-slate-800 px-2 py-1 rounded">
                      {project.panels.length} panels
                    </span>
                  </div>
                </div>
              ))}

              {projects.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
                  <p className="text-slate-500 mb-4">No projects yet. Start creating!</p>
                  <button
                    onClick={() => setShowNewProjectModal(true)}
                    className="text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Create your first comic
                  </button>
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-40 lg:hidden text-white">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 border-r border-slate-800 bg-slate-900 p-4 flex flex-col justify-between animate-slide-right">
            <div>
              <div className="flex items-center justify-between mb-8 px-2">
                <div className="flex items-center gap-2">
                  <Film className="text-indigo-500" size={24} />
                  <span className="font-bold text-lg tracking-tight text-white">Stryp</span>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <nav className="space-y-2">
                <button
                  onClick={() => { setView(ViewState.DASHBOARD); setShowMobileMenu(false); }}
                  className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.DASHBOARD ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <LayoutDashboard size={20} />
                  <span className="font-medium">Dashboard</span>
                </button>
                <button
                  onClick={() => { setView(ViewState.CHARACTERS); setShowMobileMenu(false); }}
                  className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.CHARACTERS ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <Users size={20} />
                  <span className="font-medium">Characters</span>
                </button>
                <button
                  onClick={() => { setView(ViewState.LOCATIONS); setShowMobileMenu(false); }}
                  className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.LOCATIONS ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <MapPin size={20} />
                  <span className="font-medium">Locations</span>
                </button>
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <div className="mb-4 px-2">
                <p className="text-xs text-slate-600 font-mono mb-1">USER</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={() => { setView(ViewState.SETTINGS); setShowMobileMenu(false); }}
                className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.SETTINGS ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
              >
                <Settings size={20} />
                <span className="font-medium">Settings</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar (Hidden on Mobile) */}
      <aside className="hidden lg:flex w-64 border-r border-slate-800 bg-slate-900/50 backdrop-blur-md flex-col justify-between shrink-0 z-20">
        <div>
          <div className="h-16 flex items-center justify-start px-6 border-b border-slate-800">
            <Film className="text-indigo-500" size={24} />
            <span className="ml-3 font-bold text-lg tracking-tight text-white">Stryp</span>
          </div>

          <nav className="p-4 space-y-2">
            <button
              onClick={() => setView(ViewState.DASHBOARD)}
              className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.DASHBOARD ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <LayoutDashboard size={20} />
              <span className="font-medium">Dashboard</span>
            </button>
            <button
              onClick={() => setView(ViewState.CHARACTERS)}
              className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.CHARACTERS ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <Users size={20} />
              <span className="font-medium">Characters</span>
            </button>
            <button
              onClick={() => setView(ViewState.LOCATIONS)}
              className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.LOCATIONS ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <MapPin size={20} />
              <span className="font-medium">Locations</span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-4 px-2">
            <p className="text-xs text-slate-600 font-mono mb-1">USER</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => setView(ViewState.SETTINGS)}
            className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${view === ViewState.SETTINGS ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
          >
            <Settings size={20} />
            <span className="font-medium">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950 flex flex-col">
        {/* Mobile Header */}
        <div className="lg:hidden h-16 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50 backdrop-blur shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileMenu(true)} className="p-2 -ml-2 text-slate-400 hover:text-white">
              <Menu size={24} />
            </button>
            <span className="font-bold text-white">Stryp</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Additional mobile header actions can go here */}
          </div>
        </div>
        {renderContent()}
      </main>

      {/* New Project Modal - Drawer on Mobile, Centered on Desktop */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-fade-in">
          <div className="bg-slate-900 border-t md:border border-slate-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-6 shadow-2xl animate-slide-up">
            <h2 className="text-2xl font-bold text-white mb-6">New Project</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="The Cyber Samurai..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Context / Summary</label>
                <textarea
                  value={newProjectSummary}
                  onChange={(e) => setNewProjectSummary(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all h-24 resize-none"
                  placeholder="A brief intro about the world and tone..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Format</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setNewProjectMode('static')}
                    className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${newProjectMode === 'static' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                  >
                    <ImageIcon size={24} />
                    <span className="text-sm">Static Comic</span>
                  </button>
                  <button
                    onClick={() => setNewProjectMode('video')}
                    className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${newProjectMode === 'video' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                  >
                    <Film size={24} />
                    <span className="text-sm">Video / Audio</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={!newProjectTitle}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProjectModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-fade-in">
          <div className="bg-slate-900 border-t md:border border-slate-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-6 shadow-2xl animate-slide-up">
            <h2 className="text-2xl font-bold text-white mb-6">Edit Project</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editProjectTitle}
                  onChange={(e) => setEditProjectTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="Project title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Context / Summary</label>
                <textarea
                  value={editProjectSummary}
                  onChange={(e) => setEditProjectSummary(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all h-24 resize-none"
                  placeholder="Project summary..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Format</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setEditProjectMode('static')}
                    className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${editProjectMode === 'static' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                  >
                    <ImageIcon size={24} />
                    <span className="text-sm">Static Comic</span>
                  </button>
                  <button
                    onClick={() => setEditProjectMode('video')}
                    className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${editProjectMode === 'video' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                  >
                    <Film size={24} />
                    <span className="text-sm">Video / Audio</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setShowEditProjectModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProject}
                disabled={isUpdatingProject || !editProjectTitle.trim()}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
              >
                {isUpdatingProject && <Loader2 className="animate-spin" size={16} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
