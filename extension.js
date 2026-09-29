'use strict';

const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const { classifyDevice, suggestedProtocol } = require('./lib/device-db');

let output;
let status;
let extensionPath = '';

function cfg() { return vscode.workspace.getConfiguration('stcToolkit'); }
function notifySuccess(message) {
  if (cfg().get('ui.showSuccessNotifications', true)) {
    vscode.window.showInformationMessage(message);
  }
}
function root() {
  const f = vscode.workspace.workspaceFolders?.[0];
  if (!f) throw new Error('请先打开一个工程文件夹 / Open a project folder first.');
  return f.uri.fsPath;
}
function expand(s, vars) {
  if (!s) return s;
  return s.replace(/\$\{(workspaceFolder|projectFile|firmware|port|protocol|device)\}/g, (_, k) => vars[k] ?? '');
}
function quote(s) { return `"${String(s).replace(/"/g, '\\"')}"`; }

async function filesByGlob(glob) {
  const uris = await vscode.workspace.findFiles(glob, '**/{node_modules,.git}/**', 2000);
  return uris.map(u => u.fsPath);
}

async function findProject() {
  const configured = cfg().get('projectFile', '').trim();
  if (configured) {
    const p = path.isAbsolute(configured) ? configured : path.join(root(), configured);
    if (fs.existsSync(p)) return p;
  }
  const files = [...await filesByGlob('**/*.uvproj'), ...await filesByGlob('**/*.uvprojx')];
  if (!files.length) throw new Error('没有找到 .uvproj/.uvprojx / No Keil project was found.');
  if (files.length === 1) return files[0];
  const pick = await vscode.window.showQuickPick(
    files.map(f => ({ label: path.basename(f), description: path.relative(root(), f), file: f })),
    { placeHolder: '选择 Keil 工程 / Select a Keil project' }
  );
  if (!pick) throw new Error('已取消 / Cancelled.');
  return pick.file;
}

function parseProjectDevice(projectFile) {
  try {
    const text = fs.readFileSync(projectFile, 'utf8');
    const device = /<Device>([^<]+)<\/Device>/i.exec(text)?.[1]?.trim() || '';
    const target = /<TargetName>([^<]+)<\/TargetName>/i.exec(text)?.[1]?.trim() || '';
    return { device, target, ...classifyDevice(device || target) };
  } catch {
    return { device: '', target: '', ...classifyDevice('') };
  }
}

async function newestFirmware() {
  const configured = cfg().get('firmwareFile', '').trim();
  if (configured) {
    const p = path.isAbsolute(configured) ? configured : path.join(root(), configured);
    if (fs.existsSync(p)) return p;
  }
  const files = [
    ...await filesByGlob('**/*.hex'),
    ...await filesByGlob('**/*.ihx'),
    ...await filesByGlob('**/*.ihex')
  ].filter(p => fs.existsSync(p));
  if (!files.length) throw new Error('没有找到 HEX/IHX 固件 / No HEX/IHX firmware found. Build first or select a firmware file.');
  files.sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

function runShell(command, cwd, title) {
  return new Promise((resolve, reject) => {
    output.show(true);
    output.appendLine(`\n=== ${title} ===`);
    output.appendLine(`> ${command}`);
    const child = cp.spawn(command, { cwd, shell: true, windowsHide: true });
    child.stdout.on('data', d => output.append(d.toString()));
    child.stderr.on('data', d => output.append(d.toString()));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(code) : reject(new Error(`${title} failed, exit code ${code}`)));
  });
}

async function build(rebuild=false) {
  const projectFile = await findProject();
  const vars = { workspaceFolder: root(), projectFile };
  const custom = cfg().get('build.customCommand', '').trim();
  status.text = '$(sync~spin) STC Build';
  try {
    if (custom) {
      await runShell(expand(custom, vars), root(), rebuild ? 'STC Rebuild' : 'STC Build');
    } else {
      const uv4 = cfg().get('keil.uv4Path', '').trim();
      if (!uv4) throw new Error('尚未配置 UV4.exe / Configure stcToolkit.keil.uv4Path or a custom build command.');
      const flag = rebuild ? '-r' : '-b';
      await runShell(`${quote(uv4)} ${flag} ${quote(projectFile)}`, path.dirname(projectFile), rebuild ? 'Keil Rebuild' : 'Keil Build');
    }
    const fw = await newestFirmware().catch(() => null);
    status.text = fw ? `$(check) ${path.basename(fw)}` : '$(check) STC Build';
    notifySuccess(fw ? `编译完成 / Build complete: ${path.basename(fw)}` : '编译完成 / Build complete.');
    return true;
  } finally {
    if (status.text.includes('spin')) status.text = '$(chip) STC';
  }
}

