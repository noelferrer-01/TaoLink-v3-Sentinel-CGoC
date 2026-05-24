export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-wordmark">Sentinel</div>
        <div className="auth-tag">Commander Group · HRIS &amp; Payroll</div>
        <div className="auth-divider" />

        <form method="post" action="/api/auth/login" className="form-stack">
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="input"
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="input"
            />
          </label>

          <button type="submit" className="btn" style={{ marginTop: '0.5rem' }}>
            Sign in
          </button>

          {searchParams.error ? (
            <p className="form-error" role="alert">
              {searchParams.error === 'invalid'
                ? "That email and password don't match. Try again."
                : "We couldn't sign you in. Try again."}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
