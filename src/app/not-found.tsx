import Link from 'next/link';

export const runtime = 'edge';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#0a0a0a',
        color: '#ededed',
      }}
    >
      <h2 style={{ fontSize: '4rem', margin: 0, color: '#b91c1c' }}>404</h2>
      <p style={{ color: '#737373', marginTop: '0.5rem' }}>Page not found</p>
      <Link
        href="/"
        style={{
          marginTop: '1.5rem',
          padding: '0.5rem 1rem',
          background: '#b91c1c',
          color: 'white',
          textDecoration: 'none',
        }}
      >
        Go Home
      </Link>
    </div>
  );
}
