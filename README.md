# Factory 2030 — H1 QR Maintenance MVP

Веб-прототип конкурсной гипотезы H1: регистрация неисправностей через QR-код оборудования. Цель сократить время передачи заявки на 50% — проверяемая гипотеза, а не достигнутый результат.

## Локальный запуск с Docker

```bash
docker compose up --build -d
docker compose ps
```

Frontend: http://localhost:8080  ·  API / Swagger: http://localhost:8000/docs  ·  API health: http://localhost:8000/api/health

Остановка: `docker compose down`. База SQLite сохраняется в Docker volume `maintenance-db` (не используйте `down -v`, если хотите сохранить заявки).

## Локальный запуск без Docker

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

В отдельном терминале:

```bash
cd frontend
npm ci
npm run dev
```

## CI и GitHub Pages

- Workflow `.github/workflows/docker.yml` проверяет сборку frontend, запускает API-тесты и публикует контейнеры в GHCR после успешного push в `main`.
- Workflow `.github/workflows/pages.yml` собирает статический frontend с `base=/Factory-2030/` и разворачивает на https://luckymen000.github.io/Factory-2030/.
- Для GitHub Pages необходимо один раз выбрать **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- **Внимание:** GitHub Pages не запускает FastAPI/SQLite. Без отдельного публичного backend страница отобразится, но загрузка оборудования и создание заявок работать не будут.
- После размещения backend на HTTPS установите переменную репозитория `VITE_API_URL` в **Settings → Secrets and variables → Actions → Variables**, а на сервере настройте `CORS_ORIGINS` на `https://luckymen000.github.io`. Внесите изменения в репозиторий или перезапустите Pages workflow, чтобы пересобрать сайт с адресом API.
- MVP не имеет авторизации. **Не публикуйте backend в открытый интернет без аутентификации, ограничений доступа и проверки безопасности.** Для полноценной демонстрации с данными безопаснее использовать Docker на закрытом сервере или в локальной сети.

## Процесс

QR → мобильная форма → заявка → статусы → измерение длительности регистрации. Первоначально создаются 4 демонстрационных станка.
