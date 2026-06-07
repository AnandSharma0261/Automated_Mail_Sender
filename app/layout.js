import './globals.css';

export const metadata = {
  title: 'Automated Mail Sender',
  description: 'Send bulk emails now or schedule them for later — built with Next.js.',
};

// Set the theme before paint so there's no flash of the wrong theme.
const themeScript = `
  try {
    var t = localStorage.getItem('mailTheme');
    if (!t) t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
