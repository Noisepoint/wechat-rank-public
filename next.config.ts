import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 解决 Turbopack 在多 lockfile 场景下误判 workspace root 的警告
  // 参考：开发时若上层目录也存在 package-lock.json，Next 可能会把根目录推断到错误位置
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
