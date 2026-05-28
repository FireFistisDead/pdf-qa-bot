## Summary
This PR completely overhauls the Dashboard with a highly polished, brutalist "command center" design system that matches the extreme aesthetics of the landing page, and introduces the foundational navigation logic for all dashboard modules.

## Major Changes

### 1. Architectural Updates & Navigation (`Dashboard.jsx`, `DashboardLayout.jsx`)
- Replaced the single-view dashboard rendering with **React Router nested routing**.
- Hooked up all sidebar navigation items (`/dashboard`, `/dashboard/documents`, `/dashboard/chat`, `/dashboard/knowledge`, `/dashboard/settings`).
- Created placeholder views for each route with "MODULE OFFLINE" brutalist construction screens to ensure proper routing state without breaking the UI.
- Implemented active route detection in the sidebar navigation to provide glowing states to the active module.

### 2. Sidebar Redesign & Interactions
- Replaced the static dark sidebar with a floating, glassmorphic `.dash-side-extreme` layout (`backdrop-filter: blur(20px)`).
- **Interactive Nav Links:** Added heavy neon glowing effects, box-shadows, and icon scaling when hovering over inactive navigation buttons.
- **User Profile Area:** Overhauled the bottom profile display. It now features an animated "Sys.Online" ping dot, a hover glow effect, text shifting animations, and an animated laser gradient sweep (`::before` pseudo-element) on hover.
- **Collapse Toggle:** Added an interactive "hide sidebar" button that dynamically shrinks the sidebar to an icon-only view (`80px`), freeing up screen real estate.
- **Dynamic Content Shifting:** The main content area now listens to the sidebar state and transitions smoothly to fill the gap using a 0.4s cubic-bezier margin transition.

### 3. Hero "Scanner" Dashboard Component (`DashboardHome.jsx`)
- Replaced the plain greeting with a massive `dash-hero-extreme` section.
- **3D PDF Scanner Element:** Implemented a pure CSS 3D rotating glass document (`.hero-3d-visual`) complete with mock text blocks, a signature line, glowing edges, and an animated **neon scanning laser** (`.pdf-scanner`) that sweeps across the document.
- **Abstract Ambient Background:** Added floating, pulsating green neon orbs and a faint coordinate grid to give the background depth.
- **HUD Elements & Buttons:** Added brutalist latency readouts, a mock barcode, and primary/secondary action buttons underneath the greeting.
- **Responsive Flex Layout:** Converted the hero to a two-column layout that stacks beautifully on screens smaller than `1024px`.

## Verification
- Run `npm run dev` and navigate to `/dashboard`.
- Verify the sidebar can be toggled via the collapse button near the logo.
- Verify clicking sidebar items updates the URL and renders the placeholder components.
- Verify the 3D scanning animation functions correctly and the layout is responsive on smaller viewports.
