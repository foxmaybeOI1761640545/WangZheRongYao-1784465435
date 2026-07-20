import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor Android 容器配置。
 *
 * Web 版本继续使用 Vite 的 GitHub Pages base；Android 构建通过
 * `vite build --base ./` 生成相对资源路径，随后同步到 android/app/src/main/assets/public。
 */
const config: CapacitorConfig = {
  appId: 'com.foxmaybe.wangzheaccountmanager',
  appName: '王者多账号管理器',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
