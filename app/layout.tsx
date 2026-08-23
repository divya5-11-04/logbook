import "./globals.css";

export const metadata = {
  title: "Logbook — your career, tracked",
  description: "Log what you build. Get a post, an updated resume, and what to learn next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
