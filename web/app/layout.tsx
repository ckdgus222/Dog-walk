import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./_components/auth-provider";
import { QueryProvider } from "./_components/query-provider";
import { NotificationsProvider } from "./_components/notifications-provider";
import { SiteHeader } from "./_components/site-header";
import { WalkRequestModal } from "./_components/walk-request-modal";

// Korean glyphs load on demand by unicode range, so only latin is preloaded.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "강아지 산책",
  description: "함께 산책할 반려인을 찾는 서비스",
};

const RootLayout = ({ children }: LayoutProps<"/">) => {
  return (
    <html lang="ko" className={notoSansKr.variable}>
      <body>
        <AuthProvider>
          <QueryProvider>
            <NotificationsProvider>
              <SiteHeader />
              {children}
              <WalkRequestModal />
            </NotificationsProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
};
export default RootLayout;
