"""H1 QR Maintenance MVP — a self-contained FastAPI + SQLite demonstration."""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
import os
import sqlite3

import qrcode
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
DB_FILE = Path(os.getenv("DB_PATH", str(APP_DIR / "maintenance.db")))
STATUSES = {"new", "accepted", "in_progress", "resolved", "closed"}

app = FastAPI(title="H1 — QR Maintenance API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db():
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    return connection


def rows(query: str, params: tuple = ()): 
    with db() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def single(query: str, params: tuple = ()): 
    with db() as conn:
        row = conn.execute(query, params).fetchone()
        return dict(row) if row else None


@app.on_event("startup")
def init_db():
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL, line TEXT NOT NULL, location TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id INTEGER NOT NULL REFERENCES equipment(id),
            title TEXT NOT NULL, description TEXT NOT NULL,
            priority TEXT NOT NULL CHECK(priority IN ('low','medium','high','critical')),
            reporter TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
            opened_at TEXT NOT NULL, created_at TEXT NOT NULL,
            registration_seconds INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)
        count = conn.execute("SELECT COUNT(*) FROM equipment").fetchone()[0]
        if not count:
            conn.executemany(
                "INSERT INTO equipment (code,name,line,location,created_at) VALUES (?,?,?,?,?)",
                [
                    ("CNC-001", "Фрезерный станок CNC", "Линия 1", "Цех А · участок 01", now_iso()),
                    ("CNV-002", "Конвейерная линия", "Линия 2", "Цех А · участок 02", now_iso()),
                    ("PRS-003", "Гидравлический пресс", "Линия 1", "Цех Б · участок 03", now_iso()),
                    ("PMP-004", "Насосная станция", "Линия 3", "Цех Б · участок 04", now_iso()),
                ],
            )


class EquipmentCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=140)
    line: str = Field(min_length=1, max_length=90)
    location: str = Field(min_length=1, max_length=120)


class TicketCreate(BaseModel):
    equipment_id: int
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(min_length=3, max_length=2000)
    priority: str = "medium"
    reporter: str = Field(min_length=2, max_length=100)
    opened_at: datetime


class StatusUpdate(BaseModel):
    status: str


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "H1 QR Maintenance MVP"}


@app.get("/api/equipment")
def list_equipment():
    return rows("""SELECT e.*, (SELECT COUNT(*) FROM tickets t WHERE t.equipment_id=e.id AND t.status NOT IN ('resolved','closed')) AS active_tickets
            FROM equipment e ORDER BY e.id DESC""")


@app.get("/api/equipment/{equipment_id}")
def get_equipment(equipment_id: int):
    result = single("SELECT * FROM equipment WHERE id=?", (equipment_id,))
    if not result:
        raise HTTPException(404, "Оборудование не найдено")
    return result


@app.post("/api/equipment", status_code=201)
def create_equipment(payload: EquipmentCreate):
    try:
        with db() as conn:
            cursor = conn.execute(
                "INSERT INTO equipment (code,name,line,location,created_at) VALUES (?,?,?,?,?)",
                (payload.code.strip(), payload.name.strip(), payload.line.strip(), payload.location.strip(), now_iso()),
            )
            new_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Оборудование с таким кодом уже существует")
    return get_equipment(new_id)


@app.get("/api/equipment/{equipment_id}/qr")
def equipment_qr(equipment_id: int, base_url: str = "http://localhost:5173"):
    get_equipment(equipment_id)
    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(400, "Недопустимый адрес приложения")
    url = f"{base_url.rstrip('/')}/scan/{equipment_id}"
    buffer = BytesIO()
    img = qrcode.make(url)
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="image/png", headers={"Content-Disposition": f'inline; filename="equipment-{equipment_id}.png"'})


@app.get("/api/tickets")
def list_tickets():
    return rows("""SELECT t.*,e.name AS equipment_name,e.code AS equipment_code,e.line
        FROM tickets t JOIN equipment e ON e.id=t.equipment_id ORDER BY t.created_at DESC,t.id DESC""")


@app.post("/api/tickets", status_code=201)
def create_ticket(payload: TicketCreate):
    if payload.priority not in {"low", "medium", "high", "critical"}:
        raise HTTPException(422, "Неподдерживаемый приоритет")
    get_equipment(payload.equipment_id)
    if payload.opened_at.tzinfo is None:
        raise HTTPException(422, "Время открытия формы должно содержать часовой пояс")
    opened = payload.opened_at.astimezone(timezone.utc)
    created = datetime.now(timezone.utc)
    elapsed = max(0, min(86400, round((created - opened).total_seconds())))
    stamp = created.isoformat()
    with db() as conn:
        cur = conn.execute(
            """INSERT INTO tickets (equipment_id,title,description,priority,reporter,status,opened_at,created_at,registration_seconds,updated_at)
            VALUES (?,?,?,?,?,'new',?,?,?,?)""",
            (payload.equipment_id, payload.title.strip(), payload.description.strip(), payload.priority,
             payload.reporter.strip(), opened.isoformat(), stamp, elapsed, stamp),
        )
        ticket_id = cur.lastrowid
    return single("SELECT * FROM tickets WHERE id=?", (ticket_id,))


@app.patch("/api/tickets/{ticket_id}/status")
def change_status(ticket_id: int, payload: StatusUpdate):
    if payload.status not in STATUSES:
        raise HTTPException(422, "Некорректный статус")
    with db() as conn:
        cur = conn.execute("UPDATE tickets SET status=?,updated_at=? WHERE id=?", (payload.status,now_iso(),ticket_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Заявка не найдена")
    return single("SELECT * FROM tickets WHERE id=?", (ticket_id,))


@app.get("/api/stats")
def stats():
    summary = single("""SELECT COUNT(*) AS total,
       SUM(CASE WHEN status NOT IN ('resolved','closed') THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) AS completed,
       AVG(registration_seconds) AS avg_seconds
       FROM tickets""") or {}
    return {
        "equipment": single("SELECT COUNT(*) AS total FROM equipment")["total"],
        "tickets_total": summary["total"] or 0,
        "tickets_active": summary["active"] or 0,
        "tickets_completed": summary["completed"] or 0,
        "avg_registration_seconds": round(summary["avg_seconds"] or 0),
        "goal_reduction_pct": 50,
        "note": "−50% — целевая гипотеза, а не измеренный результат. Для сравнения нужен базовый замер до внедрения."
    }
