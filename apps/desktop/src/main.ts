import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Backend } from "./backend.js";
import { APP_NAME, cleanEnvironment, executeFile, readConfiguration } from "./config.js";
import { navigationTarget } from "./navigation.js";
import { OnlineUpdater } from "./online-update.js";

let backend: Backend | undefined;
let window: BrowserWindow | undefined;
let quitting = false;
let mayExit = false;
let ready = false;
let quitPromise: Promise<void> | undefined;
const updater = new OnlineUpdater(() => window && !window.isDestroyed() ? window : undefined);
if (app.isPackaged) {
  const installedName = basename(dirname(dirname(dirname(process.execPath))), ".app");
  app.setName(installedName);
  app.setPath("userData", join(app.getPath("appData"), installedName));
}
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
function report(error: unknown): void {
  const options = { type: "error" as const, title: APP_NAME, message: errorMessage(error),
    detail: backend ? `日志：${backend.config.desktopLogPath}` : "请检查 App 的 local-runtime.json 与本机 Node 配置。" };
  if (window && !window.isDestroyed()) {
    window.show();
    void dialog.showMessageBox(window, options);
  } else void dialog.showMessageBox(options);
}
async function showWindow(): Promise<void> {
  if (quitting || !ready || !backend) return;
  if (window && !window.isDestroyed()) { window.show(); window.focus(); return; }
  window = new BrowserWindow({ width: 1280, height: 860, minWidth: 800, minHeight: 560, title: APP_NAME,
    ...(process.platform === "darwin" ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 14, y: 12 } } : {}),
    backgroundColor: "#0d0d0d",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  const current = window;
  if (process.platform === "darwin") {
    // Presentation hint only; no privileged renderer bridge is needed for window chrome.
    current.webContents.setUserAgent(`${current.webContents.getUserAgent()} CodexMemoryOSDesktop/1`);
  }
  const origin = backend.origin;
  const openLink = async (url: string): Promise<void> => {
    const target = navigationTarget(url, origin);
    try {
      if (target.kind === "external") {
        const result = await dialog.showMessageBox(current, {
          type: "question", message: "在系统浏览器中打开此链接？", detail: target.url,
          buttons: ["打开", "取消"], defaultId: 1, cancelId: 1,
        });
        if (result.response === 0) await shell.openExternal(target.url);
      } else if (target.kind === "internal") await current.loadURL(target.url);
      else if (target.kind === "local") {
        if (!(await stat(target.path)).isFile()) throw new Error("链接指向的不是普通文件，请检查知识原文中的路径。");
        // Force text-editor handling: never execute a script or app from a knowledge link.
        await executeFile("/usr/bin/open", ["-t", target.path], { env: cleanEnvironment(), timeout: 10000 });
      } else throw new Error("此链接不是知识库页面，也不是可识别的本地文件或网页地址。");
    } catch (error) {
      if (current.isDestroyed()) return;
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      const reason = code === "ENOENT" ? "本地文件不存在，可能已移动或删除。请检查知识原文中的路径。"
        : code === "EACCES" || code === "EPERM" ? "没有权限打开此文件，请检查文件访问权限。"
        : errorMessage(error);
      const reference = target.kind === "local"
        ? `${target.path}${target.line ? `\n引用位置：第 ${target.line} 行${target.column ? `，第 ${target.column} 列` : ""}` : ""}` : url;
      current.show();
      await dialog.showMessageBox(current, { type: "error", title: "无法打开链接",
        message: "无法打开链接", detail: `${reason}\n\n${reference}\n\n当前阅读页面已保留。`, buttons: ["知道了"] });
    }
  };
  current.webContents.setWindowOpenHandler(({ url }) => { void openLink(url).catch(report); return { action: "deny" }; });
  current.webContents.on("will-navigate", (event, url) => {
    if (navigationTarget(url, origin).kind !== "internal") { event.preventDefault(); void openLink(url).catch(report); }
  });
  current.webContents.on("will-redirect", (event, url) => {
    if (navigationTarget(url, origin).kind !== "internal") { event.preventDefault(); report(new Error("已阻止页面重定向到知识库页面以外的地址")); }
  });
  current.webContents.on("will-attach-webview", event => event.preventDefault());
  current.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  current.on("closed", () => { if (window === current) window = undefined; });
  await current.loadURL(origin);
}

// Tests use a separately packaged bundle/name, giving a separate userData/single-instance identity.
app.on("window-all-closed", () => { /* Closing the window deliberately keeps MCP available. */ });
app.on("activate", () => { void showWindow().catch(report); });
app.on("second-instance", () => { void showWindow().catch(report); });
app.on("before-quit", event => {
  if (mayExit) return;
  event.preventDefault();
  quitting = true;
  quitPromise ??= (async () => {
    try {
      await backend?.stop();
      await updater.dispose();
      backend?.log("app-stopped");
      mayExit = true;
      app.quit();
    } catch (error) {
      report(error);
      // Stay open when shutdown is incomplete; the updater must not replace this App.
      quitPromise = undefined;
      if (backend?.child && (backend.child.exitCode !== null || backend.child.signalCode !== null)) {
        mayExit = true;
        app.quit();
      }
    }
  })();
});

if (!app.requestSingleInstanceLock()) {
  mayExit = true;
  app.quit();
} else {
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: APP_NAME, submenu: [{ role: "about", label: `关于 ${APP_NAME}` },
        { id: "check-for-updates", label: "检查更新…", click: () => void showWindow().then(() => updater.check()).catch(report) },
        { type: "separator" }, { label: "打开知识库", click: () => void showWindow().catch(report) },
        { type: "separator" }, { label: "退出", accelerator: "Command+Q", click: () => app.quit() }] },
      { role: "editMenu" }, { role: "windowMenu" },
    ]));
    const { config, build } = await readConfiguration(process.resourcesPath);
    if (quitting) return;
    backend = new Backend(join(process.resourcesPath, "runtime"), config, build);
    backend.on("unavailable", (error: Error) => {
      ready = false;
      if (!quitting) report(error);
    });
    await backend.start();
    if (quitting) return;
    ready = true;
    await showWindow();
  }).catch(error => { if (!quitting) report(error); });
}
