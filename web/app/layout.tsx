import type { Metadata } from "next";
import { Gowun_Dodum } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./_components/auth-provider";
import { FieldScene } from "./_components/field-scene";
import { QueryProvider } from "./_components/query-provider";
import { NotificationsProvider } from "./_components/notifications-provider";
import { LoginWelcome } from "./_components/login-welcome";
import { SiteHeader } from "./_components/site-header";
import { WalkRequestModal } from "./_components/walk-request-modal";
import { Intro } from "./_components/intro";
import { introHeadScript } from "./_components/intro-seen";

// Korean glyphs load on demand by unicode range, so only latin is preloaded.
const gowunDodum = Gowun_Dodum({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-sans",
});

const title = "옆집 강아지";
const description = "함께 산책할 반려인을 찾는 서비스";

export const metadata: Metadata = {
  // Link previews (KakaoTalk) need the image as a full URL. Without this,
  // Next.js would write a localhost address.
  metadataBase: process.env.SITE_URL
    ? new URL(process.env.SITE_URL)
    : undefined,
  title,
  description,
  openGraph: { title, description, type: "website", locale: "ko_KR" },
};

const RootLayout = ({ children, modal }: LayoutProps<"/">) => {
  return (
    <html
      lang="ko"
      className={gowunDodum.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: introHeadScript }} />
      </head>
      <body>
        {/* The wobble of every hand-drawn outline (ui.module.css .rough). */}
        <svg
          width="0"
          height="0"
          style={{ position: "absolute" }}
          aria-hidden="true"
        >
          <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.035"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="4"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
        <Intro />
        {/* Outside the providers, which rebuild their children when the
            account changes, so the background never restarts. */}
        <FieldScene variant="home" />
        <AuthProvider>
          {/* Above the query provider, which is built anew when the account
              changes and would restart the welcome's timer. */}
          <LoginWelcome />
          <QueryProvider>
            <NotificationsProvider>
              <SiteHeader />
              {children}
              {modal}
              <WalkRequestModal />
            </NotificationsProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
};
export default RootLayout;
