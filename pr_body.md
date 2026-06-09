## Description
This PR resolves #493 by introducing a "Copy to Clipboard" button for all bot-generated responses in the `ChatPanel`. This significantly improves the user experience by allowing quick extraction of generated summaries and answers without requiring manual text selection.

## Changes Made
- Added a `copied` boolean state to `MessageBubble.jsx`.
- Introduced a new `handleCopy` function utilizing the `navigator.clipboard.writeText()` browser API.
- Integrated `ContentCopyIcon` and `CheckIcon` from `@mui/icons-material`.
- Added the "Copy" button adjacent to the existing "Save Answer" button, ensuring it matches the application's existing light/dark mode UI styling.
- Implemented visual feedback: the button temporarily changes to a green "Copied!" state with a checkmark for 2 seconds upon successful copy.

## Issue Fixed
Fixes #493 

## GSSOC 2026
This PR is submitted as part of GirlScript Summer of Code 2026.