async function listPorts() {
  if (process.platform === 'win32') {
    const ps = `powershell -NoProfile -Command "Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name | ConvertTo-Json -Compress"`;
    return new Promise(resolve => {
      cp.exec(ps, { windowsHide: true }, (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        try {
          const parsed = JSON.parse(stdout.trim());
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          resolve(arr.map(x => ({ port: x.DeviceID, name: x.Name || x.DeviceID })));
        } catch { resolve([]); }
      });
    });
  }
  return [];
}

async function selectPort() {
  const ports = await listPorts();
  let value;
  if (ports.length) {
    const pick = await vscode.window.showQuickPick(
      ports.map(p => ({ label:p.port, description:p.name })),
      { placeHolder:'选择 STC 下载串口 / Select STC serial port' }
    );
    if (!pick) return;
    value = pick.label;
  } else {
    value = await vscode.window.showInputBox({ prompt:'没有自动发现串口，请输入端口（例如 COM3） / Enter a serial port, e.g. COM3' });
    if (!value) return;
  }
  await cfg().update('flash.port', value, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`STC port: ${value}`);
}

async function selectFirmware() {
  const picked = await vscode.window.showOpenDialog({ canSelectMany:false, filters:{'Firmware':['hex','ihx','ihex','bin']} });
  if (!picked?.[0]) return;
  await cfg().update('firmwareFile', picked[0].fsPath, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`Firmware: ${picked[0].fsPath}`);
}

function resolveBackend(info) {
  const configured = cfg().get('flash.backend', 'auto');
  if (configured !== 'auto') return configured;
  return info.preferred || 'stcgal';
}

async function flashWithStcgal(info, firmware) {
  const exe = cfg().get('flash.stcgalPath', 'stcgal').trim() || 'stcgal';
  let protocol = cfg().get('flash.protocol', 'auto');
  if (protocol === 'auto') protocol = suggestedProtocol(info);
  const port = cfg().get('flash.port', '').trim();
  const baud = cfg().get('flash.baud', 115200);
  const autoreset = cfg().get('flash.autoreset', false);
  const args = [];
  if (protocol) args.push('-P', protocol);
  if (protocol !== 'usb15') {
    if (!port) throw new Error('尚未选择串口 / No serial port selected. Run “STC: Select Serial Port”.');
    args.push('-p', port, '-b', String(baud));
  }
  if (autoreset) args.push('-a');
  args.push(firmware);
  output.appendLine(`Backend: stcgal | Family: ${info.family} | Protocol: ${protocol}`);
  await runShell([exe, ...args.map(quote)].join(' '), root(), 'STC Flash (stcgal)');
}

async function findPython() {
  const configured = cfg().get('flash.pythonPath', '').trim();
  if (configured) return configured;
  const candidates = process.platform === 'win32' ? ['py -3', 'python', 'python3'] : ['python3', 'python'];
  for (const c of candidates) {
    const ok = await new Promise(resolve => cp.exec(`${c} --version`, { windowsHide:true }, err => resolve(!err)));
    if (ok) return c;
  }
  throw new Error('未找到 Python / Python was not found. Configure stcToolkit.flash.pythonPath.');
}

async function flashWithNativeHid(info, firmware) {
  const experimental = cfg().get('flash.nativeHidExperimental', false);
  if (!experimental) {
    throw new Error('Native HID 仍为实验功能。请在设置中启用 stcToolkit.flash.nativeHidExperimental，或使用 official 后端。 / Native HID is experimental; enable it explicitly or use the official backend.');
  }
  const python = await findPython();
  const helper = path.join(extensionPath, 'scripts', 'stc_hid_flash.py');
  const autoReset = cfg().get('flash.nativeHidAutoReset', false);
  const resetCommand = cfg().get('flash.nativeHidResetCommand', '@STCISP#');
  let cmd = `${python} ${quote(helper)} ${quote(firmware)}`;
  if (autoReset) cmd += ` --auto-reset --reset-command ${quote(resetCommand)}`;
  output.appendLine(`Backend: native-hid (experimental) | Family: ${info.family}`);
  if (info.family === 'STC32G144K246' || info.family === 'NEXT_GEN') {
    output.appendLine('NOTE: large-flash/new-generation parts are intentionally blocked by the native helper until extended addressing is verified.');
  }
  await runShell(cmd, root(), 'STC Flash (native HID)');
}

async function openOfficialIsp() {
  const exe = cfg().get('officialIspPath', '').trim();
  if (!exe || !fs.existsSync(exe)) throw new Error('请设置 stcToolkit.officialIspPath / Configure the official STC-ISP/AiCube path.');
  cp.spawn(exe, [], { detached:true, stdio:'ignore', windowsHide:false }).unref();
}

