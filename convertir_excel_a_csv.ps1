Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "Selecciona uno o varios archivos Excel para convertir a CSV"
$dialog.Filter = "Archivos Excel (*.xlsx;*.xls)|*.xlsx;*.xls"
$dialog.Multiselect = $true

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Host "No se seleccionaron archivos."
  exit
}

$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  foreach ($path in $dialog.FileNames) {
    $source = Get-Item -LiteralPath $path
    $outputDir = Join-Path $source.DirectoryName "CSV_CONVERTIDOS"
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($source.Name)
    $output = Join-Path $outputDir ($baseName + ".csv")

    Write-Host "Convirtiendo: $($source.Name)"
    $workbook = $excel.Workbooks.Open($source.FullName)
    $workbook.Worksheets.Item(1).Activate() | Out-Null
    $workbook.SaveAs($output, 62)
    $workbook.Close($false)
    Write-Host "CSV creado: $output"
  }
} catch {
  Write-Host "Error al convertir: $($_.Exception.Message)"
} finally {
  if ($excel -ne $null) {
    $excel.Quit()
  }
}

Write-Host ""
Write-Host "Listo. Revisa la carpeta CSV_CONVERTIDOS junto a tus archivos Excel."
