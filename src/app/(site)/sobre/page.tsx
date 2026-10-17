import type { Metadata } from "next";
import { about } from "@/content/about";

export const metadata: Metadata = {
  title: about.title,
  description: about.lead,
  alternates: { canonical: "/sobre" },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[42rem] pb-8 pt-16 md:pt-28">
      <div aria-hidden className="h-[2px] w-10 bg-fg" />
      <p className="label mt-8">{about.title}</p>
      <h1 className="mt-6 text-balance text-[2.5rem] font-light leading-[1.06] tracking-[-0.025em] md:text-[3.75rem]">
        {about.lead}
      </h1>

      <div className="prose-mm mt-12 md:mt-16">
        {about.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <p className="label mt-16 text-faint">{about.note}</p>
    </article>
  );
}
