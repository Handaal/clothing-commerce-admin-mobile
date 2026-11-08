import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

/**
 * Web-only document shell (Expo Router renders this to static HTML for every route). It is the one
 * place to load web fonts and express the interaction polish that React Native inline styles can't:
 * document-wide hover, focus rings, transitions, and motion. Native builds never see this file.
 */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#26413A" />

        {/* Editorial serif, geometric UI sans, and a crisp professional tenant display face. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const globalCss = `
:root {
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --ring: rgba(38, 65, 58, 0.30);
}

html, body, #root {
  background-color: #F5F1EA;
}

body {
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

html[dir="rtl"] body,
html[dir="rtl"] #root {
  direction: rtl;
}

html[dir="rtl"] input,
html[dir="rtl"] textarea,
html[dir="rtl"] select {
  direction: rtl;
  text-align: right;
}

#root { display: flex; flex: 1 1 100%; min-height: 100%; }

/* Smooth, consistent interaction timing for every interactive surface and field. */
[role="button"],
[role="tab"],
[data-anim],
a,
button,
input,
textarea,
select {
  transition:
    transform 0.13s var(--ease),
    box-shadow 0.2s var(--ease),
    background-color 0.2s var(--ease),
    border-color 0.2s var(--ease),
    opacity 0.13s var(--ease),
    filter 0.2s var(--ease);
}

/* Pointer affordance + a gentle lift/brighten on hover. Inline styles never set transform, so the
   lift applies cleanly; brightness keeps it subtle on any tone. */
@media (hover: hover) {
  [role="button"],
  [role="tab"],
  a {
    cursor: pointer;
  }
  [role="button"]:hover,
  [role="tab"]:hover {
    filter: brightness(1.025);
  }
  [data-lift]:hover {
    transform: translateY(-2px);
  }
  [data-navigation-item="true"]:hover {
    transform: translateY(-4px);
  }
  [data-navigation-item="true"]:hover [data-navigation-icon="true"] {
    transform: translateY(-1px) scale(1.1) rotate(-3deg);
  }
  [data-navigation-item="true"][data-navigation-active="true"]:hover {
    transform: translateY(-3px) scale(1.025);
    filter: brightness(1.06);
  }
}

[data-navigation-icon="true"] {
  transition: transform 0.2s var(--ease), background-color 0.2s var(--ease);
}

[role="button"]:active {
  transform: translateY(0) scale(0.995);
}

/* Accessible focus ring for keyboard users across controls and fields. */
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[role="button"]:focus-visible,
[role="tab"]:focus-visible,
a:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--ring);
}
input:focus,
textarea:focus {
  outline: none;
  border-color: #26413A !important;
  box-shadow: 0 0 0 3px var(--ring);
}

::selection {
  background: rgba(162, 63, 45, 0.18);
}

/* Warm, slim scrollbars that match the cream canvas. */
* {
  scrollbar-width: thin;
  scrollbar-color: #C9BCA8 transparent;
}
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-thumb {
  background: #C9BCA8;
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: content-box;
}
*::-webkit-scrollbar-thumb:hover { background: #8A7D6F; background-clip: content-box; }

/* Toast notifications slide + fade down on enter, and back up on leave. */
@keyframes toast-in {
  from { opacity: 0; transform: translateY(-14px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes toast-out {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(-10px) scale(0.98); }
}
[data-toast] { animation: toast-in 0.22s var(--ease) both; }
[data-toast-leaving] { animation: toast-out 0.19s var(--ease) both; }

@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
  }
  [data-lift]:hover { transform: none; }
}
`;
