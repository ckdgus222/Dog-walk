import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth-provider";
import { NotificationsProvider } from "./notifications-provider";
import { SiteHeader } from "./site-header";
import { WalkRequestModal } from "./walk-request-modal";

export const metadata: Metadata = {
  title: "강아지 산책",
  description: "함께 산책할 반려인을 찾는 서비스",
};

const RootLayout = ({ children }: LayoutProps<"/">) => {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <NotificationsProvider>
            <SiteHeader />
            {children}
            <WalkRequestModal />
          </NotificationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
};
export default RootLayout;
