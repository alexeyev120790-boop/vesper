Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory('build') | Out-Null
 = (Resolve-Path 'public\icon-512.png').Path
 = [System.Drawing.Image]::FromFile()
 = .GetThumbnailImage(256, 256, , [IntPtr]::Zero)
 = New-Object System.IO.MemoryStream
.Save(, [System.Drawing.Imaging.ImageFormat]::Png)
 = .ToArray()
.Dispose()
.Dispose()
.Dispose()

 = [System.IO.File]::Create('build\icon.ico')
 = New-Object System.IO.BinaryWriter()
.Write([UInt16]0)
.Write([UInt16]1)
.Write([UInt16]1)
.Write([byte]0)
.Write([byte]0)
.Write([byte]0)
.Write([byte]0)
.Write([UInt16]1)
.Write([UInt16]32)
.Write([UInt32].Length)
.Write([UInt32]22)
.Write()
.Flush()
.Close()
Write-Host  build/icon.ico successfully created! Size: 22 bytes
