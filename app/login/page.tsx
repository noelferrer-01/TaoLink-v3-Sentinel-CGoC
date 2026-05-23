export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main
      style={{
        maxWidth: 420,
        margin: '0 auto',
        padding: '4rem 1.5rem',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Sign in</h1>

      <form method="post" action="/api/auth/login" style={{ display: 'grid', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.875rem', opacity: 0.8 }}>Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.875rem', opacity: 0.8 }}>Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            style={inputStyle}
          />
        </label>

        <button type="submit" style={buttonStyle}>
          Sign in
        </button>

        {searchParams.error ? (
          <p style={{ color: '#f87171', marginTop: '0.5rem' }} role="alert">
            {searchParams.error === 'invalid'
              ? 'Invalid email or password.'
              : 'Sign-in failed. Try again.'}
          </p>
        ) : null}
      </form>
    </main>
  );
}

const inputStyle = {
  padding: '0.6rem 0.75rem',
  borderRadius: 6,
  border: '1px solid #2a2f36',
  background: '#11151a',
  color: '#e6e6e6',
  fontSize: '1rem',
} as const;

const buttonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  padding: '0.6rem 1.2rem',
  borderRadius: 6,
  fontSize: '1rem',
  cursor: 'pointer',
  marginTop: '0.5rem',
} as const;
