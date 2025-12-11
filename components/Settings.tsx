import React from 'react';
import { Mic, Play, Users, LogOut, ChevronDown, Monitor } from 'lucide-react';
import { AppSettings, AVAILABLE_VOICES } from '../types';
import { User as FirebaseUser } from 'firebase/auth';

interface SettingsProps {
    settings: AppSettings;
    user: FirebaseUser;
    onUpdateSettings: (settings: AppSettings) => void;
    onLogout: () => Promise<void>;
}

const Settings: React.FC<SettingsProps> = ({ settings, user, onUpdateSettings, onLogout }) => {
    // Defensive check: If settings are not yet loaded, show nothing or a loader.
    // In App.tsx, initial state is set, but this prevents crashes if something goes wrong.
    if (!settings) {
        return null;
    }

    return (
        <div className="p-4 md:p-8 w-full max-w-3xl mx-auto animate-fade-in pb-24 md:pb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 md:mb-4">Settings</h1>
            <p className="text-slate-400 mb-6 md:mb-8">Manage your studio preferences and account.</p>

            <div className="space-y-4 md:space-y-6">
                {/* Audio Defaults */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 md:p-6 transition-colors hover:border-slate-700">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
                            <Mic size={18} />
                        </div>
                        Audio Defaults
                    </h2>
                    <div className="w-full">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Default Narrator Voice</label>
                        <p className="text-xs text-slate-500 mb-3">Used for captions where no character is assigned.</p>
                        <div className="relative">
                            <select
                                value={settings.defaultNarratorVoiceId}
                                onChange={(e) => onUpdateSettings({ ...settings, defaultNarratorVoiceId: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 pr-10 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer transition-all"
                            >
                                {AVAILABLE_VOICES.map(voice => (
                                    <option key={voice.id} value={voice.id}>{voice.name}</option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Playback Settings */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 md:p-6 transition-colors hover:border-slate-700">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
                            <Play size={18} />
                        </div>
                        Playback Speed
                    </h2>
                    <div className="w-full">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Panel Duration
                        </label>
                        <p className="text-xs text-slate-500 mb-4">How long each panel stays on screen during playback.</p>

                        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                            <div className="flex items-center gap-4">
                                <span className="text-xs text-slate-500 font-mono w-8">1s</span>
                                <input
                                    type="range"
                                    min="1000"
                                    max="10000"
                                    step="500"
                                    value={settings.panelDelay || 2000}
                                    onChange={(e) => onUpdateSettings({ ...settings, panelDelay: parseInt(e.target.value) })}
                                    className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                                    aria-label="Panel duration slider"
                                />
                                <span className="text-xs text-slate-500 font-mono w-8 text-right">10s</span>
                            </div>
                            <div className="mt-2 text-center">
                                <span className="text-sm font-bold text-indigo-400">
                                    {(settings.panelDelay || 2000) / 1000} seconds
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Account Info */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 md:p-6 transition-colors hover:border-slate-700">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
                            <Users size={18} />
                        </div>
                        Account
                    </h2>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800 flex-1">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                {user.email ? user.email[0].toUpperCase() : 'U'}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-white font-medium truncate text-sm">{user.email}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Monitor size={10} /> Synced to cloud
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onLogout}
                            className="w-full md:w-auto px-6 py-3 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 font-medium active:scale-[0.98]"
                        >
                            <LogOut size={18} /> Sign Out
                        </button>
                    </div>
                    <p className="mt-4 text-xs text-center md:text-left text-slate-600">
                        Version 1.2.0 • Build 2024.12
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
