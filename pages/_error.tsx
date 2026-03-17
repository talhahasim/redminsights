import { NextPageContext } from 'next';

interface ErrorProps {
  statusCode?: number;
}

function Error({ statusCode }: ErrorProps) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      background: '#0a0a0a',
      color: '#ededed',
    }}>
      <h1 style={{ fontSize: '4rem', margin: 0, color: '#b91c1c' }}>
        {statusCode || 'Error'}
      </h1>
      <p style={{ color: '#737373', marginTop: '0.5rem' }}>
        {statusCode
          ? `An error ${statusCode} occurred on server`
          : 'An error occurred on client'}
      </p>
      <a
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
      </a>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
