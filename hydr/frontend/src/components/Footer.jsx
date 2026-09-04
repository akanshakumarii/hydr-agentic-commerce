export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="brand-wordmark">HYDR</span>
        <span>© {new Date().getFullYear()} HYDR Skincare. All rights reserved.</span>
        <nav className="footer-links">
          <a href="mailto:support@hydr.in">Support</a>
        </nav>
      </div>
    </footer>
  );
}