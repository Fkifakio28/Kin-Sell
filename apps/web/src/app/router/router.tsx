import { createBrowserRouter } from "react-router-dom";
import { lazy } from "react";

/* Lazy-load all pages for code-splitting */
const HomeEntry = lazy(() => import("../../features/home/HomeEntry").then(m => ({ default: m.HomeEntry })));
const ExplorerPage = lazy(() => import("../../features/explorer/ExplorerPage").then(m => ({ default: m.ExplorerPage })));
const ExplorerShopsPage = lazy(() => import("../../features/explorer/ExplorerShopsPage").then(m => ({ default: m.ExplorerShopsPage })));
const ExplorerProfilesPage = lazy(() => import("../../features/explorer/ExplorerProfilesPage").then(m => ({ default: m.ExplorerProfilesPage })));
const SoKinPage = lazy(() => import("../../features/sokin/SoKinPage").then(m => ({ default: m.SoKinPage })));
const SoKinProfilesPage = lazy(() => import("../../features/sokin/SoKinProfilesPage").then(m => ({ default: m.SoKinProfilesPage })));
const SoKinMarketPage = lazy(() => import("../../features/sokin/SoKinMarketPage").then(m => ({ default: m.SoKinMarketPage })));
const LoginPage = lazy(() => import("../../features/auth/LoginPage").then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("../../features/auth/RegisterPage").then(m => ({ default: m.RegisterPage })));
const SuspendedPage = lazy(() => import("../../features/auth/SuspendedPage").then(m => ({ default: m.SuspendedPage })));
const OfflinePage = lazy(() => import("../../features/offline/OfflinePage").then(m => ({ default: m.OfflinePage })));
const UserDashboard = lazy(() => import("../../features/dashboards/UserDashboard").then(m => ({ default: m.UserDashboard })));
const BusinessDashboard = lazy(() => import("../../features/dashboards/BusinessDashboard").then(m => ({ default: m.BusinessDashboard })));
const AdminDashboard = lazy(() => import("../../features/dashboards/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AboutPage = lazy(() => import("../../features/info-pages/AboutPage").then(m => ({ default: m.AboutPage })));
const TermsPage = lazy(() => import("../../features/info-pages/TermsPage").then(m => ({ default: m.TermsPage })));
const HowItWorksPage = lazy(() => import("../../features/info-pages/HowItWorksPage").then(m => ({ default: m.HowItWorksPage })));
const GuidePage = lazy(() => import("../../features/info-pages/GuidePage").then(m => ({ default: m.GuidePage })));
const BlogPage = lazy(() => import("../../features/info-pages/BlogPage").then(m => ({ default: m.BlogPage })));
const PrivacyPage = lazy(() => import("../../features/info-pages/PrivacyPage").then(m => ({ default: m.PrivacyPage })));
const LegalPage = lazy(() => import("../../features/info-pages/LegalPage").then(m => ({ default: m.LegalPage })));
const FaqPage = lazy(() => import("../../features/info-pages/FaqPage").then(m => ({ default: m.FaqPage })));
const ContactPage = lazy(() => import("../../features/info-pages/ContactPage").then(m => ({ default: m.ContactPage })));
const PricingPage = lazy(() => import("../../features/pricing/PricingPage").then(m => ({ default: m.PricingPage })));
const CartPage = lazy(() => import("../../features/cart/CartPage").then(m => ({ default: m.CartPage })));

/* Param wrappers */
import { PublicProfileWrapper, BusinessShopWrapper } from "./ParamWrappers";

/* Layouts */
import { RootLayout } from "./RootLayout";
import { AppLayout } from "./AppLayout";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      /* Pages without header (Home + So-Kin) */
      { path: "/", element: <HomeEntry /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/suspended", element: <SuspendedPage /> },
      { path: "/offline", element: <OfflinePage /> },
      { path: "/sokin", element: <SoKinPage /> },
      { path: "/sokin/profiles", element: <SoKinProfilesPage /> },
      { path: "/sokin/market", element: <SoKinMarketPage /> },

      /* All other pages — with header */
      {
        element: <AppLayout />,
        children: [
          { path: "/about", element: <AboutPage /> },
          { path: "/terms", element: <TermsPage /> },
          { path: "/how-it-works", element: <HowItWorksPage /> },
          { path: "/guide", element: <GuidePage /> },
          { path: "/blog", element: <BlogPage /> },
          { path: "/privacy", element: <PrivacyPage /> },
          { path: "/legal", element: <LegalPage /> },
          { path: "/faq", element: <FaqPage /> },
          { path: "/contact", element: <ContactPage /> },
          { path: "/forfaits", element: <PricingPage /> },
          { path: "/plans", element: <PricingPage /> },
          { path: "/cart", element: <CartPage /> },
          { path: "/account", element: <UserDashboard /> },
          { path: "/business/dashboard", element: <BusinessDashboard /> },
          { path: "/admin/dashboard", element: <AdminDashboard /> },

          { path: "/explorer", element: <ExplorerPage /> },
          { path: "/explorer/shops-online", element: <ExplorerShopsPage /> },
          { path: "/explorer/public-profiles", element: <ExplorerProfilesPage /> },
          { path: "/user/:username", element: <PublicProfileWrapper /> },
          { path: "/business/:slug", element: <BusinessShopWrapper /> },
        ],
      },
    ],
  },
]);
