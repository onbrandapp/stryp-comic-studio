# Architecture & Design

This document outlines the technical architecture of Stryp Comic Studio.

## Directory Structure

```
/
├── components/          # React UI Components
│   ├── CharacterVault.tsx  # Character CRUD & Voice selection
│   └── Studio.tsx          # Main Editor (Scripting, Gen, Playback)
├── services/            # External Service Integrations
│   ├── firebase.ts         # Auth, Firestore, Storage logic
│   └── geminiService.ts    # Google AI implementation
├── App.tsx              # Main Controller & Routing
├── types.ts             # TypeScript Interfaces
├── firebaseConfig.ts    # Firebase Credentials
├── index.tsx            # Entry Point
└── metadata.json        # PWA/Permissions metadata
```

## Data Flow & State Management

The application uses a **hybrid state management** approach:

1.  **Real-time Truth (Firestore)**:
    *   The `App.tsx` component subscribes to Firestore collections (`projects`, `characters`, `settings`) using `onSnapshot`.
    *   This ensures that data is always synced across devices and sessions.

2.  **Local Optimistic State**:
    *   The `Studio.tsx` component maintains local state for immediate UI feedback (e.g., typing in text areas, showing "Generating..." spinners).
    *   **Smart Merging**: When Firestore updates come in, the app intelligently merges them. It prioritizes local "preview" images (Data URIs) over empty server data to prevent images from "disappearing" while the background upload completes.

3.  **Atomic Updates**:
    *   To handle component unmounting (e.g., user leaving the studio while an upload is pending), the app uses an `onPanelChange` callback pattern.
    *   Uploads are asynchronous; once complete, the result is sent to the global state handler in `App.tsx`, forcing a database write even if the Studio UI is gone.

## AI Service Layer (`geminiService.ts`)

The AI service abstracts the `@google/genai` SDK.

*   **Script Generation**: Uses `gemini-2.5-flash` with JSON schema enforcement to guarantee structured output (Arrays of panel objects).
*   **Image Generation**: Uses `gemini-2.5-flash-image`.
    *   *Reference Images*: If a character has a reference image, it is fetched via `fetch`, converted to Base64, and passed as inline data to the model.
    *   *Timeout Handling*: Implements strict timeouts (`AbortController`) for image fetching (2.5s) and Generation (90s) to prevent UI freezes.
*   **Audio Generation**: Uses `gemini-2.5-flash-preview-tts` to generate WAV audio, returned as a Base64 string.

## Storage Strategy

To ensure performance and reliability, especially on mobile networks:

1.  **Generation**: AI returns Base64 strings.
2.  **Conversion**: The app immediately converts Base64 strings to binary `Blob` objects.
3.  **Upload**: Blobs are uploaded to Firebase Storage.
    *   *Images*: `users/{uid}/panels/{timestamp}.png`
    *   *Audio*: `users/{uid}/audio/{timestamp}.wav`
4.  **Reference**: Only the download URL (`https://firebasestorage...`) is saved to the Firestore database document.

## Mobile Responsiveness Strategy

*   **Conditional Rendering**: Certain tools (Script Generator, Cast List) move from a Sidebar (Desktop) to a Slide-up Drawer (Mobile).
*   **Touch Targets**: Buttons and Inputs are sized `p-3` or larger on mobile.
*   **Layout Shift**: Flex rows on desktop become Flex columns on mobile (e.g., Dashboard Project Cards, Headers).
