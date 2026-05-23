import { getSessionFromCookie } from '@/modules/auth';

export default async function HomePage() {
  const session = await getSessionFromCookie();

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '4rem 1.5rem',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Sentinel</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        TaoLink v3 — Slice 0 foundation. HRIS + payroll for Commander Group of Companies.
      </p>

      <section style={{ marginTop: '2rem' }}>
        {session ? (
          <>
            <p>
              Signed in as <strong>{session.user.email}</strong>.
            </p>
            <form action="/api/auth/logout" method="post">
              <button type="submit" style={buttonStyle}>
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <p>Not signed in.</p>
            <a href="/login" style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none' }}>
              Log in
            </a>
          </>
        )}
      </section>

      <footer style={{ marginTop: '4rem', opacity: 0.5, fontSize: '0.875rem' }}>
        Slice 0 — Foundation (no demo). See <code>wiki/slices/0-foundation.md</code>.
      </footer>
    </main>
  );
}

const buttonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  padding: '0.6rem 1.2rem',
  borderRadius: 6,
  fontSize: '1rem',
  cursor: 'pointer',
} as const;
