# Project Roadmap

## ✅ Completed Features

### Core Platform
*   [x] **User Authentication**: Google Login via Firebase.
*   [x] **Project Management**: Create, Read, Delete projects.
*   [x] **Character Vault**: Create characters with Bios and Reference Images.
*   [x] **Settings**: Configure default narrator voices.

### Studio & Editor
*   [x] **AI Scripting**: Generate multi-panel scripts from a single prompt.
*   [x] **Panel Management**: Add/Delete/Edit panels manually.
*   [x] **Auto-Save**: Debounced saving to Firestore.
*   [x] **Manual Save**: Force save button in header.

### AI Generation
*   [x] **AI Visuals**: Integration with Gemini 2.5 Flash Image.
*   [x] **Character Consistency**: Passing reference images to the model.
*   [x] **AI Voiceovers**: Text-to-Speech using Gemini 2.5 Flash TTS.
*   [x] **Batch Generation**: "Generate All" buttons for both Audio and Video with staggered execution to handle rate limits.

### UX & Reliability
*   [x] **Optimistic UI**: Instant previews for uploads and generation.
*   [x] **Robust Uploads**: Conversion of Base64 to Blobs to prevent network timeouts.
*   [x] **Mobile Responsiveness**: Full mobile layout support including specific drawers for tools and voice selection.
*   [x] **Export**: Download project as a standalone `.html` file.
*   [x] **Manual Uploads**: Ability to bypass AI and upload custom panel images.

---

## 🚧 In Progress / Known Issues

*   **Audio Playback State**: While significantly improved, rapid toggling between panels can occasionally desync the play icon state.
*   **Large Project Performance**: Projects with 50+ panels may experience minor UI lag during batch updates.

---

## 🔮 Future Roadmap

### Short Term
*   **Drag & Drop Ordering**: Ability to reorder panels in the Studio.
*   **Image Regenerate Options**: "Variations" or "In-painting" to fix small details in generated images.
*   **Audio Trimming**: Basic tools to trim generated audio clips.

### Mid Term
*   **Video Export**: Server-side rendering to export the project as an actual `.mp4` video file (replacing the HTML export).
*   **Motion Generation**: Integration with **Google Veo** to generate actual video clips for panels instead of static images.
*   **Multi-Character Dialogue**: improved UI for handling conversations between multiple characters in a single panel.

### Long Term
*   **Collaboration**: Real-time multi-user editing on the same project.
*   **Community Gallery**: Ability to publish and share comics with other users.
*   **Custom Models**: Fine-tuning options for specific art styles.
