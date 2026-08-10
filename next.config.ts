import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fixa a raiz do projeto para o Turbopack não confundir com pastas pai
  // (evita o aviso sobre package-lock.json em C:\Users\User).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
