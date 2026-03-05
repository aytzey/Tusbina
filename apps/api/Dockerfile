FROM python:3.12-slim

WORKDIR /app
ARG APP_GIT_SHA=unknown
ENV APP_GIT_SHA=${APP_GIT_SHA}

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
RUN printf '%s\n' "${APP_GIT_SHA}" > /app/.build_commit && mkdir -p /app/data/uploads

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