async function flashWithOfficial(info, firmware) {
  output.appendLine(`Backend: official STC-ISP/AiCube | Family: ${info.family}`);
  output.appendLine(`Firmware: ${firmware}`);
  await openOfficialIsp();
  notifySuccess('已打开官方 STC-ISP/AiCube。新版/大容量芯片目前交由官方 ISP 处理；插件保留自动后端选择和后续原生 HID 扩展接口。 / Official STC-ISP/AiCube opened for new or large-flash devices.');
}

async function flash() {
  const projectFile = await findProject().catch(() => '');
  const firmware = await newestFirmware();
  const info = projectFile ? parseProjectDevice(projectFile) : { device:'', target:'', ...classifyDevice('') };
  const backend = resolveBackend(info);
  const port = cfg().get('flash.port', '').trim();
  const protocol = cfg().get('flash.protocol', 'auto');
  const vars = { workspaceFolder: root(), projectFile, firmware, port, protocol, device: info.device || info.target || '' };

  status.text = '$(sync~spin) STC Flash';
  try {
    if (backend === 'stcgal') {
      await flashWithStcgal(info, firmware);
    } else if (backend === 'native-hid') {
      await flashWithNativeHid(info, firmware);
    } else if (backend === 'custom') {
      const tpl = cfg().get('flash.customCommand', '').trim();
      if (!tpl) throw new Error('请配置 stcToolkit.flash.customCommand / Configure custom flash command.');
      await runShell(expand(tpl, vars), root(), 'STC Flash (custom)');
    } else if (backend === 'official') {
      await flashWithOfficial(info, firmware);
      return;
    } else {
      throw new Error(`Unknown backend: ${backend}`);
    }
    status.text = `$(check) ${path.basename(firmware)}`;
    notifySuccess(`烧录完成 / Flash complete: ${path.basename(firmware)}`);
  } finally {
    if (status.text.includes('spin')) status.text = '$(chip) STC';
  }
}

async function chooseBackend() {
  const projectFile = await findProject().catch(() => '');
  const info = projectFile ? parseProjectDevice(projectFile) : { ...classifyDevice('') };
  const recommended = info.preferred || 'stcgal';
  const items = [
    { label:'Auto', description:`Recommended for detected device: ${recommended}`, value:'auto' },
    { label:'stcgal', description:'Legacy/common UART STC families', value:'stcgal' },
    { label:'Native USB HID (Experimental)', description:'Direct USB writer backend; currently limited to <=64 KiB address space', value:'native-hid' },
    { label:'Official STC-ISP / AiCube', description:'Recommended for STC32G144K246, STC33, AI8051U and other newest devices', value:'official' },
    { label:'Custom command', description:'Your own CLI / script backend', value:'custom' }
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder:`Detected: ${info.device || info.target || 'unknown'} / ${info.family}` });
  if (!pick) return;
  await cfg().update('flash.backend', pick.value, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`STC backend: ${pick.value}`);
}

async function buildFlash() {
  await build(false);
  await flash();
}

async function showInfo() {
  const p = await findProject();
  const i = parseProjectDevice(p);
  const fw = await newestFirmware().catch(()=>null);
  const backend = resolveBackend(i);
  const stcgal = suggestedProtocol(i);
  vscode.window.showInformationMessage(
    `Target: ${i.target || '-'} | Device: ${i.device || '-'} | Family: ${i.family} | Backend: ${backend} | stcgal: ${stcgal}${fw ? ` | FW: ${path.basename(fw)}` : ''}`
  );
}

function safe(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) {
      output?.appendLine(`ERROR: ${e?.stack || e}`);
      vscode.window.showErrorMessage(e?.message || String(e));
      status.text = '$(error) STC';
    }
  };
}

function activate(context) {
  extensionPath = context.extensionPath;
  output = vscode.window.createOutputChannel('STC Toolkit');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.text = '$(rocket) STC';
  status.tooltip = 'STC Toolkit — One-click Build & Flash';
  status.command = 'stcToolkit.buildFlash';
  status.show();

  const commands = {
    'stcToolkit.build': () => build(false),
    'stcToolkit.rebuild': () => build(true),
    'stcToolkit.flash': flash,
    'stcToolkit.buildFlash': buildFlash,
    'stcToolkit.selectPort': selectPort,
    'stcToolkit.selectFirmware': selectFirmware,
    'stcToolkit.selectBackend': chooseBackend,
    'stcToolkit.openOfficialIsp': openOfficialIsp,
    'stcToolkit.showInfo': showInfo
  };
  for (const [id, fn] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(id, safe(fn)));
  context.subscriptions.push(output, status);
}

function deactivate() {}
module.exports = { activate, deactivate };
