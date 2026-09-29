'use strict';

const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

let output;
let status;

function cfg() { return vscode.workspace.getConfiguration('stcToolkit'); }
function root() {
  const f = vscode.workspace.workspaceFolders?.[0];
  if (!f) throw new Error('请先打开一个工程文件夹。');
  return f.uri.fsPath;
}
function expand(s, vars) {
  if (!s) return s;
  return s.replace(/\$\{(workspaceFolder|projectFile|firmware|port|protocol)\}/g, (_, k) => vars[k] ?? '');
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
  if (!files.length) throw new Error('没有找到 .uvproj/.uvprojx。可在设置中指定 stcToolkit.projectFile。');
  if (files.length === 1) return files[0];
  const pick = await vscode.window.showQuickPick(files.map(f => ({ label: path.basename(f), description: path.relative(root(), f), file: f })), { placeHolder: '选择 Keil 工程' });
  if (!pick) throw new Error('已取消。');
  return pick.file;
}

function parseProjectDevice(projectFile) {
  try {
    const text = fs.readFileSync(projectFile, 'utf8');
    const device = /<Device>([^<]+)<\/Device>/i.exec(text)?.[1]?.trim() || '';
    const target = /<TargetName>([^<]+)<\/TargetName>/i.exec(text)?.[1]?.trim() || '';
    return { device, target, family: classifyFamily(device || target) };
  } catch { return { device: '', target: '', family: 'unknown' }; }
}

function classifyFamily(name) {
  const n = String(name).toUpperCase();
  if (/STC32/.test(n)) return 'STC32';
  if (/STC8G|STC8H/.test(n)) return 'STC8G/H';
  if (/STC8/.test(n)) return 'STC8';
  if (/STC15/.test(n)) return 'STC15';
  if (/STC1[012]/.test(n)) return 'STC10/11/12';
  if (/STC8[9-9]|STC89|STC90/.test(n)) return 'STC89/90';
  return 'unknown';
}

function suggestedProtocol(family) {
  return ({
    'STC32': 'stc8d',
    'STC8G/H': 'stc8g',
    'STC8': 'stc8d',
    'STC15': 'stc15',
    'STC10/11/12': 'stc12',
    'STC89/90': 'stc89'
  })[family] || 'auto';
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
  if (!files.length) throw new Error('没有找到 HEX/IHX 固件。请先编译或执行 “STC: Select Firmware File”。');
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
    child.on('close', code => code === 0 ? resolve(code) : reject(new Error(`${title} 失败，退出码 ${code}`)));
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
      if (!uv4) throw new Error('尚未配置 UV4.exe。请设置 stcToolkit.keil.uv4Path，或配置自定义 Build 命令。');
      const flag = rebuild ? '-r' : '-b';
      await runShell(`${quote(uv4)} ${flag} ${quote(projectFile)}`, path.dirname(projectFile), rebuild ? 'Keil Rebuild' : 'Keil Build');
    }
    const fw = await newestFirmware().catch(() => null);
    status.text = fw ? `$(check) ${path.basename(fw)}` : '$(check) STC Build';
    vscode.window.showInformationMessage(fw ? `编译完成：${path.basename(fw)}` : '编译完成。');
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
  const candidates = ['/dev/ttyUSB*','/dev/ttyACM*','/dev/cu.*'];
  return candidates.map(p => ({port:p,name:p}));
}

async function selectPort() {
  const ports = await listPorts();
  let value;
  if (ports.length) {
    const pick = await vscode.window.showQuickPick(ports.map(p => ({ label:p.port, description:p.name })), { placeHolder:'选择 STC 下载串口' });
    if (!pick) return;
    value = pick.label;
  } else {
    value = await vscode.window.showInputBox({ prompt:'没有自动发现串口，请输入端口（例如 COM3）' });
    if (!value) return;
  }
  await cfg().update('flash.port', value, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`STC 下载端口：${value}`);
}

async function selectFirmware() {
  const picked = await vscode.window.showOpenDialog({ canSelectMany:false, filters:{'Firmware':['hex','ihx','ihex','bin']} });
  if (!picked?.[0]) return;
  await cfg().update('firmwareFile', picked[0].fsPath, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`固件：${picked[0].fsPath}`);
}

