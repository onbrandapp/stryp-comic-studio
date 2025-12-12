
import React, { useState, useRef } from 'react';
import { Plus, Upload, X, Mic, User, Pencil, Trash2, Loader2, ChevronDown, Check } from 'lucide-react';
import { Character, AVAILABLE_VOICES } from '../types';
import { saveCharacterToFirestore, deleteCharacterFromFirestore, uploadCharacterImage } from '../services/firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface Props {
  characters: Character[];
  user: FirebaseUser | null;
  onModalStateChange?: (isOpen: boolean) => void;
  onStartTour?: () => void;
}

const CharacterVault: React.FC<Props> = ({ characters, user, onModalStateChange, onStartTour }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sync internal modal state to parent
  React.useEffect(() => {
    onModalStateChange?.(isModalOpen);
  }, [isModalOpen, onModalStateChange]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ... (rest of state logs omitted for brevity) ...

  const [newCharName, setNewCharName] = useState('');
  const [newCharBio, setNewCharBio] = useState('');
  const [newCharImagePreview, setNewCharImagePreview] = useState<string | null>(null);
  const [newCharImage2Preview, setNewCharImage2Preview] = useState<string | null>(null);
  const [newCharFile, setNewCharFile] = useState<File | null>(null);
  const [newCharFile2, setNewCharFile2] = useState<File | null>(null);
  const [newCharVoice, setNewCharVoice] = useState(AVAILABLE_VOICES[0].id);

  const [isVoiceSelectorOpen, setIsVoiceSelectorOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInput2Ref = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isSecond = false) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        if (isSecond) {
          setNewCharFile2(file);
          setNewCharImage2Preview(event.target?.result as string);
        } else {
          setNewCharFile(file);
          setNewCharImagePreview(event.target?.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const openNewCharacterModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (char: Character) => {
    setEditingId(char.id);
    setNewCharName(char.name);
    setNewCharBio(char.bio);
    setNewCharImagePreview(char.imageUrl);
    setNewCharImage2Preview(char.imageUrl2 || null);
    setNewCharVoice(char.voiceId || AVAILABLE_VOICES[0].id);
    setIsModalOpen(true);
  };

  const saveCharacter = async () => {
    if (!newCharName || !user) return;
    if (!newCharImagePreview) {
      alert("A primary character image is required.");
      return;
    }

    setIsSaving(true);
    try {
      let finalImageUrl: string | undefined;
      let finalImageUrl2: string | undefined;

      // If we are editing an existing character, start with their current image URLs.
      if (editingId) {
        const existingCharacter = characters.find(c => c.id === editingId);
        finalImageUrl = existingCharacter?.imageUrl;
        finalImageUrl2 = existingCharacter?.imageUrl2;
      }

      // Upload new files if selected
      if (newCharFile) {
        finalImageUrl = await uploadCharacterImage(user.uid, newCharFile);
      }
      if (newCharFile2) {
        finalImageUrl2 = await uploadCharacterImage(user.uid, newCharFile2);
      }

      if (!finalImageUrl) {
        throw new Error("Character image URL could not be determined. Please re-select an image.");
      }

      const charId = editingId || Date.now().toString();
      const characterData: Character = {
        id: charId,
        name: newCharName,
        bio: newCharBio,
        imageUrl: finalImageUrl,
        imageUrl2: finalImageUrl2,
        voiceId: newCharVoice,
      };

      await saveCharacterToFirestore(user.uid, characterData);

      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving character:", error);
      alert(`Failed to save character. ${error instanceof Error ? error.message : 'An unknown error occurred.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setNewCharName('');
    setNewCharBio('');
    setNewCharImagePreview(null);
    setNewCharImage2Preview(null);
    setNewCharFile(null);
    setNewCharFile2(null);
    setNewCharVoice(AVAILABLE_VOICES[0].id);
    setIsVoiceSelectorOpen(false);
  };

  const deleteCharacter = async (id: string) => {
    if (!user) return;
    if (window.confirm("Are you sure you want to delete this character?")) {
      await deleteCharacterFromFirestore(user.uid, id);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Character Vault</h1>
          <p className="text-slate-400">Define your cast. The AI will use these references for consistency.</p>
        </div>
        <button
          onClick={openNewCharacterModal}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 md:px-4 md:py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/20 w-full md:w-auto"
        >
          <Plus size={20} />
          Add Character
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {characters.map(char => (
          <div key={char.id} className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all shadow-lg">
            <div className="aspect-square w-full bg-slate-950 relative overflow-hidden">
              <img
                src={char.imageUrl}
                alt={char.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent opacity-60" />

              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openEditModal(char); }}
                  className="p-2 bg-black/60 text-white rounded-lg hover:bg-indigo-600 backdrop-blur-sm transition-all shadow-lg"
                  title="Edit Character"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCharacter(char.id); }}
                  className="p-2 bg-black/60 text-white rounded-lg hover:bg-rose-600 backdrop-blur-sm transition-all shadow-lg"
                  title="Delete Character"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {char.imageUrl2 && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                  +1 Ref
                </div>
              )}
            </div>
            <div className="p-4 relative">
              <h3 className="text-lg font-bold text-white flex items-center justify-between">
                {char.name}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-indigo-400 mb-3 font-mono mt-1">
                <Mic size={12} />
                <span>{AVAILABLE_VOICES.find(v => v.id === char.voiceId)?.name || 'Default Voice'}</span>
              </div>
              <p className="text-sm text-slate-400 line-clamp-2 h-10 leading-relaxed">{char.bio}</p>
            </div>
          </div>
        ))}

        {characters.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
            <User size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-500 mb-4">No characters defined yet.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Character Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-fade-in">
          <div className="bg-slate-900 border-t md:border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-3xl p-6 shadow-2xl animate-slide-up flex flex-col md:flex-row gap-6 md:gap-8 max-h-[90vh] md:max-h-none overflow-y-auto">

            {/* Image Upload Side */}
            <div className="w-full md:w-1/3 flex flex-col gap-4 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                {/* Primary Image */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`group aspect-square w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative ${newCharImagePreview ? 'border-indigo-500/50 col-span-2' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800 col-span-2'}`}
                >
                  {newCharImagePreview ? (
                    <>
                      <img src={newCharImagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                        <div className="flex flex-col items-center text-white font-medium">
                          <Upload size={24} className="mb-2" />
                          <span className="text-xs uppercase tracking-wider">Change Main</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="text-slate-500 mb-2" size={24} />
                      <span className="text-sm text-slate-400 font-medium">Main Reference</span>
                    </>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleImageUpload(e, false)}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* Secondary Image */}
                <div
                  onClick={() => fileInput2Ref.current?.click()}
                  className={`group aspect-square w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative ${newCharImage2Preview ? 'border-indigo-500/50' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800'} ${!newCharImagePreview ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {newCharImage2Preview ? (
                    <>
                      <img src={newCharImage2Preview} alt="Preview 2" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                        <div className="flex flex-col items-center text-white font-medium">
                          <Upload size={20} className="mb-1" />
                          <span className="text-[10px] uppercase tracking-wider">Change</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Plus className="text-slate-500 mb-1" size={20} />
                      <span className="text-xs text-slate-400 font-medium text-center">Add 2nd<br />Reference</span>
                    </>
                  )}
                  <input
                    type="file"
                    ref={fileInput2Ref}
                    onChange={(e) => handleImageUpload(e, true)}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500 text-center leading-relaxed hidden md:block">
                Upload up to 2 reference images. The AI will combine features from both for better consistency.
              </p>
            </div>

            {/* Details Side */}
            <div className="flex-1 flex flex-col h-full">
              <div className="flex justify-between items-start mb-6 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-white">{editingId ? 'Edit Character' : 'New Character'}</h2>
                  <p className="text-slate-400 text-sm mt-1">Configure the visual and audio identity.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onStartTour}
                    className="hidden md:flex bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all items-center gap-2 border border-indigo-500/30"
                  >
                    Start Tour
                  </button>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-colors">
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="space-y-4 md:space-y-5 flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Character Name</label>
                  <input
                    type="text"
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-700"
                    placeholder="e.g., Cyber-Ronin"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Biography & Traits</label>
                  <textarea
                    value={newCharBio}
                    onChange={(e) => setNewCharBio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all h-24 md:h-28 resize-none placeholder:text-slate-700"
                    placeholder="Describe their appearance, personality, and role. E.g., Stoic warrior, wears neon red armor, scar on left cheek..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Mic size={14} /> Assigned AI Voice
                  </label>

                  {/* Custom Mobile-Friendly Dropdown Trigger */}
                  <div
                    onClick={() => setIsVoiceSelectorOpen(true)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white flex items-center justify-between cursor-pointer hover:border-slate-700 transition-colors group"
                  >
                    <span className="truncate">{AVAILABLE_VOICES.find(v => v.id === newCharVoice)?.name || 'Select a voice'}</span>
                    <ChevronDown size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-slate-800 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={saveCharacter}
                  disabled={!newCharName || !newCharImagePreview || isSaving}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
                >
                  {isSaving && <Loader2 className="animate-spin" size={16} />}
                  {isSaving ? 'Uploading...' : (editingId ? 'Update Character' : 'Save to Vault')}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Voice Selection Drawer (Bottom Sheet on Mobile, Modal on Desktop) */}
      {isVoiceSelectorOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center bg-black/80 backdrop-blur-sm animate-fade-in p-0 sm:p-4" onClick={() => setIsVoiceSelectorOpen(false)}>
          <div
            className="bg-slate-900 border-t sm:border border-slate-700 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl animate-slide-up max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Mic className="text-indigo-400" /> Select Voice
              </h3>
              <button onClick={() => setIsVoiceSelectorOpen(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-2">
              {AVAILABLE_VOICES.map(voice => (
                <button
                  key={voice.id}
                  onClick={() => {
                    setNewCharVoice(voice.id);
                    setIsVoiceSelectorOpen(false);
                  }}
                  className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all group ${newCharVoice === voice.id
                    ? 'bg-indigo-600/10 border-indigo-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-900'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${newCharVoice === voice.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700'
                      }`}>
                      <Mic size={18} />
                    </div>
                    <div className="text-left">
                      <p className={`font-bold ${newCharVoice === voice.id ? 'text-indigo-400' : 'text-slate-200'}`}>
                        {voice.name.split('(')[0].trim()}
                      </p>
                      <p className="text-xs text-slate-500">
                        {voice.name.match(/\((.*?)\)/)?.[1] || 'Standard Voice'}
                      </p>
                    </div>
                  </div>

                  {newCharVoice === voice.id && (
                    <div className="bg-indigo-500 rounded-full p-1">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterVault;
