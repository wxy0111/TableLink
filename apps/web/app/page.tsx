import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">系岛食堂</div>
        <nav className="nav">
          <Link href="/table/TABLE-01">顾客点餐</Link>
          <Link href="/setup">初始化</Link>
          <Link href="/kitchen">厨房屏</Link>
          <Link href="/service">服务员面板</Link>
          <Link href="/staff">收银台</Link>
          <Link href="/admin">店长后台</Link>
        </nav>
      </header>
      <section className="hero">
        <span className="pill">第一版 MVP</span>
        <h1>扫码点餐、厨房接单、收银结账，先把堂食闭环跑稳。</h1>
        <p>
          当前首页用于本地开发导航。正式上线时，顾客会从桌台二维码直接进入对应桌台菜单。
        </p>
      </section>
    </main>
  );
}
