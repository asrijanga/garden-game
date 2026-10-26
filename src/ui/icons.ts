/** Hand-drawn style tool icons (inline SVG, 48×48 viewBox). Soft shapes, a few warm colours. */

export const ICONS = {
  move: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M17 26V13.5a2.6 2.6 0 0 1 5.2 0V23 10.5a2.6 2.6 0 0 1 5.2 0V23 12a2.6 2.6 0 0 1 5.2 0v12.5-8a2.5 2.5 0 0 1 5 0V29c0 7.5-5 12.5-11.6 12.5-4.8 0-7.6-2.2-10.2-6.3l-4.6-7.4a2.6 2.6 0 0 1 4.3-2.9z" fill="#f6d2b0" stroke="#a8724e" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M22.2 23v-6M27.4 23v-6M32.6 24.5v-5" stroke="#d9a983" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`,
  path: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M6 40c8-3 10-10 18-13s14-6 18-15" fill="none" stroke="#c9b48c" stroke-width="9" stroke-linecap="round" opacity=".55"/>
    <ellipse cx="11" cy="38" rx="6.2" ry="4.2" fill="#b9b0a3" stroke="#7f766b" stroke-width="1.6"/>
    <ellipse cx="22.5" cy="28.5" rx="6" ry="4" fill="#c7beb1" stroke="#7f766b" stroke-width="1.6"/>
    <ellipse cx="33" cy="20" rx="5.4" ry="3.7" fill="#b9b0a3" stroke="#7f766b" stroke-width="1.6"/>
    <ellipse cx="40" cy="10.5" rx="4.4" ry="3" fill="#c7beb1" stroke="#7f766b" stroke-width="1.6"/>
    <path d="M8.5 36.5c1.5-1 3.5-1.2 5-.6M20 27c1.5-.9 3.4-1 4.8-.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
  </svg>`,
  fence: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M4 40c10-2 30-2 40 0" stroke="#7fb04f" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <path d="M5 24.5h38M5 33.5h38" stroke="#d9cdb6" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M5 24.5h38M5 33.5h38" stroke="#a8916f" stroke-width="1" stroke-linecap="round" opacity=".5"/>
    ${[8.5, 16.5, 24.5, 32.5, 40.5].map((x, i) => `<path d="M${x - 2.6} 39V${15 + (i % 2) * 1.5}l2.6-3.5 2.6 3.5V39z" fill="#fbf7ee" stroke="#9c8667" stroke-width="1.5" stroke-linejoin="round"/>`).join('')}
  </svg>`,
  flowers: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 42V24" stroke="#5f8f3e" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M24 36c-6 0-10-3.5-11-8 5 0 9 2.5 11 8zM24 33c5.5-.5 9-4 9.5-8.5-4.8.3-8.5 3-9.5 8.5z" fill="#7fb04f" stroke="#4f7f33" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M24 25c-5.5 0-8.5-5-7.5-12 2.5 1.5 4.6 3 7.5 6.5 2.9-3.5 5-5 7.5-6.5 1 7-2 12-7.5 12z" fill="#f28fae" stroke="#b9506f" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M24 19.5c-1.5-3-1.4-7.5 0-11 1.4 3.5 1.5 8 0 11z" fill="#f7b3c7" stroke="#b9506f" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="11" cy="16" r="2.4" fill="#ffe27a"/><circle cx="37" cy="8" r="1.8" fill="#c9b8f0"/>
  </svg>`,
  pond: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M7 28c0-7 8-12 17-12s17 4 17 11-7 12-17 12S7 35 7 28z" fill="#8cc4d8" stroke="#4f8aa3" stroke-width="1.8"/>
    <path d="M13 27c2-3 6-5 11-5" stroke="#d9f0f7" stroke-width="2" stroke-linecap="round" fill="none"/>
    <ellipse cx="29" cy="31" rx="6" ry="3.2" fill="#72a84a" stroke="#4f7f33" stroke-width="1.4"/>
    <path d="M29 31l5-2" stroke="#4f7f33" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="27.5" cy="29.6" r="1.7" fill="#f6b3c8"/>
    <ellipse cx="18" cy="33" rx="3.5" ry="1.4" fill="none" stroke="#d9f0f7" stroke-width="1.2"/>
  </svg>`,
  erase: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M30.5 8.5l9 9-3 3-9-9z" fill="#b07a4f" stroke="#7a4f30" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M28 14l6 6-9 9-6-6z" fill="#8a6a50" stroke="#5e4532" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M20 22.5l5.5 5.5c-2 6-7.5 11.5-14.5 12.5 1-7 6.5-12.5 9-18z" fill="#c9cfd4" stroke="#7d868d" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M17.5 30c-1.8 2.2-3 4.5-3.6 6.8" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
    <circle cx="35" cy="37" r="2.2" fill="#8a6a50"/><circle cx="39.5" cy="33" r="1.5" fill="#a07e62"/><circle cx="31" cy="41" r="1.3" fill="#a07e62"/>
  </svg>`,
} as const;
