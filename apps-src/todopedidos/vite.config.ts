import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Compila dentro de la suite: public/apps/todopedidos.
// También agrega el estilo común de Todo Copias (se inyecta sin procesar).
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "todocopias-suite-theme",
      transformIndexHtml() {
        return [
          { tag: "script", attrs: { src: "/apps/suite-embed.js" }, injectTo: "head" },
          { tag: "link", attrs: { rel: "stylesheet", href: "/apps/suite-theme.css" }, injectTo: "head" }
        ];
      }
    }
  ],
  build: {
    outDir: "../../public/apps/todopedidos",
    emptyOutDir: true
  }
});
