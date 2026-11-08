import type { Metadata } from "next";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false, follow: false } };

/** Só aparece fora do app web (ex.: /api ou /convite inexistentes); as rotas do app caem em "/". */
export default function NotFound() {
  return (
    <main id="conteudo" className="standalone">
      <div className="standalone-card">
        <p className="eyebrow">Erro 404</p>
        <h1>Esta página não existe.</h1>
        <p className="lead">O endereço pode ter mudado ou o conteúdo não está mais disponível.</p>
        <div className="standalone-actions">
          <a href="/" className="button button-primary">
            Abrir o Minha Mente
          </a>
        </div>
      </div>
    </main>
  );
}
