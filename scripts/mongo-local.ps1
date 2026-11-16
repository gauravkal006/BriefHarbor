$ErrorActionPreference = 'Stop'
$container = 'briefharbor-mongo'
$volume = 'briefharbor-mongo-data'

docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and select Linux containers first.' }
$existing = docker ps -a --format '{{.Names}}' --filter "name=^/$container$"
if ($LASTEXITCODE -ne 0) { throw 'Could not list Docker containers.' }
if ($existing -eq $container) {
    docker start $container | Out-Null
} else {
    docker run -d --name $container -p 127.0.0.1:27017:27017 -v "${volume}:/data/db" mongo:8.0 --replSet rs0 --bind_ip_all | Out-Null
}
if ($LASTEXITCODE -ne 0) { throw 'Could not start the BriefHarbor MongoDB container.' }

$initialized = $false
for ($i = 0; $i -lt 30; $i++) {
    docker exec $container mongosh --quiet --eval 'try { rs.status(); } catch (error) { if (error.code !== 94) throw error; rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]}); }' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $initialized = $true; break }
    Start-Sleep -Seconds 2
}
if (!$initialized) { throw 'MongoDB did not initialize. Check docker logs briefharbor-mongo.' }
for ($i = 0; $i -lt 30; $i++) {
    docker exec $container mongosh --quiet --eval 'if (!db.hello().isWritablePrimary) quit(1)' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Output 'MongoDB replica set rs0 is accepting writes on localhost:27017.'
        exit 0
    }
    Start-Sleep -Seconds 2
}
throw 'MongoDB did not elect a primary. Check docker logs briefharbor-mongo.'
