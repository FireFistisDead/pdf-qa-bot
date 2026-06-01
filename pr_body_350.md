## Description

This PR addresses two major architectural improvements:

1. **Modularize Large Files & Implement Error Boundaries (Fixes #350)**
   - The massive `App.js` file (700+ lines) was becoming difficult to maintain. The inner `MainApp` logic has been safely extracted into its own `MainApp.jsx` component.
   - A global `<ErrorBoundary>` component was introduced at the top level to catch unhandled React errors, display a user-friendly fallback UI, and provide a quick reload button instead of crashing the entire app silently.

2. **Optimize Initial Load via Lazy Loading (Fixes #347)**
   - Implemented route-based Code Splitting using `React.lazy()` and `<Suspense>` in `App.js`.
   - Major views (`MainApp`, `LandingPage`, `Dashboard`, `StudyHub`, `SignIn`, `SignUp`) are now lazily loaded, significantly reducing the initial bundle size and improving the First Contentful Paint (FCP).

## Type of change

- [x] Refactor (code restructuring without behavior change)
- [x] Performance enhancement
- [x] Bug fix / Resilience improvement

## Checklist:

- [x] My code follows the style guidelines of this project
- [x] I have performed a self-review of my own code
- [x] I have verified that the React build runs successfully
