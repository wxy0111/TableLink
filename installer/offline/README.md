# TableLink Offline Installer

This folder builds a Windows self-extracting offline installer for store trial deployment.

The generated installer includes:

- The `TableLink-store-trial-2026-06-20` application package.
- A portable Node.js/npm runtime copied from the local machine.
- The local npm cache for offline `npm install`.
- A saved `postgres:17-alpine` Docker image tar, when Docker is running locally.
- Bootstrap scripts that install TableLink under the current user's local app data folder.

It does not bundle Docker Desktop by default. Docker Desktop cannot be made portable by copying
an installed folder. To bundle the official installer, place it at:

```txt
installer/offline/third-party/Docker Desktop Installer.exe
```

or pass:

```powershell
$env:DOCKER_DESKTOP_INSTALLER='C:\path\to\Docker Desktop Installer.exe'
```

before running the build script.

Build:

```powershell
powershell -ExecutionPolicy Bypass -File installer\offline\build-offline-installer.ps1
```

Output:

```txt
installer/out/TableLink-offline-store-trial-2026-06-20.exe
```

