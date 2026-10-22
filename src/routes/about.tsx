import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About MathGraph — and how to contribute" },
      {
        name: "description",
        content:
          "MathGraph maps mathematics as a connected graph of " +
          "axioms, definitions, theorems and proofs.",
      },
      { property: "og:title", content: "About MathGraph" },
      {
        property: "og:description",
        content: "Why mathematics is a graph, not a list of facts — and how you can add to it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8 leading-relaxed">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">{t("about.heading")}</h1>
        <Link to="/" className="text-sm underline">{t("common.backToGraph")}</Link>
      </div>
      <section className="space-y-3">
        <p>{t("about.p1")}</p>
        <p>{t("about.p2")}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("about.exploreHeading")}</h2>
        <p>{t("about.exploreText")}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("about.contributeHeading")}</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <Link to="/auth" className="underline">{t("about.createAccount")}</Link>{" "}
            {t("about.step1")}
          </li>
          <li>{t("about.step2")}</li>
          <li>{t("about.step3")}</li>
          <li>{t("about.step4")}</li>
          <li>{t("about.step5")}</li>
        </ol>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("about.accountabilityHeading")}</h2>
        <p>
          <Trans
            i18nKey="about.accountabilityText"
            components={{
              historyLink: <Link to="/history" className="underline" />,
            }}
          />
        </p>
      </section>
    </main>
  );
}
