## Description

This PR fixes accessibility issues reported in #348. Specifically, it ensures that all non-native interactive elements (such as `div` and `span` tags functioning as buttons) have keyboard navigation support by adding `tabIndex={0}`, `role="button"` or `role="switch"`, and `onKeyDown` event listeners to capture "Enter" and "Space" key presses. Additionally, missing `aria-label`s were carefully added only to icon-only buttons (like sidebar toggles) to ensure screen readers can correctly identify them without overriding the visible text content of regular text buttons.

Fixes #348

## Type of change

- [x] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] This change requires a documentation update

## Checklist:

- [x] My code follows the style guidelines of this project
- [x] I have performed a self-review of my own code
- [x] I have commented my code, particularly in hard-to-understand areas
- [x] My changes generate no new warnings
