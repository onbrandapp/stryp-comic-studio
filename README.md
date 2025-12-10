# Stryp Comic Studio

Stryp Comic Studio is a next-generation web application that leverages Google's Gemini AI to empower users to create comic strips and motion comics. It combines professional scripting, consistent character visualization, and AI voiceovers into a seamless creative suite.

## ✨ Key Features

*   **AI Script Generation**: Turn a simple scene description into a structured multi-panel comic script using **Gemini 2.5 Flash**.
*   **Visual Consistency**: Define characters in a "Character Vault" with reference images. The AI uses these references to maintain visual identity across different panels.
*   **AI Image Generation**: Generate high-quality panel art using **Gemini 2.5 Flash Image**, with automatic fallbacks and retries.
*   **AI Voiceovers**: Assign specific voices to characters and generate Text-to-Speech audio using **Gemini 2.5 Flash TTS**.
*   **Manual Control**: Upload your own images for panels if you prefer external tools, with immediate local preview.
*   **Studio Editor**:
    *   Batch "Generate All" functionality for visuals and audio with staggered execution.
    *   Real-time "Read Mode" / "Watch Mode" playback.
    *   Export projects as standalone, playable HTML files.
*   **Cloud Sync**: Real-time auto-saving and media storage via **Firebase**.
*   **Mobile Optimized**: Responsive design with touch-friendly drawers, vertical stacking, and mobile-specific toolbars.

## 🛠 Tech Stack

*   **Frontend**: React 19, TypeScript, Tailwind CSS.
*   **AI**: Google GenAI SDK (`@google/genai`).
    *   *Scripting*: `gemini-2.5-flash`
    *   *Images*: `gemini-2.5-flash-image`
    *   *Audio*: `gemini-2.5-flash-preview-tts`
*   **Backend / BaaS**: Firebase.
    *   *Auth*: Google Authentication.
    *   *Database*: Firestore (Real-time data).
    *   *Storage*: Firebase Storage (Images & Audio blobs).
*   **Icons**: Lucide React.

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   A Firebase Project (configured for Auth, Firestore, and Storage).
*   A Google Cloud Project with the Gemini API enabled.

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/your-username/stryp-comic-studio.git
    cd stryp-comic-studio
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    The application relies on `process.env.API_KEY` for the Gemini API. Ensure this is injected or configured in your build environment.
    
    *Note: The app also supports a dynamic API key selection flow via `window.aistudio` if running in specific AI Studio environments.*

4.  **Configure Firebase**
    Update `firebaseConfig.ts` with your specific Firebase project credentials.

5.  **Run Development Server**
    ```bash
    npm start
    ```

## 📦 Build & Deploy

This project uses standard React build scripts.
```bash
npm run build
```
The output `dist` or `build` folder can be deployed to Vercel, Netlify, or Firebase Hosting.

## 📱 Mobile Support
The application is fully responsive.
*   **Desktop**: Full sidebar, grid layouts, modal dialogues.
*   **Mobile**: Bottom navigation sheets, vertical stacking, hidden toolbars accessible via the "Wand" icon.

## 📄 License
[MIT](LICENSE)
