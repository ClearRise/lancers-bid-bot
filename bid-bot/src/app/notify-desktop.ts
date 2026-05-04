import { spawn } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { platform } from "node:process";
import { config } from "../core/config.js";

type BidDesktopNotificationInput = {
  taskUrl: string;
  title: string;
  status: "submitted" | "failed" | "skipped";
  budgetMinJpy: number | null;
  budgetMaxJpy: number | null;
  reason?: string;
};

function formatBudgetLine(minJpy: number | null, maxJpy: number | null): string | null {
  if (minJpy == null || maxJpy == null) return null;
  return `${Math.max(1, Math.round(minJpy / 1000))}~${Math.max(1, Math.round(maxJpy / 1000))}`;
}

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

function buildNotificationLines(notifyInput: BidDesktopNotificationInput): { line1: string; line2: string } {
  const statusLabel =
    notifyInput.status === "submitted"
      ? "Done"
      : notifyInput.status === "failed"
        ? "Failed"
        : "Skipped";
  const budgetRange = formatBudgetLine(notifyInput.budgetMinJpy, notifyInput.budgetMaxJpy);
  const line1 =
    (budgetRange
      ? `${statusLabel} ・ Fix API issues (${budgetRange})`
      : `${statusLabel} ・ Fix API issues`).slice(0, 140);
  const line2 = "Open Cursor to view the agent's output.";
  return { line1, line2 };
}

async function runPowerShellScript(psScript: string): Promise<void> {
  const tmpPs1 = path.join(tmpdir(), `__bid-bot-toast-${Date.now()}.ps1`);
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
        // ignore cleanup error
      }
      reject(err);
    });
    child.on("close", (code) => {
      try {
        unlinkSync(tmpPs1);
      } catch {
        // ignore cleanup error
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

async function showBalloonNotification(line1: string, line2: string, taskUrl: string): Promise<void> {
  const line1Escaped = escapePsSingleQuoted(line1);
  const line2Escaped = escapePsSingleQuoted(line2);
  const taskUrlEscaped = escapePsSingleQuoted(taskUrl);
  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.BalloonTipTitle = '${line1Escaped}'
$notify.BalloonTipText = '${line2Escaped}'
$url = '${taskUrlEscaped}'
$clicked = $false
$notify.add_BalloonTipClicked({
  try {
    [System.Windows.Forms.Clipboard]::SetText($url)
  } catch { }
  $script:clicked = $true
})
$notify.ShowBalloonTip(5000)
for ($i = 0; $i -lt 60; $i++) {
  [System.Windows.Forms.Application]::DoEvents()
  if ($script:clicked) { break }
  Start-Sleep -Milliseconds 100
}
$notify.Dispose()
exit 0
`;
  await runPowerShellScript(psScript);
}

async function showWinRtToast(line1: string, line2: string): Promise<void> {
  const line1Xml = escapeXml(line1);
  const line2Xml = escapeXml(line2);
  const xml = `<toast><visual><binding template="ToastText02"><text id="1">${line1Xml}</text><text id="2">${line2Xml}</text></binding></visual></toast>`;
  const xmlEscaped = escapePsSingleQuoted(xml);
  const appIdEscaped = escapePsSingleQuoted(config.windowsToastAppId);
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

export async function notifyBidResult(notifyInput: BidDesktopNotificationInput): Promise<void> {
  if (!config.desktopNotification) return;
  if (platform !== "win32") return;

  const { line1, line2 } = buildNotificationLines(notifyInput);
  try {
    await showWinRtToast(line1, line2);
  } catch (error) {
    console.warn("[notify] toast path failed, fallback to balloon", error);
    await showBalloonNotification(line1, line2, notifyInput.taskUrl);
  }
}
