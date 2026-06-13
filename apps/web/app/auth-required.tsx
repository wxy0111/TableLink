export function AuthRequired({ title = '需要登录' }: { title?: string }) {
  return (
    <main className="shell">
      <section className="form-panel auth-panel">
        <div>
          <div className="brand">{title}</div>
          <p className="muted">请先登录，再访问这个工作台。</p>
        </div>
        <a className="button primary-button" href="/login">
          去登录
        </a>
      </section>
    </main>
  );
}
