// Blog is always dark - forced regardless of the visitor's site-wide
// light/dark preference (confirmed with David). NOT using next-themes'
// ThemeProvider for this: this version of the library treats a nested
// <ThemeProvider> as a pure passthrough when it detects an existing
// provider above it (it just renders {children} and silently drops every
// prop, including forcedTheme - confirmed by reading
// node_modules/next-themes/dist/index.js after forcedTheme rendered as
// plain light mode instead of dark). Applying the `.dark` class directly
// on a wrapper works without next-themes at all: app/globals.css's dark
// variant is `&:is(.dark *)` (any .dark ancestor, not specifically
// <html>), so this div alone is enough to force every dark: utility and
// CSS variable underneath it, independent of whatever the root <html>
// element's theme actually is.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark min-h-screen bg-background text-foreground">{children}</div>
}
