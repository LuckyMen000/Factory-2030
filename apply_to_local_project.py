#!/usr/bin/env python3
"""Apply React/FastAPI incident project priority-free UI + Docker/GH Actions overlay to a local clone.

Usage: python apply_patch.py /path/to/your-new-repo
The operation is safe to run twice; it does not touch local runtime data.
"""
from __future__ import annotations

import sys
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "files"


def apply(root: Path) -> None:
    root = root.resolve()
    app_path = root / "frontend/src/App.tsx"
    tests_path = root / "backend/tests/test_api.py"
    required = (app_path, tests_path, root / "frontend/package.json", root / "backend/requirements.txt")
    missing = [str(p.relative_to(root)) for p in required if not p.is_file()]
    if missing:
        raise RuntimeError(f"Source files are missing from this project. Missing: {', '.join(missing)}")

    source = app_path.read_text(encoding="utf-8")
    updated = source
    state = "const [priority,setPriority]=useState<Priority>('medium');"
    updated = updated.replace(state, "", 1)

    old_payload = "equipment_id:equipment,priority,downtime},file)"
    new_payload = "equipment_id:equipment,downtime},file)"
    updated = updated.replace(old_payload, new_payload, 1)

    old_priority_field = ('<div className="form-row"><label className="form-field">Приоритет'
                          '<select value={priority} onChange={e=>setPriority(e.target.value as Priority)}>'
                          '{Object.entries(PRIORITY).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select>'
                          '</label><div className="form-field"><span>Фотография неисправности</span>')
    new_photo_field = '<div className="form-field"><span>Фотография неисправности</span>'
    updated = updated.replace(old_priority_field, new_photo_field, 1)

    old_tail = ('<input type="file" accept="image/jpeg,image/png,image/webp" '
                'onChange={e=>setFile(e.target.files?.[0])}/></label></div></div>'
                '<label className="checkbox-row">')
    new_tail = ('<input type="file" accept="image/jpeg,image/png,image/webp" '
                'onChange={e=>setFile(e.target.files?.[0])}/></label></div>'
                '<label className="checkbox-row">')
    updated = updated.replace(old_tail, new_tail, 1)

    if source != updated:
        if ('<label className="form-field">Приоритет' in updated or
            'setPriority(' in updated[updated.index('function CreateIncident'):updated.index('function IncidentDetail')]):
            raise RuntimeError("Priority removal was partial. No files have been written.")
        if ('equipment_id:equipment,downtime},file)' not in updated or
            new_photo_field not in updated):
            raise RuntimeError("Incident form changed upstream; refusing to write a partial patch.")
    elif ('<label className="form-field">Приоритет' in source or
          "const [priority,setPriority]=useState<Priority>('medium');" in source):
        raise RuntimeError("Unexpected original UI structure: exact replacements did not match.")

    # Verify the package is complete before any writes.
    overlay_files = [p for p in SOURCE.rglob('*') if p.is_file()]
    if not any(p.name == 'docker.yml' for p in overlay_files):
        raise RuntimeError("Docker Actions workflow missing from patch bundle")

    if updated != source:
        app_path.write_text(updated, encoding="utf-8")
        print("UPDATED frontend/src/App.tsx: removed the Priority control and payload key")
    else:
        print("SKIPPED frontend/src/App.tsx: already patched")

    tests = tests_path.read_text(encoding="utf-8")
    test_name = 'def test_priority_defaults_when_not_selected():'
    if test_name not in tests:
        tests += '''\n\ndef test_priority_defaults_when_not_selected():
    # Priority no longer appears in the incident creation UI.
    c = TestClient(app)
    response = c.post(
        '/api/incidents',
        headers={'X-Demo-User': '5'},
        json={'title': 'Проверка автоматического приоритета', 'equipment_id': 3, 'downtime': False},
    )
    assert response.status_code == 201, response.text
    assert response.json()['priority'] == 'medium'
'''
        tests_path.write_text(tests, encoding="utf-8")
        print("UPDATED backend/tests/test_api.py: default priority regression test")
    else:
        print("SKIPPED backend/tests/test_api.py: test already present")

    for src in sorted(overlay_files):
        rel = src.relative_to(SOURCE)
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and src.read_bytes() == dest.read_bytes():
            print(f"SKIPPED {rel}: already up to date")
        else:
            shutil.copyfile(src, dest)
            print(f"CREATED/UPDATED {rel}")

    print("\nFiles prepared. Review changes and run `docker compose up --build -d`.")


if __name__ == "__main__":
    location = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
    try:
        apply(location)
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
