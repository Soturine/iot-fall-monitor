Import("env")

import os
import subprocess
from pathlib import Path


def before_upload(source, target, env):
    if os.name != "nt":
        return

    try:
        env.AutodetectUploadPort()
    except Exception:
        pass

    upload_port = env.subst("$UPLOAD_PORT")
    if not upload_port or upload_port == "$UPLOAD_PORT":
        print("Pre-upload: nenhuma porta serial resolvida; limpeza automatica ignorada.")
        return

    script_path = Path(env["PROJECT_DIR"]) / "scripts" / "free-serial-port.ps1"
    if not script_path.exists():
        print(f"Pre-upload: helper de serial nao encontrado em {script_path}.")
        return

    command = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script_path),
        "-Port",
        upload_port,
    ]

    print(f"Pre-upload: liberando {upload_port} antes da gravacao...")
    result = subprocess.run(command, cwd=env["PROJECT_DIR"], check=False)
    if result.returncode != 0:
        print(
            f"Pre-upload: limpeza automatica da porta retornou codigo {result.returncode}. "
            "O upload ainda sera tentado."
        )


env.AddPreAction("upload", before_upload)
