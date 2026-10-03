import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Renders a TeX string to an SVG on the server (mathjax-full is pure JS,
// so it runs fine in the edge runtime). The client shows it as an <img>.
export const renderLatex = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ tex: z.string().min(1).max(2000) }).parse(data))
  .handler(async ({ data }) => {
    const { mathjax } = await import("mathjax-full/js/mathjax");
    const { TeX } = await import("mathjax-full/js/input/tex");
    const { SVG } = await import("mathjax-full/js/output/svg");
    const { liteAdaptor } = await import("mathjax-full/js/adaptors/liteAdaptor");
    const { RegisterHTMLHandler } = await import("mathjax-full/js/handlers/html");
    const { AllPackages } = await import("mathjax-full/js/input/tex/AllPackages");

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages });
    const svg = new SVG({ fontCache: "local" });
    const doc = mathjax.document("", { InputJax: tex, OutputJax: svg });
    const node = doc.convert(data.tex, { display: false });
    let html = adaptor.outerHTML(node);
    // Make the SVG inherit text color so it fits the card theme
    html = html.replace("<svg ", '<svg fill="currentColor" ');
    return { svg: html };
  });
