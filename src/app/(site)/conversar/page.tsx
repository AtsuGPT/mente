import type { Metadata } from "next";
import { SiteChat } from "@/components/site-chat";

export const metadata: Metadata = {
  title: "Perguntar ao arquivo",
  description: "Converse sobre as ideias dos pensamentos publicados por Kayk.",
  alternates: { canonical: "/conversar" },
};

export default function ChatPage() {
  return (
    <>
      <header className="site-page-heading">
        <p className="label">Conversa</p>
        <h1 className="mt-3 font-sans text-3xl font-semibold">Perguntar ao arquivo</h1>
        <p className="mt-2 text-sm text-muted">Uma conversa com os pensamentos publicados.</p>
      </header>
      <SiteChat />
    </>
  );
}