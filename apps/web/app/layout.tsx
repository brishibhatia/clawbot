import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DeepClean Butler — Verifiable AI Cleanup Agent",
  description: "Verify CleanupRun proofs anchored on Sui with data stored on Walrus. No secrets needed.",
  keywords: ["Sui", "Walrus", "DeepClean", "verification", "proof", "blockchain", "hackathon"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="container nav-inner">
            <Link href="/" className="nav-brand">
              <div className="nav-brand-icon">🧹</div>
              DeepClean Butler
            </Link>
            <ul className="nav-links">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/verify">Verify</Link></li>
              <li><Link href="/docs">Docs</Link></li>
              <li>
                <a href="https://github.com/brishibhatia/clawbot" target="_blank" rel="noopener">
                  GitHub ↗
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {children}

        <footer className="footer">
          <div className="container">
            Built for{" "}
            <a href="https://github.com/brishibhatia/clawbot" target="_blank" rel="noopener">
              Mission: OpenClaw (Sui × OpenClaw)
            </a>
            {" "}• Track 2: Local God Mode
          </div>
        </footer>
      </body>
    </html>
  );
}
