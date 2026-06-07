import './globals.css';

export const metadata = {
  title: 'Automated Mail Sender',
  description: 'Send bulk emails now or schedule them for later — built with Next.js.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
