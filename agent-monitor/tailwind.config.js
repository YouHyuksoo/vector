/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--background)',
        fg: 'var(--foreground)',
        card: 'var(--card)',
        'card-hover': 'var(--card-hover)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        accent: 'var(--accent)',
        secondary: 'var(--secondary)',
        border: 'var(--border)',
        muted: 'var(--muted)',
        'muted-fg': 'var(--muted-fg)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
