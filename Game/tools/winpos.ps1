# Usage: winpos.ps1 [-Move] [-Screen DISPLAY3]  - prints/moves the DOSBox window
param([switch]$Move, [string]$Screen = "")
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W {
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
 public struct RECT { public int L,T,R,B; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Screen]::AllScreens | % { "{0} {1}" -f $_.DeviceName,$_.Bounds }
$p = Get-Process dosbox -ErrorAction SilentlyContinue | ? MainWindowHandle -ne 0 | select -First 1
if (!$p) { "no dosbox window"; exit }
$r = New-Object W+RECT; [W]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
"dosbox: {0},{1} - {2},{3}" -f $r.L,$r.T,$r.R,$r.B
if ($Move) {
  $s = [System.Windows.Forms.Screen]::AllScreens | ? DeviceName -like "*$Screen" | select -First 1
  $w = $r.R-$r.L; $h = $r.B-$r.T
  $x = $s.Bounds.X + [int](($s.Bounds.Width-$w)/2); $y = $s.Bounds.Y + [int](($s.Bounds.Height-$h)/2)
  [W]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, $x, $y, 0, 0, 0x0001 -bor 0x0004) | Out-Null
  "moved to $x,$y on $($s.DeviceName)"
}
