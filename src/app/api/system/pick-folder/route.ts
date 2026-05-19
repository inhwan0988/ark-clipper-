import { spawn } from 'child_process';
import { NextResponse } from 'next/server';

/**
 * Windows 모던 폴더 선택 다이얼로그 (IFileOpenDialog).
 * Vista+ 의 새로운 파일 선택 UI를 사용 (Adobe / 익스플로러와 동일한 모양).
 */
export async function POST() {
  return new Promise<NextResponse>((resolve) => {
    // C# 코드를 Add-Type으로 컴파일해서 IFileOpenDialog COM 인터페이스 호출
    const psScript = String.raw`
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace ARK {
    [ComImport]
    [Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    public class FileOpenDialog { }

    [ComImport]
    [Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr hwndOwner);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise();
        void Unadvise();
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int alignment);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter([MarshalAs(UnmanagedType.IUnknown)] object pFilter);
        void GetResults(out IntPtr ppenum);
        void GetSelectedItems(out IntPtr ppsai);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler();
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes();
        void Compare();
    }

    public static class FolderBrowser {
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        public static string Pick(string title) {
            const uint FOS_PICKFOLDERS = 0x00000020;
            const uint FOS_FORCEFILESYSTEM = 0x00000040;
            const uint FOS_NOCHANGEDIR = 0x00000008;
            const uint SIGDN_FILESYSPATH = 0x80058000;

            IFileOpenDialog dialog = (IFileOpenDialog)new FileOpenDialog();
            try {
                dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR);
                if (!string.IsNullOrEmpty(title)) {
                    dialog.SetTitle(title);
                }
                IntPtr owner = GetForegroundWindow();
                int hr = dialog.Show(owner);
                if (hr != 0) return null;
                IShellItem item;
                dialog.GetResult(out item);
                string path;
                item.GetDisplayName(SIGDN_FILESYSPATH, out path);
                return path;
            } finally {
                Marshal.ReleaseComObject(dialog);
            }
        }
    }
}
'@

$result = [ARK.FolderBrowser]::Pick("ARK Clipper - 영상 저장 폴더 선택")
if ($result) {
    [Console]::Out.WriteLine($result)
}
`.trim();

    const proc = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-Command',
      psScript,
    ], { windowsHide: true });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });

    proc.on('close', () => {
      const selectedPath = stdout.trim();
      if (selectedPath) {
        resolve(NextResponse.json({ path: selectedPath }));
      } else if (stderr) {
        console.error('[pick-folder] stderr:', stderr);
        resolve(NextResponse.json({ path: null, cancelled: false, error: stderr }));
      } else {
        resolve(NextResponse.json({ path: null, cancelled: true }));
      }
    });

    proc.on('error', (err) => {
      resolve(NextResponse.json(
        { error: err.message || stderr || 'Failed to open folder picker' },
        { status: 500 }
      ));
    });

    setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
    }, 5 * 60 * 1000);
  });
}