async function flash() {
  const projectFile = await findProject().catch(() => '');
  const firmware = await newestFirmware();
  const info = projectFile ? parseProjectDevice(projectFile) : { family:'unknown', device:'', target:'' };
  const backend = cfg().get('flash.backend', 'stcgal');
  let protocol = cfg().get('flash.protocol', 'auto');
  if (protocol === 'auto' && info.family !== 'unknown') protocol = suggestedProtocol(info.family);
  const port = cfg().get('flash.port', '').trim();
  const vars = { workspaceFolder: root(), projectFile, firmware, port, protocol };

  status.text = '$(sync~spin) STC Flash';
  try {
    if (backend === 'stcgal') {
      const exe = cfg().get('flash.stcgalPath', 'stcgal').trim() || 'stcgal';
      const baud = cfg().get('flash.baud', 115200);
      const autoreset = cfg().get('flash.autoreset', false);
      const args = [];
      if (protocol) args.push('-P', protocol);
      if (protocol !== 'usb15') {
        if (!port) throw new Error('尚未选择串口。运行 “STC: Select Serial Port”。');
        args.push('-p', port, '-b', String(baud));
      }
      if (autoreset) args.push('-a');
      args.push(firmware);
      const cmd = [exe, ...args.map(quote)].join(' ');
      output.appendLine(`设备族：${info.family}${info.device ? ` / ${info.device}` : ''}`);
      output.appendLine(`协议：${protocol}`);
      if (info.family === 'STC32') {
        output.appendLine('提示：stcgal 文档将 STC32 映射到 stc8d，但具体新型号是否已收录取决于 stcgal 版本。');
      }
      await runShell(cmd, root(), 'STC Flash (stcgal)');
    } else if (backend === 'custom') {
      const tpl = cfg().get('flash.customCommand', '').trim();
      if (!tpl) throw new Error('请配置 stcToolkit.flash.customCommand。');
      await runShell(expand(tpl, vars), root(), 'STC Flash (custom)');
    } else {
      await openOfficialIsp();
      vscode.window.showWarningMessage('已启动官方 STC-ISP。当前官方后端仅负责启动软件，不模拟未公开的 STC-ISP GUI 操作。');
      return;
    }
    status.text = `$(check) ${path.basename(firmware)}`;
    vscode.window.showInformationMessage(`烧录完成：${path.basename(firmware)}`);
  } finally {
    if (status.text.includes('spin')) status.text = '$(chip) STC';
  }
}

async function openOfficialIsp() {
  const exe = cfg().get('officialIspPath', '').trim();
  if (!exe || !fs.existsSync(exe)) throw new Error('请设置 stcToolkit.officialIspPath。');
  cp.spawn(exe, [], { detached:true, stdio:'ignore', windowsHide:false }).unref();
}

async function buildFlash() {
  await build(false);
  await flash();
}

async function showInfo() {
  const p = await findProject();
  const i = parseProjectDevice(p);
  const fw = await newestFirmware().catch(()=>null);
  const suggested = suggestedProtocol(i.family);
  vscode.window.showInformationMessage(`Target: ${i.target || '-'} | Device: ${i.device || '-'} | Family: ${i.family} | stcgal: ${suggested}${fw ? ` | FW: ${path.basename(fw)}` : ''}`);
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
  output = vscode.window.createOutputChannel('STC Toolkit');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.text = '$(chip) STC';
  status.tooltip = 'STC Toolkit — 点击执行 Build & Flash';
  status.command = 'stcToolkit.buildFlash';
  status.show();

  const commands = {
    'stcToolkit.build': () => build(false),
    'stcToolkit.rebuild': () => build(true),
    'stcToolkit.flash': flash,
    'stcToolkit.buildFlash': buildFlash,
    'stcToolkit.selectPort': selectPort,
    'stcToolkit.selectFirmware': selectFirmware,
    'stcToolkit.openOfficialIsp': openOfficialIsp,
    'stcToolkit.showInfo': showInfo
  };
  for (const [id, fn] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(id, safe(fn)));
  context.subscriptions.push(output, status);
}

function deactivate() {}
module.exports = { activate, deactivate };
