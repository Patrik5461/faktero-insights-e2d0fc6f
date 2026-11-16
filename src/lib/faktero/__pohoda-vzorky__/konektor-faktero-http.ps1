param([string]$Url, [string]$Kluc, [string]$Vystup, [string]$Subor, [string]$Text)
# Faktero - HTTPS pre faktero-pohoda.cmd. Nemente.
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
$h = @{ Authorization = "Bearer $Kluc" }
try {
  if ($Subor) {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url -Headers $h -ContentType 'text/xml' -InFile $Subor
  } elseif ($PSBoundParameters.ContainsKey('Text')) {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url -Headers $h -ContentType 'text/xml' -Body ([Text.Encoding]::UTF8.GetBytes($Text))
  } else {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $h -OutFile $Vystup -PassThru
  }
  [int]$r.StatusCode
} catch {
  if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}
