import type { Metadata } from "next";
import { SiteChat } from "@/components/site-chat";
import { getAccessRole } from "@/lib/auth/session";
import { listCategories } from "@/server/categories";

export const metadata: Metadata = {
  title: "Perguntar ao arquivo",
  description: "Converse sobre as ideias dos pensamentos publicados por Kayk.",
  alternates: { canonical: "/conversar" },
};

export default async function ChatPage() {
  const role = (await getAccessRole()) ?? "CONVIDADO";
  // Categorias só são necessárias para quem pode criar posts pelo chat.
  const categories = role === "ADMIN" ? (await listCategories()).map(({ id, name }) => ({ id, name })) : [];

  return (
    <>
      <header className="site-page-heading">
        <p className="label">Conversa</p>
        <h1 className="mt-3 font-sans text-3xl font-semibold">Perguntar ao arquivo</h1>
        <p className="mt-2 text-sm text-muted">Uma conversa com os pensamentos publicados, com a Kally.</p>
      </header>
      <SiteChat role={role} categories={categories} />
    </>
  );
}
