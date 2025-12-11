import React, { useState, useEffect, useRef } from 'react';
import { Location, LocationMedia } from '../types';
import { User } from 'firebase/auth';
import {
    Plus,
    Trash2,
    Loader2,
    MapPin,
    Video,
    Image as ImageIcon,
    Sparkles,
    Pencil, // Changed from Eye
    AlertCircle,
    X
} from 'lucide-react';
import {
    subscribeToLocations,
    saveLocationToFirestore,
    deleteLocationFromFirestore,
    uploadLocationMedia
} from '../services/firebase';
import { gemini } from '../services/geminiService';

interface LocationVaultProps {
    locations?: Location[]; // Optional for now as we might load it internally
    user: User;
}

const LocationVault: React.FC<LocationVaultProps> = ({ user }) => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    // New Location Form
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formVisualDesc, setFormVisualDesc] = useState('');

    // Multi-media state
    const [formMedia, setFormMedia] = useState<LocationMedia[]>([]);

    useEffect(() => {
        const unsubscribe = subscribeToLocations(user.uid, (data) => {
            setLocations(data);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [user.uid]);

    const resetForm = () => {
        setFormName('');
        setFormDesc('');
        setFormVisualDesc('');
        setFormMedia([]);
        setEditingId(null);
        setIsEditing(false);
    };

    const handleEdit = (loc: Location) => {
        setFormName(loc.name);
        setFormDesc(loc.description);
        setFormVisualDesc(loc.visualDescription || '');

        // Migration: If no 'media' array but has old 'mediaUrl', convert it
        let initialMedia: LocationMedia[] = loc.media || [];
        if (initialMedia.length === 0 && loc.mediaUrl) {
            initialMedia = [{
                id: 'legacy-1',
                url: loc.mediaUrl,
                type: loc.mediaType || 'image',
                name: 'Main Media'
            }];
        }
        setFormMedia(initialMedia);

        setEditingId(loc.id);
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!formName.trim()) return;

        // Backward compatibility: Set the first item as the "main" one for old viewers
        const mainMedia = formMedia[0];

        const newLocation: Location = {
            id: editingId || Date.now().toString(),
            name: formName,
            description: formDesc,
            visualDescription: formVisualDesc,
            media: formMedia,
            // Main fallback
            mediaUrl: mainMedia ? mainMedia.url : '',
            mediaType: mainMedia ? mainMedia.type : 'image',
            createdAt: Date.now()
        };

        await saveLocationToFirestore(user.uid, newLocation);
        resetForm();
    };

    const handleDelete = async (id: string) => {
        if (confirm('Delete this location?')) {
            await deleteLocationFromFirestore(user.uid, id);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const newMediaItems: LocationMedia[] = [];
        setIsUploading(true);

        try {
            // Process all selected files
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const isVideo = file.type.startsWith('video/');

                // Upload
                const downloadUrl = await uploadLocationMedia(user.uid, file);

                newMediaItems.push({
                    id: Date.now().toString() + i, // Simple unique ID
                    url: downloadUrl,
                    type: isVideo ? 'video' : 'image',
                    name: file.name
                });
            }

            setFormMedia(prev => [...prev, ...newMediaItems]);
        } catch (error) {
            console.error("Upload failed", error);
            alert("Failed to upload media. Please try again.");
        } finally {
            setIsUploading(false);
            // Reset input so same file can be selected again if needed
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removeMediaItem = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setFormMedia(prev => prev.filter(item => item.id !== id));
    };

    const handleAnalyze = async (loc: Location) => {
        // Use the new media array, or fallback to single
        const mediaItems = loc.media && loc.media.length > 0 ? loc.media : (loc.mediaUrl ? [{ url: loc.mediaUrl, type: loc.mediaType || 'image' }] : []);

        if (mediaItems.length === 0) return;

        setAnalyzingIds(prev => new Set(prev).add(loc.id));
        try {
            // @ts-ignore - We will update the service next
            const description = await gemini.getLocationVisualDescription(mediaItems);

            // Update with new description
            const updatedLoc = { ...loc, visualDescription: description };
            await saveLocationToFirestore(user.uid, updatedLoc);

            // If currently editing this one, update form
            if (editingId === loc.id) {
                setFormVisualDesc(description);
            }
        } catch (error: any) {
            console.error("Analysis failed:", error);

            let msg = `Failed to analyze location: ${error.message || "Unknown error"}`;
            if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError"))) {
                msg += "\n\nPossible Cause: CORS Issue.\nTo fix: Upload the 'cors.json' file using gsutil to your Firebase Storage bucket.";
            } else if (error.message && error.message.includes("time")) {
                msg += "\n\nCause: Timeout.\nThe file might be too large or your connection is slow.";
            } else if (error.message && error.message.includes("404")) {
                msg += "\n\nCause: AI Model Not Found. This should be fixed now (using 2.0-flash-exp).";
            }

            alert(msg);
        } finally {
            setAnalyzingIds(prev => {
                const next = new Set(prev);
                next.delete(loc.id);
                return next;
            });
        }
    };

    const [isAnalyzingForm, setIsAnalyzingForm] = useState(false);

    const handleAnalyzeForm = async () => {
        if (formMedia.length === 0) {
            alert("Please upload media first.");
            return;
        }
        setIsAnalyzingForm(true);
        try {
            // @ts-ignore
            const description = await gemini.getLocationVisualDescription(formMedia);
            setFormVisualDesc(description);
        } catch (error: any) {
            console.error("Analysis failed:", error);
            alert(`Analysis failed: ${error.message}`);
        } finally {
            setIsAnalyzingForm(false);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-screen text-white animate-fade-in relative z-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                        <MapPin className="text-emerald-400" size={32} /> Location Vault
                    </h1>
                    <p className="text-slate-400">
                        Upload images or videos of locations to usage as visual context for your scenes.
                    </p>
                </div>
                <button
                    onClick={() => { resetForm(); setIsEditing(true); }}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all"
                >
                    <Plus size={20} /> Add Location
                </button>
            </div>

            {isEditing && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 border-t md:border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[90vh] md:h-auto md:max-h-[95vh] animate-slide-up">
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-bold">
                                    {editingId ? 'Edit Location' : 'New Location'}
                                </h2>
                                <button onClick={resetForm} className="text-slate-500 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                {/* Left Column: Inputs */}
                                <div className="md:col-span-4 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                                        <input
                                            type="text"
                                            value={formName}
                                            onChange={e => setFormName(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                                            placeholder="e.g. My Backyard, City Park"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Notes (Optional)</label>
                                        <textarea
                                            value={formDesc}
                                            onChange={e => setFormDesc(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:border-emerald-500 outline-none resize-none h-32"
                                            placeholder="Personal notes about this location..."
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                                <Sparkles size={14} className="text-purple-400" />
                                                AI Visual Description
                                            </label>
                                            <button
                                                onClick={handleAnalyzeForm}
                                                disabled={isAnalyzingForm || formMedia.length === 0}
                                                className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                            >
                                                {isAnalyzingForm ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                Generate
                                            </button>
                                        </div>
                                        <textarea
                                            value={formVisualDesc}
                                            onChange={e => setFormVisualDesc(e.target.value)}
                                            className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:border-purple-500 outline-none h-64 font-mono leading-relaxed resize-y"
                                            placeholder="Detailed description generated by AI..."
                                        />
                                    </div>
                                </div>

                                {/* Right Column: Media Gallery */}
                                <div className="md:col-span-8 flex flex-col min-h-[400px]">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-sm font-medium text-slate-400">Reference Media ({formMedia.length})</label>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-emerald-400 text-sm font-bold flex items-center gap-1 hover:text-emerald-300"
                                        >
                                            <Plus size={16} /> Add Media
                                        </button>
                                    </div>

                                    {/* Gallery Grid */}
                                    <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-y-auto">
                                        {formMedia.length === 0 ? (
                                            <div
                                                onClick={() => fileInputRef.current?.click()}
                                                className="h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-lg cursor-pointer hover:border-emerald-500/50 hover:bg-slate-900 transition-all text-slate-500 hover:text-emerald-400"
                                            >
                                                {isUploading ? (
                                                    <div className="text-center">
                                                        <Loader2 className="animate-spin mx-auto mb-2 text-emerald-500" size={32} />
                                                        <p>Uploading...</p>
                                                    </div>
                                                ) : (
                                                    <div className="text-center">
                                                        <div className="flex justify-center gap-2 mb-2">
                                                            <ImageIcon size={32} />
                                                            <Video size={32} />
                                                        </div>
                                                        <p className="font-bold text-lg">Upload Images or Videos</p>
                                                        <p className="text-sm opacity-70">Click to select files</p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                {formMedia.map((item, index) => (
                                                    <div key={item.id || index} className="relative aspect-video group rounded-lg overflow-hidden bg-black border border-slate-800">
                                                        {item.type === 'video' ? (
                                                            <video src={item.url} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <img src={item.url} alt="Reference" className="w-full h-full object-cover" />
                                                        )}

                                                        {/* Actions Overlay */}
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                            <a href={item.url} target="_blank" rel="noreferrer" className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-white" title="View Full">
                                                                <ImageIcon size={16} />
                                                            </a>
                                                            <button
                                                                onClick={(e) => removeMediaItem(e, item.id)}
                                                                className="p-2 bg-rose-600 hover:bg-rose-500 rounded-full text-white" title="Remove"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                        <div className="absolute top-1 left-1 px-2 py-0.5 bg-black/50 rounded text-[10px] text-white uppercase font-bold backdrop-blur-sm">
                                                            {item.type}
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Add More Card */}
                                                <div
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="aspect-video flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-emerald-500 hover:bg-slate-900/50 transition-all text-slate-500"
                                                >
                                                    {isUploading ? <Loader2 className="animate-spin" /> : <Plus size={24} />}
                                                    <span className="text-xs font-bold mt-1">Add More</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*,video/*"
                                        multiple // Enable multiple files
                                        onChange={handleFileUpload}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-800 bg-slate-900 flex justify-end gap-3 rounded-b-2xl">
                            <button
                                onClick={resetForm}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formName.trim() || isUploading}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                            >
                                {isUploading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                Save Location
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-emerald-500" size={40} />
                </div>
            ) : locations.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
                    <MapPin size={48} className="mx-auto text-slate-700 mb-4" />
                    <h3 className="text-xl font-bold text-slate-400 mb-2">No Locations Yet</h3>
                    <p className="text-slate-500 max-w-md mx-auto mb-6">
                        Add locations to your vault to use them as consistent backgrounds for your scenes.
                    </p>
                    <button
                        onClick={() => { resetForm(); setIsEditing(true); }}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl font-bold transition-all"
                    >
                        <Plus size={20} /> Create First Location
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {locations.map(loc => {
                        // Display the first (main) media item on the card
                        const mainMedia = (loc.media && loc.media.length > 0) ? loc.media[0] : { url: loc.mediaUrl, type: loc.mediaType || 'image' };
                        const count = loc.media ? loc.media.length : (loc.mediaUrl ? 1 : 0);

                        return (
                            <div key={loc.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all group">
                                <div className="aspect-video relative bg-black">
                                    {mainMedia.type === 'video' ? (
                                        <div className="w-full h-full relative">
                                            <video src={mainMedia.url} className="w-full h-full object-cover opacity-80" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="bg-black/50 p-3 rounded-full backdrop-blur-sm">
                                                    <Video className="text-white" size={24} />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <img src={mainMedia.url} alt={loc.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    )}

                                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleEdit(loc); }}
                                            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg"
                                            title="Edit Location"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }}
                                            className="p-2 bg-rose-900/80 hover:bg-rose-900 text-white rounded-lg backdrop-blur-sm"
                                            title="Delete Location"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {count > 1 && (
                                        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded text-xs text-white font-bold backdrop-blur-md">
                                            +{count - 1} more
                                        </div>
                                    )}
                                </div>

                                <div className="p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-lg font-bold text-white truncate pr-2">{loc.name}</h3>

                                        <button
                                            onClick={() => handleAnalyze(loc)}
                                            disabled={analyzingIds.has(loc.id)}
                                            className="shrink-0 text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-400/10 hover:bg-emerald-400/20 px-2 py-1 rounded-lg transition-colors"
                                        >
                                            {analyzingIds.has(loc.id) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            {loc.visualDescription ? 'Re-Analyze' : 'Analyze'}
                                        </button>
                                    </div>

                                    <p className="text-sm text-slate-400 line-clamp-3 min-h-[60px]">
                                        {loc.visualDescription || loc.description || "No description."}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
};

export default LocationVault;
