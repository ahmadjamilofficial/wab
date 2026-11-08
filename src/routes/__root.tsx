import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { LocaleProvider } from "@/lib/locale-context";
import { Analytics } from "@vercel/analytics/react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },

      // ── Primary SEO ──────────────────────────────────────────────────────
      { title: "Wab — AI-Native Financial Audit & Compliance for PSX, NSE Traders" },
      {
        name: "description",
        content:
          "Wab is an AI-powered trade reconciliation and CGT tax engine for PSX (Pakistan) and NSE (India) traders. Upload broker slips, get a FIFO-accurate, audit-ready ledger in minutes. Free for 50 transactions/month.",
      },
      {
        name: "keywords",
        content:
          "PSX tax calculator, NSE CGT calculator, Pakistan capital gains tax, FIFO trade reconciliation, broker slip parser, AI financial audit, portfolio ledger PSX, WHT calculator Pakistan, NSE STCG LTCG, trade confirmation parser, Wab",
      },
      { name: "author", content: "Wab" },
      { name: "robots", content: "index, follow" },
      {
        name: "googlebot",
        content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
      },
      { name: "theme-color", content: "#0B0C0E" },
      { name: "rating", content: "general" },
      { name: "revisit-after", content: "7 days" },
      { name: "language", content: "English" },

      // ── Open Graph ───────────────────────────────────────────────────────
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://psxl.live/" },
      { property: "og:site_name", content: "Wab" },
      {
        property: "og:title",
        content: "Wab — AI-Native Trade Reconciliation & CGT Engine for PSX & NSE",
      },
      {
        property: "og:description",
        content:
          "Replace hours of manual ledger work with Wab. Upload any PSX or NSE broker slip — AI extracts every field, FIFO math computes your CGT, and an immutable audit trail keeps you filing-ready.",
      },
      { property: "og:image", content: "https://psxl.live/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Wab dashboard showing portfolio reconciliation and tax computation",
      },
      { property: "og:locale", content: "en_US" },

      // ── Twitter / X ──────────────────────────────────────────────────────
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@wabapp" },
      { name: "twitter:creator", content: "@wabapp" },
      { name: "twitter:title", content: "Wab — AI-Native Trade Reconciliation & CGT Engine" },
      {
        name: "twitter:description",
        content:
          "Upload your PSX/NSE broker slips. AI extracts the data, FIFO math computes your capital gains tax, and an immutable audit trail keeps you filing-ready.",
      },
      { name: "twitter:image", content: "https://psxl.live/og-image.png" },
      { name: "twitter:image:alt", content: "Wab — AI-powered trade reconciliation dashboard" },

      // ── App / Mobile ─────────────────────────────────────────────────────
      { name: "application-name", content: "Wab" },
      { name: "apple-mobile-web-app-title", content: "Wab" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "msapplication-TileColor", content: "#0B0C0E" },

      // ── Structured Data hint ─────────────────────────────────────────────
      { name: "category", content: "Finance, Tax, Accounting, Trading" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://db.onlinewebfonts.com/c/04e6981992c0e2e7642af2074ebe3901?family=Helvetica+Now+Display+Bold",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      { rel: "apple-touch-icon", href: "/favicon.png", sizes: "64x64" },
      { rel: "canonical", href: "https://psxl.live/" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": "https://psxl.live/#app",
        name: "Wab",
        url: "https://psxl.live",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        description:
          "AI-native financial audit and compliance agent for PSX and NSE traders. Multimodal document parsing, FIFO CGT computation, and immutable audit trails.",
        offers: [
          {
            "@type": "Offer",
            name: "Basic",
            price: "0",
            priceCurrency: "USD",
            description: "Completely free. Limited AI quality, 30 transactions/month, core tools.",
          },
          {
            "@type": "Offer",
            name: "Standard",
            price: "9",
            priceCurrency: "USD",
            billingIncrement: "P1M",
            description: "$9/month or $45/year. 7-day free trial. Standard AI quality.",
          },
          {
            "@type": "Offer",
            name: "Pro",
            price: "25",
            priceCurrency: "USD",
            billingIncrement: "P1M",
            description: "$25/month or $90/year. Highest AI quality and full tool set.",
          },
        ],
        featureList: [
          "Multimodal trade confirmation parser (PDF, image, CSV)",
          "FIFO capital gains tax computation for PSX and NSE",
          "Immutable hash-chained audit log",
          "AI anomaly detection and reconciliation",
          "Tax-loss harvesting suggestions",
          "Google OAuth and email authentication",
          "Multi-tenant row-level security",
        ],
        screenshot: "https://psxl.live/og-image.png",
      },
      {
        "@type": "Organization",
        "@id": "https://psxl.live/#org",
        name: "Wab",
        url: "https://psxl.live",
        logo: "https://psxl.live/favicon.png",
        sameAs: ["https://twitter.com/wabapp", "https://linkedin.com/company/wab"],
      },
      {
        "@type": "WebSite",
        "@id": "https://psxl.live/#website",
        url: "https://psxl.live",
        name: "Wab",
        description: "AI-Native Financial Audit & Compliance for PSX and NSE Traders",
        publisher: { "@id": "https://psxl.live/#org" },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://psxl.live/?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is Wab?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Wab is an AI-native financial audit and compliance agent for retail traders and micro-brokerages trading on PSX (Pakistan Stock Exchange) and NSE (India National Stock Exchange). It parses broker trade confirmations and computes capital gains tax automatically.",
            },
          },
          {
            "@type": "Question",
            name: "How does Wab compute capital gains tax?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Wab uses a deterministic FIFO (First In, First Out) lot-matching engine written in TypeScript. The AI model never computes numbers — it only extracts data from documents. Tax math is 100% code-based and auditable.",
            },
          },
          {
            "@type": "Question",
            name: "Which stock exchanges does Wab support?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Wab currently supports PSX (Pakistan) with CGT slabs and Filer/Non-Filer WHT rates, and NSE (India) with STCG/LTCG rules per the 2024 Union Budget. More jurisdictions are coming.",
            },
          },
        ],
      },
    ],
  });

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <TooltipProvider>
            <AuthProvider>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
              <Toaster position="bottom-right" />
              <Analytics />
            </AuthProvider>
          </TooltipProvider>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
