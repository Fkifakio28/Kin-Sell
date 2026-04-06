import React from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

interface PageLayoutProps {
  children: React.ReactNode;
  hideHeader?: boolean;
}

export function PageLayout({ children, hideHeader = false }: PageLayoutProps) {
  return (
    <div className="page-layout">
      {hideHeader ? null : <Header />}
      <main className="page-main">
        <div className="page-main-content">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
