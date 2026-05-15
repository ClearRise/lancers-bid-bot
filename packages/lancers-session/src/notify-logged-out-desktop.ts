import { spawn } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { platform } from "node:process";
import { LOGGED_OUT_DESKTOP_MESSAGE } from "./constants.js";

function escapePsSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function runPowerShellScript(psScript: string): Promise<void> {
  const tmpPs1 = path.join(tmpdir(), `__lancers-session-toast-${Date.now()}.ps1`);
  writeFileSync(tmpPs1, `\uFEFF${psScript}`, "utf8");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-File", tmpPs1],
      { windowsHide: true },
    );
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      try {
        unlinkSync(tmpPs1);
      } catch {
        /* ignore */
      }
      reject(err);
    });
    child.on("close", (code) => {
      try {
        unlinkSync(tmpPs1);
      } catch {
        /* ignore */
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `desktop notification failed exit=${code} stdout=${stdout.slice(0, 500)} stderr=${stderr.slice(0, 500)}`.trim(),
        ),
      );
    });
  });
}

async function showWinRtToast(line1: string, line2: string, appId: string): Promise<void> {
  const line1Xml = escapeXml(line1);
  const line2Xml = escapeXml(line2);
  const xml = `<toast><visual><binding template="ToastText02"><text id="1">${line1Xml}</text><text id="2">${line2Xml}</text></binding></visual></toast>`;
  const xmlEscaped = escapePsSingleQuoted(xml);
  const appIdEscaped = escapePsSingleQuoted(appId);
  const psScript = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml('${xmlEscaped}')
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${appIdEscaped}').Show($toast)
exit 0
`;
  await runPowerShellScript(psScript);
}

/** Windows toast: title and body both use `LOGGED_OUT_DESKTOP_MESSAGE` when body is omitted. */
export async function notifyLoggedOutDesktop(options: {
  enabled: boolean;
  appId: string;
  logPrefix: string;
}): Promise<void> {
  if (!options.enabled || platform !== "win32") return;
  const msg = LOGGED_OUT_DESKTOP_MESSAGE;
  try {
    await showWinRtToast(msg, msg, options.appId);
  } catch (err) {
    console.warn(`${options.logPrefix} desktop notification failed`, err);
  }
}
