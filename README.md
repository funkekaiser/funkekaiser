# Funke-Kaiser Calling Card

A lightweight personal landing page for Jonathan Funke-Kaiser that doubles as a playable, accessibility-friendly take on Pong. The site showcases contact information alongside a full-screen background game whose visuals adapt to the visitor's color-scheme preferences.

## Features
- **Responsive layout** – Presents a glassmorphism-inspired calling card on desktop while offering a simplified, touch-friendly layout on small screens.
- **Adaptive Pong background** – Renders an AI opponent, physics, and score keeping on the full-viewport canvas; automatically pauses on mobile for performance and readability.
- **Theme-aware styling** – Reads CSS custom properties so the canvas and UI match both light and dark themes without extra configuration.
- **Keyboard & touch controls** – Supports mouse/touch movement, double-tap or <kbd>Space</kbd> to pause, and <kbd>R</kbd> to reset the match.

## Local development
This project is a static site with no build step. To develop locally, serve the files with any static web server, for example:

```bash
npx serve .
```

Then open the reported URL (typically <http://localhost:3000>) in your browser.

## Project structure
- `index.html` – Document structure and calling card content.
- `style.css` – Theme variables and responsive layout rules.
- `game.js` – Pong implementation with AI, input handling, and rendering logic.
- `images/` – Icons and graphics used for favicons and social sharing.

## Deployment
The repository is ready to deploy to static hosting (e.g., GitHub Pages). Ensure the root contains this `CNAME` file so the custom domain remains active.
